// paste-cards.js — takes the JSON you just copied from the chat and writes it
// into cards/pending.json, checking it first.
//
// Runs at the start of "npm run cards". Nothing to open, nothing to save.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const CARDS_FILE = path.join(ROOT, 'cards', 'pending.json');
const STORIES_FILE = path.join(ROOT, 'data', 'stories.json');

function fromClipboard() {
  try {
    if (process.platform === 'win32') {
      return execFileSync('powershell', [
        '-NoProfile',
        '-Command',
        '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw',
      ], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    }
    if (process.platform === 'darwin') {
      return execFileSync('pbpaste', { encoding: 'utf8' });
    }
    return execFileSync('xclip', ['-selection', 'clipboard', '-o'], { encoding: 'utf8' });
  } catch {
    return null;
  }
}

const raw = fromClipboard();

if (!raw || !raw.trim()) {
  console.error('Clipboard is empty. Copy the JSON array from the chat first.');
  process.exit(1);
}

// Tolerate ```json fences and any stray text around the array.
let text = raw.replace(/```(?:json)?/gi, '').trim();
const first = text.indexOf('[');
const last = text.lastIndexOf(']');

if (first === -1 || last === -1) {
  console.error('No JSON array found on the clipboard.');
  console.error('Copy everything from the opening [ to the closing ].');
  process.exit(1);
}

text = text.slice(first, last + 1);

let cards;
try {
  cards = JSON.parse(text);
} catch (err) {
  console.error('That is not valid JSON: ' + err.message);
  console.error('Copy the block again — something was cut off.');
  process.exit(1);
}

if (!Array.isArray(cards)) {
  console.error('Expected an array of cards.');
  process.exit(1);
}

// Warn if a story_id does not match anything we actually collected.
let known = new Set();
try {
  known = new Set(JSON.parse(fs.readFileSync(STORIES_FILE, 'utf8')).map((s) => s.id));
} catch {}

const problems = [];
for (const c of cards) {
  if (!c.story_id) problems.push('a card has no story_id');
  else if (known.size && !known.has(c.story_id)) problems.push(`unknown story_id: ${c.story_id}`);
  if (!c.skip && !c.headline) problems.push(`${c.story_id}: no headline`);
  if (!c.skip && !c.subject) problems.push(`${c.story_id}: no subject, so no photo`);
}

for (const p of problems) console.warn('  warning: ' + p);

fs.mkdirSync(path.dirname(CARDS_FILE), { recursive: true });
fs.writeFileSync(CARDS_FILE, JSON.stringify(cards, null, 2));

const live = cards.filter((c) => !c.skip);
console.log(`Read ${cards.length} cards from the clipboard — ${live.length} to render, ${cards.length - live.length} skipped.`);
for (const c of live) console.log(`  ${c.headline}`);
