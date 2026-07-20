// gallery.js — builds docs/index.html listing every rendered card.
//
//   node src/gallery.js
//
// Open https://media.nighthalospace.online/ on your phone to see them all,
// grouped into pairs, ready to save.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const CARDS_FILE = path.join(ROOT, 'cards', 'pending.json');
const POSTED_FILE = path.join(ROOT, 'data', 'posted.json');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// Build a lookup of story_id -> headline, from both current and past batches.
function headlines() {
  const map = {};
  for (const c of readJson(CARDS_FILE, [])) {
    if (c.story_id && c.headline) map[c.story_id] = c.headline;
  }
  for (const p of readJson(POSTED_FILE, [])) {
    if (p.story_id && p.headline && !map[p.story_id]) map[p.story_id] = p.headline;
  }
  return map;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function main() {
  if (!fs.existsSync(DOCS)) {
    console.error('No docs/ folder — run the render step first.');
    process.exit(1);
  }

  const titles = headlines();

  // Group PNGs by story id. "story_41b1c9-2.png" -> id "story_41b1c9", slide 2.
  const groups = {};

  for (const file of fs.readdirSync(DOCS)) {
    const m = file.match(/^(.+)-(\d+)\.png$/i);
    if (!m) continue;

    const [, id, slide] = m;
    const stat = fs.statSync(path.join(DOCS, file));
    groups[id] = groups[id] || { id, slides: [], mtime: 0 };
    groups[id].slides.push({ file, slide: Number(slide) });
    groups[id].mtime = Math.max(groups[id].mtime, stat.mtimeMs);
  }

  const sets = Object.values(groups).sort((a, b) => b.mtime - a.mtime);
  for (const s of sets) s.slides.sort((a, b) => a.slide - b.slide);

  const body = sets.length
    ? sets
        .map((set) => {
          const when = new Date(set.mtime).toISOString().slice(0, 10);
          const title = titles[set.id] || set.id;
          const shots = set.slides
            .map(
              (s) => `
        <a class="shot" href="${esc(s.file)}" target="_blank" rel="noopener">
          <img src="${esc(s.file)}" alt="slide ${s.slide}" loading="lazy">
          <span class="n">${s.slide}</span>
        </a>`
            )
            .join('');

          return `
    <section class="set">
      <h2>${esc(title)}</h2>
      <p class="meta">${esc(set.id)} &middot; ${when} &middot; ${set.slides.length} slides</p>
      <div class="shots">${shots}</div>
    </section>`;
        })
        .join('')
    : '<p class="empty">No cards rendered yet. Run <code>npm run cards</code>.</p>';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>The Orion — cards</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;800&family=IBM+Plex+Mono:wght@400&display=swap" rel="stylesheet">
<style>
  :root { --ink:#17181F; --bone:#EFECE4; --signal:#FF3D6E; --muted:#6E7185; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    background: var(--ink); color: var(--bone);
    font-family:'Archivo',system-ui,sans-serif;
    padding: 28px 20px 80px; max-width: 900px; margin: 0 auto;
  }
  header { border-bottom:2px solid #2C2E3A; padding-bottom:18px; margin-bottom:8px; }
  h1 { font-size:26px; font-weight:800; letter-spacing:-.02em; }
  header p {
    font-family:'IBM Plex Mono',monospace; font-size:12px; letter-spacing:.14em;
    text-transform:uppercase; color:var(--muted); margin-top:6px;
  }
  .set { padding:30px 0; border-bottom:1px solid #24262F; }
  h2 { font-size:21px; font-weight:800; letter-spacing:-.02em; text-transform:lowercase; line-height:1.15; }
  .meta {
    font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:.1em;
    text-transform:uppercase; color:var(--muted); margin:8px 0 16px;
  }
  .shots { display:flex; gap:12px; flex-wrap:wrap; }
  .shot { position:relative; flex:1 1 140px; max-width:200px; text-decoration:none; }
  .shot img { width:100%; display:block; border-radius:3px; background:#24262F; }
  .n {
    position:absolute; top:8px; left:8px;
    font-family:'IBM Plex Mono',monospace; font-size:11px; font-weight:600;
    background:var(--signal); color:#fff; padding:2px 7px; border-radius:2px;
  }
  .empty { color:var(--muted); padding:40px 0; }
  code { font-family:'IBM Plex Mono',monospace; background:#24262F; padding:2px 6px; border-radius:3px; }
  footer {
    margin-top:36px; font-family:'IBM Plex Mono',monospace; font-size:11px;
    letter-spacing:.1em; text-transform:uppercase; color:var(--muted); line-height:1.9;
  }
</style>
</head>
<body>
  <header>
    <h1>The Orion — cards</h1>
    <p>${sets.length} sets &middot; built ${new Date().toISOString().slice(0, 16).replace('T', ' ')}Z</p>
  </header>
${body}
  <footer>
    Tap a slide to open it full size, then press and hold to save.<br>
    Post slide 1 first, slide 2 second.
  </footer>
</body>
</html>`;

  fs.writeFileSync(path.join(DOCS, 'index.html'), html);
  console.log(`Wrote docs/index.html — ${sets.length} card sets listed.`);
}

main();
