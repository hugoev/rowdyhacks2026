const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 5)) {
  console.error(`Tripwire requires Node.js 22.5 or newer for built-in SQLite. You are running ${process.version}. Upgrade Node and run npm ci again.`);
  process.exit(1);
}
try {
  await import('node:sqlite');
} catch {
  console.error(`Node ${process.version} cannot load built-in SQLite. Use Node.js 22.5 or newer with SQLite enabled.`);
  process.exit(1);
}
