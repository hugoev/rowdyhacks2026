# Solana - excluded from PRD v3

Solana/blockchain is intentionally outside the active product and prize scope.
Do not add new escrow work or include a Solana prize claim in the v3 submission.

The v3 app no longer loads the Solana integration (server sync, wallet
signing, escrow UI). The `chain/` program, its CI test, keys, and deployment
variables are untouched. Outstanding escrows must be accounted for before
later decommissioning. Preserve historical keys and records; never erase a
volume or imply devnet funds are real bank transfers.

The earlier implementation and operations are preserved in
[archived Solana documentation](archive/v2/docs/SOLANA.md).
