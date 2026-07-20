// publish.js — commits and pushes whatever the render step produced.
//
// Runs at the end of "npm run cards", so the images are live on
// media.nighthalospace.online by the time you pick up your phone.

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function git(args, allowFail = false) {
  const res = spawnSync('git', args, { cwd: ROOT, stdio: 'inherit' });
  if (res.status !== 0 && !allowFail) {
    console.error(`\ngit ${args[0]} failed. Fix it and run: npm run publish`);
    process.exit(1);
  }
  return res.status === 0;
}

git(['pull', '--rebase'], true);
git(['add', '.']);

const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
const committed = git(['commit', '-m', `cards ${stamp}`], true);

if (!committed) {
  console.log('Nothing new to commit.');
} else {
  git(['push']);
}

console.log('\nLive shortly at https://media.nighthalospace.online/');
console.log('Post them, then run:  npm run done');
