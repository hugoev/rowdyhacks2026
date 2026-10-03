const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 22)) {
  console.error(`Tripwire requires Node.js 22.22 or newer. You are running ${process.version}. Upgrade Node, reopen your terminal, and run npm ci again.`);
  process.exit(1);
}
try {
  await import('node:sqlite');
} catch {
  console.error(`Node ${process.version} cannot load built-in SQLite. Use Node.js 22.22 or newer with SQLite enabled.`);
  process.exit(1);
}
