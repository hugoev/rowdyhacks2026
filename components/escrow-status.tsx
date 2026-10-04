import type { Payment } from '@/lib/types';
export function EscrowStatus({ payment }: { payment: Payment }) {
  const escrow = payment.escrow;
  if (!escrow) return null;
  return <div className="escrow-status"><strong>SOLANA DEVNET · {escrow.state.toUpperCase()}</strong><p>Network deposit: {escrow.lamports / 1e9} SOL. The displayed dollar request is simulated and does not move.</p>{escrow.error && <p role="status">{escrow.error}</p>}<a href={`https://explorer.solana.com/address/${escrow.address}?cluster=devnet`} target="_blank" rel="noopener noreferrer">View escrow account ↗</a>{escrow.depositSignature && <> · <a href={`https://explorer.solana.com/tx/${escrow.depositSignature}?cluster=devnet`} target="_blank" rel="noopener noreferrer">Deposit ↗</a></>}{escrow.resolutionSignature && <> · <a href={`https://explorer.solana.com/tx/${escrow.resolutionSignature}?cluster=devnet`} target="_blank" rel="noopener noreferrer">Decision ↗</a></>}</div>;
}
