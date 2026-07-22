// voice.js — turns each card's script into an MP3 using ElevenLabs.
//
// Runs inside "npm run video". Needs a free ElevenLabs API key in .env:
//   ELEVENLABS_API_KEY=sk_...
//
// The script is built from fields you already generate: the hook (headline)
// and the payoff (slide2 / quote). No new writing required.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CARDS_FILE = path.join(ROOT, 'cards', 'pending.json');
const AUDIO_DIR = path.join(ROOT, 'audio');

// A calm news-read voice. "Adam" is a stock ElevenLabs voice; swap the id in
// .env as VOICE_ID once you pick one you like from their library.
const VOICE_ID = process.env.VOICE_ID || 'pNInz6obpgDQGcFmaJgB';
const KEY = process.env.ELEVENLABS_API_KEY;

// Build what the voice actually says. Kept plain and declarative — the drama
// is in the fact, not the delivery. This is also the on-screen caption.
function scriptFor(card) {
  const parts = [];
  if (card.headline) parts.push(card.headline.replace(/\.$/, '') + '.');
  if (card.quote) {
    parts.push(`quote: ${card.quote}`);
  } else if (card.slide2) {
    parts.push(card.slide2);
  }
  // A short outro line gives the video a loop-friendly ending.
  parts.push(`confirmed by ${(card.source || '').split(',').length} outlets.`);
  return parts.join(' ');
}

async function tts(text, dest) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5', // cheapest, fast, fine for narration
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  if (!KEY) {
    console.error('No ELEVENLABS_API_KEY in .env — cannot make voiceovers.');
    console.error('Get a free key at elevenlabs.io, then add it to .env');
    process.exit(1);
  }

  const cards = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8')).filter((c) => !c.skip);
  fs.mkdirSync(AUDIO_DIR, { recursive: true });

  for (const card of cards) {
    const script = scriptFor(card);
    const dest = path.join(AUDIO_DIR, `${card.story_id}.mp3`);

    try {
      await tts(script, dest);
      card._audio = dest;
      card._script = script;
      console.log(`  ${card.story_id}: voiced (${script.length} chars)`);
    } catch (err) {
      console.warn(`  ${card.story_id}: ${err.message}`);
    }
  }

  fs.writeFileSync(CARDS_FILE, JSON.stringify(cards, null, 2));
}

main()
  .then(() => setTimeout(() => process.exit(0), 300))
  .catch((err) => { console.error('voice failed:', err); setTimeout(() => process.exit(1), 300); });
