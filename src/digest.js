// digest.js — writes the file you paste into a Claude chat.
//
// Run it with:  node src/digest.js
//
// Reads data/stories.json, writes queue/YYYY-MM-DD.md with the top stories
// and their full source text (the full text matters — it is what the quote
// check is verified against later).

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const STORIES_FILE = path.join(ROOT, 'data', 'stories.json');
const POSTED_FILE = path.join(ROOT, 'data', 'posted.json');
const QUEUE_DIR = path.join(ROOT, 'queue');

// How many stories to put in front of you each time.
const TOP_N = 4;

// Ignore anything rank.js scored below this. Reading five weak stories to
// find one good one is the thing that makes a daily routine stop happening.
const MIN_SCORE = 0.35;

function loadPosted() {
  if (!fs.existsSync(POSTED_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(POSTED_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function main() {
  if (!fs.existsSync(STORIES_FILE)) {
    console.error('No data/stories.json — run "node src/cluster.js" first.');
    process.exit(1);
  }

  const stories = JSON.parse(fs.readFileSync(STORIES_FILE, 'utf8'));
  const postedIds = new Set(loadPosted().map((p) => p.story_id));

  const candidates = stories
    .filter((s) => s.status === 'ready')
    .filter((s) => !postedIds.has(s.id))
    .filter((s) => s.score === undefined || s.score >= MIN_SCORE)
    .slice(0, TOP_N);

  if (candidates.length === 0) {
    console.log(`Nothing above ${MIN_SCORE}. Either nothing big broke, or you have posted it all.`);
    console.log('A thin day is not a reason to lower the bar — post nothing, or post one.');
    return;
  }

  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace('T', ' ') + 'Z';

  let out = '';
  out += `# Candidate stories — ${stamp}\n\n`;
  out += `Paste this whole file into a Claude chat, together with the contents of prompt.md.\n`;
  out += `Return one JSON array of card objects.\n\n`;
  out += `Rules reminder: every quotation must appear word-for-word in the source text below.\n`;
  out += `If a story has no usable quote, write the card without one.\n\n`;
  out += `---\n\n`;

  for (const story of candidates) {
    out += `## ${story.id}\n`;
    out += `**${story.source_count} outlets** — ${story.domains.join(', ')}  \n`;
    out += `First seen: ${story.first_seen}\n\n`;

    for (const item of story.items) {
      out += `### ${item.source}\n`;
      out += `**${item.title}**\n\n`;
      out += `${item.text}\n\n`;
      out += `<${item.url}>\n\n`;
    }

    out += `---\n\n`;
  }

  fs.mkdirSync(QUEUE_DIR, { recursive: true });
  const filename = `${now.toISOString().slice(0, 10)}.md`;
  const filepath = path.join(QUEUE_DIR, filename);
  fs.writeFileSync(filepath, out);

  console.log(`Wrote queue/${filename} with ${candidates.length} stories:`);
  for (const s of candidates) console.log(`  [${s.source_count}] ${s.title}`);
}

main();
