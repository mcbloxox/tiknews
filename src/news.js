// news.js — runs the whole collection chain in one go.
//
//   npm run news
//
// Replaces shell chaining (which silently swallowed steps on Windows) by
// running each stage as its own child process and stopping on the first
// real failure.

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const STEPS = [
  ['ingest.js',  'reading feeds'],
  ['cluster.js', 'grouping stories'],
  ['rank.js',    'scoring for reach'],
  ['digest.js',  'writing the queue'],
];

for (const [file, label] of STEPS) {
  console.log(`\n--- ${label} ---`);

  const res = spawnSync(process.execPath, [path.join(__dirname, file)], {
    stdio: 'inherit',
  });

  if (res.status !== 0) {
    console.error(`\nStopped: ${file} exited with code ${res.status}.`);
    process.exit(res.status || 1);
  }
}

console.log('\nDone. Open the newest file in queue/, paste it into a chat');
console.log('together with prompt.md, then paste the JSON into cards/pending.json.');
