// done.js — run this after you have actually posted the carousels.
//
//   node src/done.js
//
// Records every non-skipped card in cards/pending.json into data/posted.json,
// so digest.js stops offering those stories again. Then clears pending.json
// ready for tomorrow.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CARDS_FILE = path.join(ROOT, 'cards', 'pending.json');
const POSTED_FILE = path.join(ROOT, 'data', 'posted.json');

if (!fs.existsSync(CARDS_FILE)) {
  console.error('No cards/pending.json to record.');
  process.exit(1);
}

const cards = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'));

let posted = [];
if (fs.existsSync(POSTED_FILE)) {
  try {
    posted = JSON.parse(fs.readFileSync(POSTED_FILE, 'utf8'));
  } catch {
    posted = [];
  }
}

const known = new Set(posted.map((p) => p.story_id));
let added = 0;

for (const card of cards) {
  if (!card.story_id || known.has(card.story_id)) continue;

  posted.push({
    story_id: card.story_id,
    headline: card.skip ? null : card.headline,
    skipped: Boolean(card.skip),
    recorded: new Date().toISOString(),
  });

  known.add(card.story_id);
  added++;
}

fs.mkdirSync(path.dirname(POSTED_FILE), { recursive: true });
fs.writeFileSync(POSTED_FILE, JSON.stringify(posted, null, 2));
fs.writeFileSync(CARDS_FILE, '[]');

console.log(`Recorded ${added} stories. ${posted.length} total in history.`);
console.log('cards/pending.json cleared — ready for tomorrow.');
