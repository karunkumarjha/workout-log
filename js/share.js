// Share routines as self-contained links. The routine lives in the URL fragment
// (#/import/<code>), which browsers never send to a server.
import { h, openDialog, toast } from './ui.js';

const MAX_NAME = 100;
const MAX_EXERCISES = 50;

function toBase64Url(text) {
  let bin = '';
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code) {
  const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function routineLink(routine) {
  const payload = { v: 1, n: routine.name, e: routine.exercises.map((e) => e.name) };
  const base = location.href.split('#')[0];
  return `${base}#/import/${toBase64Url(JSON.stringify(payload))}`;
}

// Messaging apps sometimes glue words onto the end of a link ("...l19Here's"). Only the exact
// original code decodes to valid JSON, so peel trailing characters until one parses.
const MAX_TRAILING_JUNK = 120;

function parsePayload(code) {
  const clean = code.match(/^[A-Za-z0-9_-]*/)[0];
  for (let len = clean.length; len > 0 && len >= clean.length - MAX_TRAILING_JUNK; len--) {
    try {
      return JSON.parse(fromBase64Url(clean.slice(0, len)));
    } catch {
      // keep trimming
    }
  }
  return null;
}

// Returns { name, exercises: [string] } or null if the code is not a valid routine.
export function decodeRoutine(code) {
  try {
    const d = parsePayload(code);
    if (d?.v !== 1 || typeof d.n !== 'string' || !Array.isArray(d.e)) return null;
    const name = d.n.trim().slice(0, MAX_NAME);
    const exercises = d.e
      .filter((x) => typeof x === 'string')
      .map((x) => x.trim().slice(0, MAX_NAME))
      .filter(Boolean)
      .slice(0, MAX_EXERCISES);
    return name && exercises.length ? { name, exercises } : null;
  } catch {
    return null;
  }
}

// Accepts a full shared link or just the code.
export function extractCode(text) {
  const t = text.trim();
  const m = t.match(/#\/import\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]+$/.test(t) ? t : null;
}

export async function shareRoutine(routine) {
  const url = routineLink(routine);
  if (navigator.share) {
    try {
      // URL only: with extra text, some apps (WhatsApp) glue the text onto the link and break it.
      await navigator.share({ title: routine.name, url });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied');
  } catch {
    const input = h('input', { class: 'input', value: url, readonly: true, 'aria-label': 'Share link', onfocus: (e) => e.target.select() });
    const shown = openDialog({ title: 'Share link', message: 'Copy this link and send it to anyone.', body: input, okText: 'Close', cancelText: 'Cancel' });
    input.select();
    await shown;
  }
}
