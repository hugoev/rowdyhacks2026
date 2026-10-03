// Set the environment in JavaScript so npm start works in cmd, PowerShell,
// and POSIX shells without shell-specific assignment syntax.
process.env.NODE_ENV = 'production';
await import('../server/index.ts');
