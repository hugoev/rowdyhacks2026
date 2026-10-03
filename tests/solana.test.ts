import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { createVault, decodeVault, resolveVault, vaultAddress, VAULT_SIZE } from '../lib/solana-wire';
import { checkSignedIntent, SolanaVault } from '../server/solana';
import { Store, DAY } from '../server/store';

test('escrow wire format uses deterministic PDA and exact independent signer accounts', () => {
  const program = Keypair.generate().publicKey, payer = Keypair.generate().publicKey, guardian = Keypair.generate().publicKey, recipient = Keypair.generate().publicKey;
  const hash = Buffer.alloc(32, 7);
  const ix = createVault(program, payer, guardian, recipient, hash, 1_000_000, 100000);
  assert.equal(ix.data.length, 113); assert.equal(ix.data.readBigUInt64LE(33), 1_000_000n);
  assert.ok(ix.keys[1].pubkey.equals(vaultAddress(program, payer, hash)));
  assert.ok(ix.keys[2].pubkey.equals(SystemProgram.programId));
  assert.throws(() => createVault(program, payer, guardian, recipient, hash, 0, 100000));
  assert.throws(() => createVault(program, payer, guardian, recipient, hash, 10_000_001, 100000));
  const refund = resolveVault(program, guardian, ix.keys[1].pubkey, payer, true);
  assert.equal(refund.keys[0].isSigner, true); assert.deepEqual([...refund.data], [1, 1]);
  const data = Buffer.alloc(VAULT_SIZE); data[0] = 1; payer.toBuffer().copy(data, 2); guardian.toBuffer().copy(data, 34); recipient.toBuffer().copy(data, 66); data.writeBigInt64LE(100000n, 98); data.writeBigUInt64LE(1_000_000n, 106); hash.copy(data, 114);
  const vault = decodeVault(data); assert.equal(vault.status, 'held'); assert.ok(vault.guardian.equals(guardian)); assert.equal(vault.amount, 1_000_000);
  data[1] = 3; assert.throws(() => decodeVault(data));
});

test('signed decision rejects missing guardian signatures and modified messages', () => {
  const payer = Keypair.generate(), guardian = Keypair.generate(), program = Keypair.generate().publicKey;
  const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: Keypair.generate().publicKey.toBase58() }).add(resolveVault(program, guardian.publicKey, Keypair.generate().publicKey, payer.publicKey, true));
  tx.partialSign(payer);
  const intent = { id: 'fixture', decision: 'deny' as const, message: tx.serializeMessage().toString('base64'), transaction: '', expires: Date.now() + 10000 };
  assert.throws(() => checkSignedIntent(intent, tx.serialize({ requireAllSignatures: false }).toString('base64'), guardian.publicKey));
  tx.partialSign(guardian); assert.ok(checkSignedIntent(intent, tx.serialize().toString('base64'), guardian.publicKey));
  assert.throws(() => checkSignedIntent({ ...intent, message: 'different' }, tx.serialize().toString('base64'), guardian.publicKey));
});

test('chain-backed holds cannot be bypassed by local approval, timer, or demo reset', () => {
  let now = Date.now(); const store = new Store(':memory:', () => now);
  const payment = store.createPayment({ payee: 'Fixture', amount: 2500, rail: 'gift-card', newPayee: true });
  payment.escrow = { state: 'depositing', address: Keypair.generate().publicKey.toBase58(), lamports: 1_000_000, unlock: Math.floor(now / 1000) + 86400 };
  assert.throws(() => store.decidePayment(payment.id, 'approve')); assert.throws(() => store.decidePayment(payment.id, 'deny'));
  now += DAY + 1; store.tick(); assert.equal(payment.status, 'held'); assert.throws(() => store.reset());
  payment.escrow.state = 'refunded'; payment.status = 'denied'; assert.doesNotThrow(() => store.reset()); store.db.close();
});

test('unconfigured fallback is explicit and mainnet configuration is rejected', () => {
  const store = new Store(':memory:');
  const off = new SolanaVault(store, {}); assert.equal(off.status().state, 'unconfigured');
  const invalid = new SolanaVault(store, { SOLANA_PROGRAM_ID: Keypair.generate().publicKey.toBase58(), SOLANA_GUARDIAN_PUBLIC_KEY: Keypair.generate().publicKey.toBase58(), SOLANA_CLUSTER: 'mainnet-beta' });
  assert.equal(invalid.status().state, 'degraded'); assert.equal(store.get('solanaDemoPayer'), undefined);
  const valid = new SolanaVault(store, { SOLANA_PROGRAM_ID: Keypair.generate().publicKey.toBase58(), SOLANA_GUARDIAN_PUBLIC_KEY: Keypair.generate().publicKey.toBase58() });
  const payment = store.createPayment({ payee: 'Fixture', amount: 2500, rail: 'gift-card', newPayee: true }); valid.attach(payment);
  assert.equal(payment.escrow?.state, 'depositing'); assert.equal(payment.escrow?.lamports, 1_000_000);
  assert.equal(valid.status().state, 'configured'); store.db.close();
});
