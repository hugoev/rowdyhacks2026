import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createVault, decodeVault, resolveVault, vaultAddress } from '../lib/solana-wire';
import { DEVNET_GENESIS, SolanaVault } from '../server/solana';
import { Store } from '../server/store';

const local = process.argv.includes('--local-smoke');
const smoke = local || process.argv.includes('--smoke');
const url = local ? 'http://127.0.0.1:8899' : process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const programValue = local ? '7tAtPeAt8hYmiJbZYuTSPfVKT2kciPFBWSnT58FGki5K' : process.env.SOLANA_PROGRAM_ID;
if (!programValue) throw new Error('Set SOLANA_PROGRAM_ID after deploying the escrow program.');
const program = new PublicKey(programValue);
const connection = new Connection(url, { commitment: 'confirmed', disableRetryOnRateLimit: true, fetch: (endpoint, options) => fetch(endpoint, { ...options, signal: AbortSignal.timeout(15000) }) });
try {
  const genesis = await connection.getGenesisHash();
  if (!local) assert.equal(genesis, DEVNET_GENESIS, 'Refusing non-devnet transactions');
  assert.equal((await connection.getAccountInfo(program))?.executable, true, 'Escrow program must be deployed');
  if (!smoke) console.log(JSON.stringify({ cluster: 'devnet', program: program.toBase58(), executable: true }));
  else {
    const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync('.solana-private/deployer.json', 'utf8'))));
    const guardian = Keypair.generate(), recipient = Keypair.generate().publicKey;
    if (local) { const signature = await connection.requestAirdrop(payer.publicKey, 1e9); await connection.confirmTransaction(signature, 'confirmed'); }
    assert.ok(await connection.getBalance(payer.publicKey) >= 10_000_000, 'Fund the devnet deployment wallet first');
    const transact = async (ix: Parameters<Transaction['add']>[0], signatures: Keypair[] = [payer]) => {
      const tx = new Transaction().add(ix); return sendAndConfirmTransaction(connection, tx, signatures, { commitment: 'confirmed', skipPreflight: false, maxRetries: 2 });
    };
    const blockTime = await connection.getBlockTime(await connection.getSlot());
    const unlock = (blockTime || Math.floor(Date.now() / 1000)) + 86460;
    const amount = 1_000_000;
    let assertions = 0;
    const refundedHash = createHash('sha256').update(randomUUID()).digest(); const refunded = vaultAddress(program, payer.publicKey, refundedHash);
    const deposit = await transact(createVault(program, payer.publicKey, guardian.publicKey, recipient, refundedHash, amount, unlock));
    assert.equal(decodeVault((await connection.getAccountInfo(refunded))!.data).status, 'held'); assertions++;
    await assert.rejects(transact(resolveVault(program, payer.publicKey, refunded, recipient, false))); assertions++;
    await assert.rejects(transact(resolveVault(program, payer.publicKey, refunded, payer.publicKey, true))); assertions++;
    await assert.rejects(transact(resolveVault(program, guardian.publicKey, refunded, recipient, true), [payer, guardian])); assertions++;
    const before = await connection.getBalance(refunded);
    const refund = await transact(resolveVault(program, guardian.publicKey, refunded, payer.publicKey, true), [payer, guardian]);
    assert.equal(decodeVault((await connection.getAccountInfo(refunded))!.data).status, 'refunded'); assertions++;
    assert.equal(before - await connection.getBalance(refunded), amount); assertions++;
    await assert.rejects(transact(resolveVault(program, guardian.publicKey, refunded, payer.publicKey, true), [payer, guardian])); assertions++;
    const approvedHash = createHash('sha256').update(randomUUID()).digest(); const approved = vaultAddress(program, payer.publicKey, approvedHash);
    await transact(createVault(program, payer.publicKey, guardian.publicKey, recipient, approvedHash, amount, unlock));
    const release = await transact(resolveVault(program, guardian.publicKey, approved, recipient, false), [payer, guardian]);
    assert.equal(decodeVault((await connection.getAccountInfo(approved))!.data).status, 'released'); assertions++;
    assert.equal(await connection.getBalance(recipient), amount); assertions++;
    const prefundedHash = createHash('sha256').update(randomUUID()).digest(); const prefunded = vaultAddress(program, payer.publicKey, prefundedHash);
    await transact(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: prefunded, lamports: 1_000_000 }));
    await transact(createVault(program, payer.publicKey, guardian.publicKey, recipient, prefundedHash, amount, unlock));
    assert.equal(decodeVault((await connection.getAccountInfo(prefunded))!.data).status, 'held'); assertions++;
    await transact(resolveVault(program, guardian.publicKey, prefunded, payer.publicKey, true), [payer, guardian]);
    assert.equal(decodeVault((await connection.getAccountInfo(prefunded))!.data).status, 'refunded'); assertions++;
    // Exercise the same backend adapter used by Vultr, with a test-only genesis
    // response for the isolated validator. No environment flag bypasses production's
    // real genesis check. Devnet smoke uses the actual network response unchanged.
    if (local) connection.getGenesisHash = async () => DEVNET_GENESIS;
    const store = new Store(':memory:');
    try {
      const broker = new SolanaVault(store, { SOLANA_PROGRAM_ID: program.toBase58(), SOLANA_GUARDIAN_PUBLIC_KEY: guardian.publicKey.toBase58(), SOLANA_RECIPIENT_PUBLIC_KEY: recipient.toBase58(), SOLANA_KEYPAIR_PATH: '.solana-private/deployer.json' }, connection);
      const payment = store.createPayment({ payee: 'Synthetic adapter fixture', amount: 2500, rail: 'gift-card', newPayee: true }); broker.attach(payment);
      await broker.sync(); assert.equal(payment.escrow?.state, 'held'); assertions++;
      assert.throws(() => store.decidePayment(payment.id, 'approve')); assertions++;
      const prepared = await broker.prepare(payment.id, 'deny');
      const tx = Transaction.from(Buffer.from(prepared.transaction, 'base64')); tx.partialSign(guardian);
      await broker.submit(prepared.token, tx.serialize().toString('base64'));
      assert.equal(payment.status, 'denied'); assertions++;
      assert.equal(payment.escrow?.state, 'refunded'); assertions++;
      broker.stop();
    } finally { store.db.close(); }
    console.log(JSON.stringify({ cluster: local ? 'isolated-validator' : 'devnet', program: program.toBase58(), assertions, deposit, refund, release, syntheticGuardian: true }));
  }
} catch {
  // Do not print raw RPC errors: private endpoint credentials may appear there.
  console.error('Solana verification failed. Check the selected network, deployed program, funded devnet wallet, and RPC availability.'); process.exitCode = 1;
}
