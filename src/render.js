// render.js — turns cards/pending.json into PNG images.
//
// Run it with:  node src/render.js
//
// Writes two images per card into docs/ (slide 1 and slide 2), which is the
// folder GitHub Pages publishes. Skips any card marked "skip".
//
// First time only, install the browser it uses:
//   npm install playwright
//   npx playwright install chromium

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const CARDS_FILE = path.join(ROOT, 'cards', 'pending.json');
const TEMPLATE = path.join(ROOT, 'templates', 'card.html');
const OUT_DIR = path.join(ROOT, 'docs');

function encode(obj) {
  return encodeURIComponent(Buffer.from(JSON.stringify(obj), 'utf8').toString('base64'));
}

async function main() {
  if (!fs.existsSync(CARDS_FILE)) {
    console.error('No cards/pending.json — paste the JSON from your chat into that file first.');
    process.exit(1);
  }

  const cards = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'));
  const live = cards.filter((c) => !c.skip);

  if (live.length === 0) {
    console.log('Every card was skipped. Nothing to render.');
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
  });

  const written = [];

  for (const card of live) {
    const id = card.story_id || 'card';

    for (const slide of [1, 2]) {
      const url =
        pathToFileURL(TEMPLATE).href +
        '?slide=' + slide +
        '&data=' + encode(card);

      await page.goto(url);
      await page.waitForFunction(() => document.body.dataset.ready === 'true');
      await page.evaluate(() => document.fonts.ready); // don't shoot before fonts load

      const file = path.join(OUT_DIR, `${id}-${slide}.png`);
      await page.locator('#card').screenshot({ path: file });
      written.push(file);
    }

    console.log(`  ${id}: 2 slides`);
  }

  await browser.close();

  console.log(`\nWrote ${written.length} images to docs/`);
  console.log('Commit and push, then they are live at https://media.nighthalospace.online/');
}

main().catch((err) => {
  console.error('render failed:', err);
  process.exit(1);
});
