// rank.js — scores each confirmed story for virality potential.
//
// Run after cluster.js:   node src/rank.js
//
// Writes a "score" and "score_parts" onto every story in data/stories.json,
// so digest.js can hand you the five most likely to travel instead of the
// five most recent.
//
// Four signals:
//   fame    how many people look this person up on a normal day (Wikipedia)
//   change  is this a CHANGE (split, exit, recast, lawsuit) or an announcement
//   spread  how many outlets picked it up
//   fresh   how recent it is

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const STORIES_FILE = path.join(ROOT, 'data', 'stories.json');
const CACHE_FILE = path.join(ROOT, 'data', 'fame.json');

const UA = 'TheOrion/1.0 (https://nighthalospace.online; filipgorczynski5@gmail.com)';

// Words that make a story a CHANGE rather than an announcement. Changes travel.
const CHANGE_WORDS = {
  // things people argue about in the comments
  high: ['dies', 'dead', 'death', 'split', 'splits', 'divorce', 'breakup', 'engaged',
         'married', 'pregnant', 'arrested', 'charged', 'sues', 'lawsuit', 'fired',
         'exits', 'quits', 'dropped', 'replaced', 'recast', 'breaks silence',
         'slams', 'responds', 'apologizes', 'apologises', 'accused', 'feud'],
  // real news, less heat
  mid:  ['cast', 'casting', 'joins', 'reboot', 'revival', 'sequel', 'returns',
         'first look', 'trailer', 'canceled', 'cancelled', 'renewed', 'reunites',
         'confirms', 'reveals', 'debut', 'final season'],
  // procedural trade news
  low:  ['announces', 'sets', 'slates', 'ordered', 'greenlit', 'developing',
         'in talks', 'options', 'partners'],
};

// Words that look like names but aren't people.
const NOT_PEOPLE = new Set([
  'Netflix', 'Disney', 'Apple', 'Amazon', 'Prime', 'Video', 'Max', 'Hulu', 'Peacock',
  'Paramount', 'Warner', 'Bros', 'Universal', 'Sony', 'Fox', 'Marvel', 'Star', 'Wars',
  'Season', 'Series', 'Show', 'Film', 'Movie', 'Trailer', 'First', 'Look', 'New',
  'The', 'A', 'An', 'And', 'With', 'For', 'From', 'Set', 'Get', 'Gets', 'Its',
  'Comic', 'Con', 'Box', 'Office', 'Awards', 'Emmy', 'Oscar', 'Golden', 'Globe',
]);

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { return {}; }
}

