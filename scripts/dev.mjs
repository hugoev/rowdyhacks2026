import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
let child;
let timer;
let restarting = false;
let stopping = false;
let watching = true;

function start() {
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { cwd: root, env: process.env, stdio: 'inherit' });
  child.once('error', error => { console.error('Could not start Tripwire:', error.message); shutdown(1); });
  child.once('exit', code => {
    child = undefined;
    if (stopping) return;
    if (restarting) { restarting = false; start(); }
    else if (code) console.error(`Tripwire exited with code ${code}. Fix the error above and save a backend file to retry.`);
  });
}
function restart() {
  if (stopping) return;
  if (child) { restarting = true; child.kill('SIGTERM'); }
  else start();
}
// Next owns frontend hot reload. Watching only our backend sources prevents
// generated .next files from restarting the server during page compilation.
const watchers = ['server', 'lib'].map(directory => {
  const watcher = watch(new URL('../' + directory + '/', import.meta.url), { recursive: true }, (_event, filename) => {
    if (!watching) return;
    if (filename && !/\.(?:ts|tsx|json)$/.test(filename)) return;
    clearTimeout(timer); timer = setTimeout(restart, 200);
  });
  watcher.on('error', error => {
    if (!watching) return;
    watching = false;
    clearTimeout(timer);
    watchers.forEach(item => item.close());
    console.error('Backend auto-restart is unavailable:', error.message, '\nThe app will keep running; restart the dev server after backend changes.');
  });
  return watcher;
});
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true; clearTimeout(timer); watchers.forEach(watcher => watcher.close());
  if (!child) { process.exit(code); return; }
  child.once('exit', () => process.exit(code)); child.kill('SIGTERM');
  setTimeout(() => { child?.kill('SIGKILL'); process.exit(code); }, 5000).unref();
}
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
start();
