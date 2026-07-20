// queue-copy.js — puts prompt.md + today's story queue on your clipboard,
// ready to paste straight into a chat. No opening files, no scrolling.
//
// Runs at the end of "npm run news".

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const QUEUE_DIR = path.join(ROOT, 'queue');
const PROMPT = path.join(ROOT, 'prompt.md');

function newestQueueFile() {
  if (!fs.existsSync(QUEUE_DIR)) return null;
  const files = fs
    .readdirSync(QUEUE_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ f, m: fs.statSync(path.join(QUEUE_DIR, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return files.length ? path.join(QUEUE_DIR, files[0].f) : null;
}

function toClipboard(text) {
  // Round-trip through a temp file so UTF-8 survives PowerShell.
  const tmp = path.join(os.tmpdir(), `orion-clip-${Date.now()}.txt`);
  fs.writeFileSync(tmp, text, 'utf8');

  try {
    if (process.platform === 'win32') {
      execFileSync('powershell', [
        '-NoProfile',
        '-Command',
        `Set-Clipboard -Value (Get-Content -Raw -Encoding UTF8 '${tmp}')`,
      ]);
    } else if (process.platform === 'darwin') {
      execFileSync('sh', ['-c', `pbcopy < "${tmp}"`]);
    } else {
      execFileSync('sh', ['-c', `xclip -selection clipboard < "${tmp}"`]);
    }
    return true;
  } catch {
    return false;
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

const queueFile = newestQueueFile();

if (!queueFile) {
  console.log('\nNothing to copy — no queue file was written.');
  process.exit(0);
}

const parts = [];
if (fs.existsSync(PROMPT)) parts.push(fs.readFileSync(PROMPT, 'utf8'));
parts.push('\n\n---\n\n');
parts.push(fs.readFileSync(queueFile, 'utf8'));

const text = parts.join('');

if (toClipboard(text)) {
  console.log(`\nCopied to clipboard (${Math.round(text.length / 1000)} kB).`);
  console.log('Paste it into a Claude chat, then copy the JSON it returns.');
  console.log('Then run:  npm run cards');
} else {
  console.log(`\nCould not reach the clipboard. Open this file and copy it manually:`);
  console.log('  ' + queueFile);
}
