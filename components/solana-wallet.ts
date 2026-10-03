import { Buffer } from 'buffer';
import { PublicKey, Transaction } from '@solana/web3.js';
type Wallet = { publicKey?: PublicKey; isPhantom?: boolean; connect: () => Promise<{ publicKey: PublicKey }>; signTransaction: (tx: Transaction) => Promise<Transaction> };
type Request = <T>(path: string, body?: unknown) => Promise<T>;
export async function signGuardianDecision(request: Request, id: string, decision: 'approve' | 'deny') {
  const browser = window as Window & { phantom?: { solana?: Wallet }; solana?: Wallet };
  const wallet = browser.phantom?.solana || browser.solana;
  if (!wallet) throw new Error('Open this page in a Solana wallet-enabled browser, such as Phantom’s browser or a desktop browser with its extension. Use a devnet-only guardian wallet.');
  const connected = await wallet.connect();
  const prepared = await request<{ token: string; transaction: string; guardian: string }>('/solana/prepare', { id, decision });
  if (connected.publicKey.toBase58() !== prepared.guardian) throw new Error('Connect the configured guardian wallet. This wallet cannot co-sign this escrow.');
  const tx = Transaction.from(Buffer.from(prepared.transaction, 'base64'));
  const signed = await wallet.signTransaction(tx);
  return request('/solana/submit', { token: prepared.token, transaction: Buffer.from(signed.serialize()).toString('base64') });
}
