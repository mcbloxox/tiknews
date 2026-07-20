// ingest.js — reads every feed in feeds.js and saves anything new.
//
// Run it with:  node src/ingest.js
//
// It writes data/items.json. Running it twice in a row is safe — it skips
// anything it has already seen.

const fs = require('node:fs');
const path = require('node:path');
const Parser = require('rss-parser');
const { FEEDS } = require('./feeds');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ITEMS_FILE = path.join(DATA_DIR, 'items.json');

// How long to remember an article before forgetting it. Stops the file
// growing forever.
const KEEP_DAYS = 14;

function loadItems() {
  if (!fs.existsSync(ITEMS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8'));
  } catch {
    console.warn('items.json was unreadable, starting fresh');
    return [];
  }
}

function saveItems(items) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ITEMS_FILE, JSON.stringify(items, null, 2));
}

// Turns "https://variety.com/2026/film/news/..." into "variety.com".
// Used to check that two reports really come from different outlets.
function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

// RSS feeds put the article text in different fields depending on the site.
// Take whichever one exists, strip HTML tags, and trim it.
function textOf(entry) {
  const raw =
    entry.contentSnippet ||
    entry.summary ||
    entry.content ||
    entry['content:encoded'] ||
    '';
  return String(raw)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);
}

async function main() {
  const parser = new Parser({ timeout: 15000 });
  const items = loadItems();
  const seenUrls = new Set(items.map((i) => i.url));

  let added = 0;

  for (const feed of FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      let addedHere = 0;

      for (const entry of parsed.items || []) {
        const url = entry.link;
        if (!url || seenUrls.has(url)) continue;

        const text = textOf(entry);
        if (!entry.title || text.length < 40) continue; // skip empty stubs

        items.push({
          url,
          title: entry.title.trim(),
          text,
          source: feed.name,
          domain: domainOf(url),
          published: entry.isoDate || new Date().toISOString(),
          fetched: new Date().toISOString(),
        });

        seenUrls.add(url);
        added++;
        addedHere++;
      }

      console.log(`  ${feed.name}: ${addedHere} new`);
    } catch (err) {
      // One broken feed must never stop the others.
      console.warn(`  ${feed.name}: FAILED (${err.message})`);
    }
  }

  // Forget anything older than KEEP_DAYS.
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  const kept = items.filter((i) => new Date(i.published).getTime() > cutoff);
  const dropped = items.length - kept.length;

  saveItems(kept);

  console.log(`\n${added} new articles, ${dropped} expired, ${kept.length} stored.`);
}

main().catch((err) => {
  console.error('ingest failed:', err);
  process.exit(1);
});
