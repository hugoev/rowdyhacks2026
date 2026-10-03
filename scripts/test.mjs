import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// cmd.exe does not expand globs. Discover test files here, then pass each
// filename directly to Node without a shell.
const directory = fileURLToPath(new URL('../tests/', import.meta.url));
const files = readdirSync(directory).filter(name => name.endsWith('.test.ts')).sort().map(name => fileURLToPath(new URL('../tests/' + name, import.meta.url)));
if (!files.length) {
  console.error('No unit test files found.');
  process.exit(1);
}
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], { stdio: 'inherit' });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