// Pull the most likely person's name out of a cluster: a pair of capitalised
// words that shows up across the outlets' headlines.
function guessSubject(story) {
  const counts = {};

  for (const item of story.items) {
    const words = item.title.replace(/[^A-Za-z\s'-]/g, ' ').split(/\s+/).filter(Boolean);

    for (let i = 0; i < words.length - 1; i++) {
      const a = words[i];
      const b = words[i + 1];
      const capital = /^[A-Z][a-z'-]+$/;

      if (!capital.test(a) || !capital.test(b)) continue;
      if (NOT_PEOPLE.has(a) || NOT_PEOPLE.has(b)) continue;

      const name = `${a} ${b}`;
      counts[name] = (counts[name] || 0) + 1;
    }
  }

  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return ranked.length ? ranked[0][0] : null;
}

function ymd(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// Wikipedia views tell us two different things:
//
//   baseline  the median over the past month = how famous this person is
//   latest    the most recent day available  = how much attention RIGHT NOW
//
// The ratio between them is the useful part. Someone with a small baseline
// whose page suddenly gets looked up ten times as much is a story breaking,
// and that is exactly what the fame gate alone would throw away.
//
// Baseline is cached (it barely moves). The spike is never cached.
async function views(name, cache) {
  if (!name) return { baseline: 0, latest: 0, spike: 1 };

  const end = new Date(Date.now() - 2 * 864e5); // the API lags about two days
  const start = new Date(end - 30 * 864e5);
  const article = encodeURIComponent(name.replace(/ /g, '_'));

  const url =
    'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/' +
    `en.wikipedia.org/all-access/user/${article}/daily/${ymd(start)}/${ymd(end)}`;

  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return { baseline: 0, latest: 0, spike: 1 };

    const data = await res.json();
    const series = (data.items || []).map((i) => i.views);
    if (!series.length) return { baseline: 0, latest: 0, spike: 1 };

    const latest = series[series.length - 1];

    // Baseline excludes the last three days so a spike can't inflate its own
    // reference point.
    const older = series.slice(0, -3).sort((a, b) => a - b);
    const baseline = older.length
      ? older[Math.floor(older.length / 2)]
      : series[0];

    cache[name] = baseline;

    // +30 on both sides keeps tiny numbers from producing silly ratios
    const spike = (latest + 30) / (baseline + 30);

    return { baseline, latest, spike };
  } catch {
    return { baseline: 0, latest: 0, spike: 1 };
  }
}

function changeScore(story) {
  const text = story.items.map((i) => i.title).join(' ').toLowerCase();
  if (CHANGE_WORDS.high.some((w) => text.includes(w))) return 1.0;
  if (CHANGE_WORDS.mid.some((w) => text.includes(w))) return 0.6;
  if (CHANGE_WORDS.low.some((w) => text.includes(w))) return 0.2;
  return 0.35;
}

async function main() {
  if (!fs.existsSync(STORIES_FILE)) {
    console.error('No data/stories.json — run "node src/cluster.js" first.');
    process.exit(1);
  }

  const stories = JSON.parse(fs.readFileSync(STORIES_FILE, 'utf8'));
  const cache = loadCache();

  for (const story of stories) {
    if (story.status !== 'ready') continue;

    const name = guessSubject(story);
    const v = await views(name, cache);

    // 500 daily views is a nobody, 50,000 is enormous. Log scale between.
    const fameScore = v.baseline <= 0 ? 0 : Math.min(1, Math.log10(v.baseline) / Math.log10(50000));

    // 1x = normal day, 3x = something happened, 10x+ = it's already going.
    const heatScore = Math.min(1, Math.log10(Math.max(1, v.spike)) / Math.log10(12));
    const change = changeScore(story);
    const spread = Math.min(1, (story.source_count - 1) / 3);

    const ageHours = (Date.now() - new Date(story.first_seen).getTime()) / 36e5;
    const fresh = Math.max(0, 1 - ageHours / 36);

    let score =
      0.30 * fameScore +
      0.25 * heatScore +
      0.20 * change +
      0.15 * spread +
      0.10 * fresh;

    // Fame gate. A dramatic verb attached to someone nobody looks up is not a
    // viral story — it's a trade item, or an obituary for a person your
    // audience has never heard of. Without this, "dies" and "exits" push
    // unknown names to the top of the list.
    // ...but a real spike overrides it. Someone obscure getting looked up ten
    // times as often as usual IS the story, even on a small baseline.
    if (v.spike < 2.5) {
      if (v.baseline < 300) score *= 0.45;
      else if (v.baseline < 1500) score *= 0.8;
    }

    story.likely_subject = name;
    story.score = Number(Math.min(1, score).toFixed(3));
    story.score_parts = {
      fame: Number(fameScore.toFixed(2)),
      heat: Number(heatScore.toFixed(2)),
      baseline_views: v.baseline,
      latest_views: v.latest,
      spike: Number(v.spike.toFixed(1)),
      change: change,
      spread: Number(spread.toFixed(2)),
      fresh: Number(fresh.toFixed(2)),
    };
  }

  stories.sort((a, b) => (b.score || 0) - (a.score || 0));

  fs.writeFileSync(STORIES_FILE, JSON.stringify(stories, null, 2));
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));

  const ranked = stories.filter((s) => s.status === 'ready');
  console.log(`Scored ${ranked.length} confirmed stories:\n`);

  for (const s of ranked.slice(0, 10)) {
    const p = s.score_parts;
    const hot = p.spike >= 3 ? '  <-- SPIKING' : '';
    console.log(
      `  ${String(s.score).padEnd(6)} ${(s.likely_subject || '?').padEnd(22)} ` +
      `base:${String(p.baseline_views).padEnd(6)} now:${String(p.latest_views).padEnd(7)} ` +
      `${p.spike}x${hot}`
    );
    console.log(`         ${s.title.slice(0, 78)}`);
  }

  console.log('\nAnything under about 0.35 is probably not worth posting.');
}

// Exit cleanly on Windows: giving libuv a beat to finish closing sockets
// avoids the "UV_HANDLE_CLOSING" assertion crash that process.exit() causes.
main()
  .then(() => { setTimeout(() => process.exit(0), 300); })
  .catch((err) => { console.error('rank failed:', err); setTimeout(() => process.exit(1), 300); });
