const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 5)) {
  console.error(`Tripwire requires Node.js 22.5 or newer. You are running ${process.version}. Upgrade Node and run npm ci again.`);
  process.exit(1);
}
