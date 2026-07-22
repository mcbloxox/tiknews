// video.js — turns each card into a vertical MP4 reel with motion + voice.
//
//   npm run video
//
// Two-stage render (this matters): each slide is rendered to its own short
// clip with a HARD frame cap, then the clips are concatenated and the voice
// laid over the top. Rendering zoompan straight into a concat lets ffmpeg
// loop forever — capping frames per clip is what keeps it bounded.
//
// Needs ffmpeg + ffprobe on PATH, and the slide PNGs from render.js.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const CARDS_FILE = path.join(ROOT, 'cards', 'pending.json');
const CARD_DIR = path.join(ROOT, 'docs');
const AUDIO_DIR = path.join(ROOT, 'audio');
const OUT_DIR = path.join(ROOT, 'video');

const W = 1080, H = 1920, FPS = 30;

function dur(file) {
  const r = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', file,
  ], { encoding: 'utf8' });
  const d = parseFloat((r.stdout || '').trim());
  return Number.isFinite(d) ? d : 0;
}

function run(args) {
  const r = spawnSync('ffmpeg', ['-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error((r.stderr || '').trim().split('\n').slice(-2).join(' | '));
  }
}

// Render one still into a slowly-zooming clip of exactly `frames` frames.
function renderClip(png, frames, dest) {
  run([
    '-loop', '1', '-i', png,
    '-vf', `zoompan=z='min(zoom+0.0010,1.12)':d=${frames}:` +
           `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS},setsar=1`,
    '-frames:v', String(frames),          // the hard cap — prevents runaway
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p',
    dest,
  ]);
}

function buildOne(card, tmp) {
  const slide1 = path.join(CARD_DIR, `${card.story_id}-1.png`);
  const slide2 = path.join(CARD_DIR, `${card.story_id}-2.png`);
  if (!fs.existsSync(slide1)) {
    console.warn(`  ${card.story_id}: no rendered card — run "npm run cards" first`);
    return null;
  }

  const audio = path.join(AUDIO_DIR, `${card.story_id}.mp3`);
  const hasAudio = fs.existsSync(audio);
  const voiceLen = hasAudio ? dur(audio) : 0;

  // Total length follows the voice, clamped to TikTok's retention sweet spot.
  const total = Math.min(34, Math.max(8, voiceLen ? voiceLen + 1.0 : 12));
  const halfFrames = Math.round((total / 2) * FPS);

  const c1 = path.join(tmp, `${card.story_id}-1.mp4`);
  const c2 = path.join(tmp, `${card.story_id}-2.mp4`);
  renderClip(slide1, halfFrames, c1);
  renderClip(fs.existsSync(slide2) ? slide2 : slide1, halfFrames, c2);

  // Concat the two finished clips via the demuxer (no re-encode, can't loop).
  const list = path.join(tmp, `${card.story_id}.txt`);
  fs.writeFileSync(list, `file '${c1}'\nfile '${c2}'\n`);
  const joined = path.join(tmp, `${card.story_id}-joined.mp4`);
  run(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);

  const out = path.join(OUT_DIR, `${card.story_id}.mp4`);

  if (hasAudio) {
    run([
      '-i', joined, '-i', audio,
      '-map', '0:v', '-map', '1:a',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest',
      '-movflags', '+faststart', out,
    ]);
  } else {
    run(['-i', joined, '-c', 'copy', '-movflags', '+faststart', out]);
  }

  console.log(`  ${card.story_id}: ${dur(out).toFixed(1)}s ${hasAudio ? 'with voice' : '(silent)'}`);
  return out;
}

function main() {
  if (!fs.existsSync(CARDS_FILE)) { console.error('No cards/pending.json.'); process.exit(1); }

  const cards = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8')).filter((c) => !c.skip);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orion-vid-'));

  const made = [];
  for (const card of cards) {
    try {
      const out = buildOne(card, tmp);
      if (out) made.push(out);
    } catch (err) {
      console.warn(`  ${card.story_id}: ${err.message}`);
    }
  }

  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(`\nBuilt ${made.length} reels in video/.`);
}

main();
