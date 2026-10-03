import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const installed = join(homedir(), '.local/share/solana/install/active_release/bin/cargo-build-sbf');
const result = spawnSync(existsSync(installed) ? installed : 'cargo-build-sbf', ['--manifest-path', 'chain/Cargo.toml', '--arch', 'v0'], { stdio: 'inherit', shell: false });
if (result.error) console.error('Install the official Solana CLI first. Windows program builds require WSL.');
process.exit(result.status ?? 1);
