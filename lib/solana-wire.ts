import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
export const VAULT_SIZE = 147;
export function vaultAddress(program: PublicKey, payer: PublicKey, hash: Buffer) {
  if (hash.length !== 32) throw new Error('Payment hash must be 32 bytes.');
  return PublicKey.findProgramAddressSync([Buffer.from('tripwire'), payer.toBuffer(), hash], program)[0];
}
export function createVault(program: PublicKey, payer: PublicKey, guardian: PublicKey, recipient: PublicKey, hash: Buffer, amount: number, unlock: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 10_000_000 || !Number.isSafeInteger(unlock)) throw new Error('Invalid devnet escrow amount or deadline.');
  const data = Buffer.alloc(113); data[0] = 0; hash.copy(data, 1); data.writeBigUInt64LE(BigInt(amount), 33); data.writeBigInt64LE(BigInt(unlock), 41); guardian.toBuffer().copy(data, 49); recipient.toBuffer().copy(data, 81);
  return new TransactionInstruction({ programId: program, data, keys: [{ pubkey: payer, isSigner: true, isWritable: true }, { pubkey: vaultAddress(program, payer, hash), isSigner: false, isWritable: true }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }] });
}
export function resolveVault(program: PublicKey, actor: PublicKey, vault: PublicKey, destination: PublicKey, refund: boolean) {
  return new TransactionInstruction({ programId: program, data: Buffer.from([1, refund ? 1 : 0]), keys: [{ pubkey: actor, isSigner: true, isWritable: false }, { pubkey: vault, isSigner: false, isWritable: true }, { pubkey: destination, isSigner: false, isWritable: true }] });
}
export function decodeVault(data: Buffer) {
  if (data.length !== VAULT_SIZE || data[0] !== 1 || data[1] > 2) throw new Error('Invalid escrow account.');
  return { status: (['held', 'released', 'refunded'] as const)[data[1]], depositor: new PublicKey(data.subarray(2, 34)), guardian: new PublicKey(data.subarray(34, 66)), recipient: new PublicKey(data.subarray(66, 98)), unlock: Number(data.readBigInt64LE(98)), amount: Number(data.readBigUInt64LE(106)), hash: data.subarray(114, 146) };
}
