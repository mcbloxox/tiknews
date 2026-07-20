// images.js — finds a freely licensed photo for each card.
//
// Run it with:  node src/images.js
//
// Reads cards/pending.json, looks up each card's "subject" on Wikipedia,
// downloads the article's main photo into images/, and writes the local path
// and the required credit back into the card file.
//
// Only free-licence images are requested, so everything it returns is safe to
// use as long as the credit line stays on the card.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CARDS_FILE = path.join(ROOT, 'cards', 'pending.json');
const IMG_DIR = path.join(ROOT, 'images');

// Wikimedia asks that tools identify themselves. Put your own contact here.
const UA = 'TheOrion/1.0 (https://nighthalospace.online; filipgorczynski5@gmail.com)';

const WIDTH = 1600; // wide enough for a 1080px card without looking soft

async function api(base, params) {
  const url = base + '?' + new URLSearchParams({ format: 'json', ...params });
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} from ${base}`);
  return res.json();
}

// Strip the HTML Wikimedia puts in its credit fields.
function clean(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Find the Wikipedia article for a name, following redirects.
// Falls back to a search if there's no exact title match.
async function findPage(subject) {
  const direct = await api('https://en.wikipedia.org/w/api.php', {
    action: 'query',
    prop: 'pageimages',
    piprop: 'thumbnail|name',
    pithumbsize: String(WIDTH),
    pilicense: 'free',
    redirects: '1',
    titles: subject,
  });

  const pages = Object.values(direct.query?.pages || {});
  const hit = pages.find((p) => p.thumbnail);
  if (hit) return hit;

  const search = await api('https://en.wikipedia.org/w/api.php', {
    action: 'query',
    generator: 'search',
    gsrsearch: subject,
    gsrlimit: '3',
    prop: 'pageimages',
    piprop: 'thumbnail|name',
    pithumbsize: String(WIDTH),
    pilicense: 'free',
  });

  const found = Object.values(search.query?.pages || {});
  return found.find((p) => p.thumbnail) || null;
}

// Get the photographer and licence for a Commons file.
async function credit(filename) {
  try {
    const data = await api('https://commons.wikimedia.org/w/api.php', {
      action: 'query',
      titles: 'File:' + filename,
      prop: 'imageinfo',
      iiprop: 'extmetadata',
    });

    const page = Object.values(data.query?.pages || {})[0];
    const meta = page?.imageinfo?.[0]?.extmetadata || {};
    const artist = clean(meta.Artist?.value) || 'Wikimedia Commons';
    const licence = clean(meta.LicenseShortName?.value) || 'see Commons';
    return `${artist} / ${licence}`;
  } catch {
    return 'Wikimedia Commons';
  }
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`image download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function main() {
  if (!fs.existsSync(CARDS_FILE)) {
    console.error('No cards/pending.json — create it first.');
    process.exit(1);
  }

  const cards = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'));
  fs.mkdirSync(IMG_DIR, { recursive: true });

  for (const card of cards) {
    if (card.skip) continue;

    if (!card.subject) {
      console.warn(`  ${card.story_id}: no "subject" field — skipping image`);
      continue;
    }

    try {
      const page = await findPage(card.subject);

      if (!page) {
        console.warn(`  ${card.story_id}: no free photo for "${card.subject}"`);
        continue;
      }

      const ext = path.extname(new URL(page.thumbnail.source).pathname) || '.jpg';
      const dest = path.join(IMG_DIR, `${card.story_id}${ext}`);

      const bytes = await download(page.thumbnail.source, dest);
      card.image = 'file:///' + dest.replace(/\\/g, '/');
      card.image_credit = await credit(page.pageimage);
      card.image_subject = page.title;

      console.log(`  ${card.story_id}: ${page.title} (${Math.round(bytes / 1024)} kB) — ${card.image_credit}`);
    } catch (err) {
      console.warn(`  ${card.story_id}: ${err.message}`);
    }
  }

  fs.writeFileSync(CARDS_FILE, JSON.stringify(cards, null, 2));
  console.log('\nUpdated cards/pending.json. Now run: node src/render.js');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('images failed:', err);
    process.exit(1);
  });
