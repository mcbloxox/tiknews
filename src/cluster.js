// cluster.js — groups articles that are about the same story, then keeps
// only the stories that two different outlets have reported.
//
// Run it with:  node src/cluster.js
//
// Reads data/items.json, writes data/stories.json.

const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ITEMS_FILE = path.join(DATA_DIR, 'items.json');
const STORIES_FILE = path.join(DATA_DIR, 'stories.json');

// How similar two headlines must be to count as the same story.
// Higher = stricter. Raise it if unrelated stories get merged together,
// lower it if the same story shows up twice.
const SIMILARITY_THRESHOLD = 0.30;

// Two headlines must also share at least this many meaningful words.
// Stops one coincidental word from merging unrelated stories.
const MIN_SHARED_WORDS = 2;

// How many different outlets must report a story before it can be posted.
const REQUIRED_SOURCES = 2;

// Only consider articles from the last few days.
const MAX_AGE_HOURS = 48;

// Common words that say nothing about what a story is about.
const STOPWORDS = new Set(
  ('a an and are as at be but by for from has have he her his in is it its of on or she that the their they this to was were will with says say said after over new'
  ).split(' ')
);

// "Taylor Swift Announces New Album" -> ["taylor","swift","announces","album"]
function keywords(title) {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

// How much two headlines overlap, from 0 (nothing shared) to 1 (one is
// entirely contained in the other). Different outlets word the same story
// very differently, so we measure shared words against the SHORTER headline
// rather than against both combined.
function similarity(a, b) {
  if (a.size === 0 || b.size === 0) return { score: 0, shared: 0 };
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  return { score: shared / Math.min(a.size, b.size), shared };
}

function shortId(text) {
  // A short, stable id derived from the text — just so stories have names.
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return 'story_' + Math.abs(hash).toString(16).slice(0, 6);
}

function main() {
  if (!fs.existsSync(ITEMS_FILE)) {
    console.error('No data/items.json — run "node src/ingest.js" first.');
    process.exit(1);
  }

  const all = JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8'));

  const cutoff = Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000;
  const recent = all
    .filter((i) => new Date(i.published).getTime() > cutoff)
    .sort((a, b) => new Date(a.published) - new Date(b.published));

  // Greedy clustering: walk through each article and either add it to an
  // existing cluster it resembles, or start a new one.
  const clusters = [];

  for (const item of recent) {
    const words = keywords(item.title);
    let best = null;
    let bestScore = 0;

    for (const cluster of clusters) {
      // Always compare against the cluster's original headline. If we let the
      // cluster accumulate words instead, it would slowly match everything.
      const { score, shared } = similarity(words, cluster.words);
      if (shared >= MIN_SHARED_WORDS && score > bestScore) {
        bestScore = score;
        best = cluster;
      }
    }

    if (best && bestScore >= SIMILARITY_THRESHOLD) {
      best.items.push(item);
    } else {
      clusters.push({ words, items: [item] });
    }
  }

  // Turn clusters into stories, and count how many distinct outlets are in each.
  const stories = clusters
    .map((cluster) => {
      const domains = [...new Set(cluster.items.map((i) => i.domain))];
      const first = cluster.items[0];

      return {
        id: shortId(first.title),
        title: first.title,
        source_count: domains.length,
        domains,
        first_seen: first.published,
        status: domains.length >= REQUIRED_SOURCES ? 'ready' : 'watching',
        items: cluster.items.map((i) => ({
          source: i.source,
          title: i.title,
          text: i.text,
          url: i.url,
          published: i.published,
        })),
      };
    })
    .sort((a, b) => b.source_count - a.source_count || new Date(b.first_seen) - new Date(a.first_seen));

  fs.writeFileSync(STORIES_FILE, JSON.stringify(stories, null, 2));

  const ready = stories.filter((s) => s.status === 'ready');
  console.log(`${recent.length} recent articles`);
  console.log(`${stories.length} distinct stories`);
  console.log(`${ready.length} confirmed by ${REQUIRED_SOURCES}+ outlets (postable)`);

  for (const s of ready.slice(0, 10)) {
    console.log(`  [${s.source_count}] ${s.title}`);
  }
}

main();
