import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { createVault, decodeVault, resolveVault, vaultAddress } from '../lib/solana-wire';
import type { Payment, SolanaStatus } from '../lib/types';
import { Store } from './store';

export const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const LAMPORTS = 1_000_000; // Fixed 0.001 devnet SOL, never the displayed mock dollar amount.
type Intent = { id: string; decision: 'approve' | 'deny'; message: string; transaction: string; expires: number };
export function checkSignedIntent(intent: Intent, encoded: string, guardian: PublicKey) {
  const tx = Transaction.from(Buffer.from(encoded, 'base64'));
  if (tx.serializeMessage().toString('base64') !== intent.message || !tx.signatures.some(s => s.publicKey.equals(guardian) && s.signature) || !tx.verifySignatures()) throw new Error('The wallet must sign the exact prepared guardian transaction.');
  return tx;
}
export class SolanaVault {
  private connection?: Connection;
  private payer?: Keypair;
  private program?: PublicKey;
  private guardian?: PublicKey;
  private recipient?: PublicKey;
  private ready = false;
  private busy = false;
  private stopped = false;
  private statusValue: SolanaStatus = { state: 'unconfigured', cluster: 'devnet' };
  constructor(private store: Store, env: Record<string, string | undefined> = process.env, client?: Connection) {
    if (!env.SOLANA_PROGRAM_ID && !env.SOLANA_GUARDIAN_PUBLIC_KEY) return;
    try {
      if (env.SOLANA_CLUSTER && env.SOLANA_CLUSTER !== 'devnet') throw new Error('Only devnet is supported.');
      this.program = new PublicKey(env.SOLANA_PROGRAM_ID!); this.guardian = new PublicKey(env.SOLANA_GUARDIAN_PUBLIC_KEY!);
      if (env.SOLANA_KEYPAIR_PATH) this.payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(env.SOLANA_KEYPAIR_PATH, 'utf8'))));
      else {
        let saved = store.get('solanaDemoPayer');
        if (!saved) { saved = JSON.stringify([...Keypair.generate().secretKey]); store.set('solanaDemoPayer', saved); }
        this.payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(saved)));
      }
      let recipient = env.SOLANA_RECIPIENT_PUBLIC_KEY || store.get('solanaDemoRecipient');
      if (!recipient) { recipient = Keypair.generate().publicKey.toBase58(); store.set('solanaDemoRecipient', recipient); }
      this.recipient = new PublicKey(recipient);
      if (this.guardian.equals(this.payer.publicKey) || this.recipient.equals(this.payer.publicKey)) throw new Error('Use independent guardian and recipient addresses.');
      this.connection = client || new Connection(env.SOLANA_RPC_URL || 'https://api.devnet.solana.com', { commitment: 'confirmed', disableRetryOnRateLimit: true, fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }) });
      this.statusValue = { state: 'configured', cluster: 'devnet', program: this.program.toBase58(), guardian: this.guardian.toBase58(), payer: this.payer.publicKey.toBase58() };
    } catch { this.statusValue = { state: 'degraded', cluster: 'devnet', error: 'Invalid Solana configuration. Check the devnet program and independent guardian wallet.' }; }
  }
  status() { return { ...this.statusValue }; }
  async initialize() {
    if (this.ready) return;
    if (!this.connection || !this.program || !this.payer) throw new Error('Solana devnet escrow is not configured.');
    if (await this.connection.getGenesisHash() !== DEVNET_GENESIS) throw new Error('Refusing a non-devnet network.');
    const program = await this.connection.getAccountInfo(this.program);
    if (!program?.executable) throw new Error('The devnet escrow program is not deployed.');
    this.ready = true; this.statusValue.state = 'working'; delete this.statusValue.error;
  }
  attach(payment: Payment) {
    if (!this.program || !this.guardian || !this.payer || !this.connection || payment.status !== 'held' || payment.escrow) return;
    const hash = createHash('sha256').update(payment.id).digest();
    // Start deadline on chain creation; an offline deposit must not bypass cooling-off.
    payment.escrow = { state: 'depositing', address: vaultAddress(this.program, this.payer.publicKey, hash).toBase58(), lamports: LAMPORTS, unlock: Math.floor(Date.now() / 1000) + 86460 };
    this.store.save();
  }
  private async read(payment: Payment) {
    const info = await this.connection!.getAccountInfo(new PublicKey(payment.escrow!.address));
    if (!info) return null;
    if (!info.owner.equals(this.program!)) throw new Error('Unexpected escrow account owner.');
    const vault = decodeVault(info.data);
    if (!vault.depositor.equals(this.payer!.publicKey) || !vault.guardian.equals(this.guardian!) || !vault.recipient.equals(this.recipient!) || !vault.hash.equals(createHash('sha256').update(payment.id).digest()) || vault.amount !== LAMPORTS) throw new Error('Escrow account does not match this payment.');
    return vault;
  }
  private reconcile(payment: Payment, vault: ReturnType<typeof decodeVault>) {
    const escrow = payment.escrow!;
    escrow.unlock = vault.unlock; payment.releaseAt = vault.unlock * 1000;
    escrow.state = vault.status; delete escrow.error;
    if (vault.status !== 'held' && payment.status === 'held') {
      payment.status = vault.status === 'refunded' ? 'denied' : 'released'; payment.resolvedAt = Date.now();
      this.store.closeCase(payment.id, vault.status === 'refunded' ? 'foiled' : 'reviewed');
      this.store.event(vault.status === 'refunded' ? 'HEIST FOILED · devnet escrow refunded' : 'Devnet escrow released', payment.score, 'payment');
    }
    this.store.save();
  }
  async sync() {
    if (this.busy || this.stopped || !this.connection) return;
    this.busy = true;
    try {
      await this.initialize();
      for (const payment of this.store.state.payments.filter(p => p.escrow && p.status === 'held')) {
        if (this.stopped) break;
        try {
          let vault = await this.read(payment);
          if (!vault) {
            const hash = createHash('sha256').update(payment.id).digest();
            const unlock = Math.floor(Date.now() / 1000) + 86460;
            const instruction = createVault(this.program!, this.payer!.publicKey, this.guardian!, this.recipient!, hash, LAMPORTS, unlock);
            const tx = await this.transaction(instruction); tx.sign(this.payer!);
            const encoded = tx.serialize();
            // Store signature before submitting; ambiguous network failures are reconciled by PDA.
            payment.escrow!.depositSignature = bs58.encode(tx.signature!);
            this.store.save();
            const signature = await this.connection.sendRawTransaction(encoded, { skipPreflight: false, maxRetries: 2 });
            payment.escrow!.depositSignature = signature; this.store.save();
            await this.confirm(signature, tx.recentBlockhash!);
            vault = await this.read(payment);
          }
          if (!vault) throw new Error('Escrow confirmation pending.');
          this.reconcile(payment, vault);
          if (vault.status === 'held' && Date.now() / 1000 >= vault.unlock) {
            const tx = await this.transaction(resolveVault(this.program!, this.payer!.publicKey, new PublicKey(payment.escrow!.address), this.recipient!, false)); tx.sign(this.payer!);
            const signature = await this.connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 2 });
            payment.escrow!.resolutionSignature = signature; this.store.save(); await this.confirm(signature, tx.recentBlockhash!);
            const resolved = await this.read(payment); if (resolved) this.reconcile(payment, resolved);
          }
        } catch { payment.escrow!.error = 'Devnet transaction pending or unavailable. The hold remains in place.'; this.store.save(); }
      }
      this.statusValue.state = 'working'; delete this.statusValue.error;
    } catch { this.statusValue.state = 'degraded'; this.statusValue.error = 'Check devnet RPC, deployed program, and payer funding. Existing escrows stay held.'; }
    finally { this.busy = false; }
  }
  private async transaction(instruction: Parameters<Transaction['add']>[0]) {
    const { blockhash, lastValidBlockHeight } = await this.connection!.getLatestBlockhash();
    const tx = new Transaction({ feePayer: this.payer!.publicKey, blockhash, lastValidBlockHeight }); tx.add(instruction); return tx;
  }
  private async confirm(signature: string, blockhash: string) {
    // Bounded polling handles restart/ambiguous response without trusting browser claims.
    for (let i = 0; i < 15; i++) {
      const status = (await this.connection!.getSignatureStatuses([signature])).value[0];
      if (status?.err) throw new Error('Devnet transaction rejected.');
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return;
      if (!(await this.connection!.isBlockhashValid(blockhash)).value) throw new Error('Transaction expired. Retry after reconciliation.');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('Confirmation pending.');
  }
  async prepare(id: string, decision: 'approve' | 'deny') {
    await this.initialize(); const payment = this.store.payment(id);
    if (!payment.escrow || payment.status !== 'held') throw new Error('This payment has no active devnet escrow.');
    const vault = await this.read(payment);
    if (!vault || vault.status !== 'held') { if (vault) this.reconcile(payment, vault); throw new Error('Escrow is not awaiting a guardian decision.'); }
    const tx = await this.transaction(resolveVault(this.program!, this.guardian!, new PublicKey(payment.escrow.address), decision === 'deny' ? this.payer!.publicKey : this.recipient!, decision === 'deny'));
    tx.partialSign(this.payer!);
    const intent: Intent = { id, decision, message: tx.serializeMessage().toString('base64'), transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'), expires: Date.now() + 90000 };
    const token = randomUUID(); this.store.set('solanaIntent:' + token, JSON.stringify(intent));
    return { token, transaction: intent.transaction, guardian: this.guardian!.toBase58(), cluster: 'devnet' };
  }
  async submit(token: string, transaction: string) {
    await this.initialize(); const saved = this.store.get('solanaIntent:' + token);
    if (!saved) throw new Error('Prepare a guardian transaction first.');
    const intent = JSON.parse(saved) as Intent;
    if (intent.expires < Date.now()) throw new Error('Wallet request expired. Prepare a new one.');
    const payment = this.store.payment(intent.id);
    if (payment.status !== 'held' || !payment.escrow) throw new Error('Payment already resolved.');
    const tx = checkSignedIntent(intent, transaction, this.guardian!);
    const signature = await this.connection!.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 2 });
    payment.escrow.resolutionSignature = signature; this.store.save();
    await this.confirm(signature, tx.recentBlockhash!);
    const vault = await this.read(payment); if (!vault) throw new Error('Escrow confirmation pending.');
    this.reconcile(payment, vault); return { signature, payment };
  }
  stop() { this.stopped = true; }
}
