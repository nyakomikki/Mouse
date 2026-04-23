/*
 * Mouseferatu — native hooks.
 * Emits: onMouseMove, onMouseState, onAmbientState, onTransient.
 *
 *   mouseState   ← idle | move | drag | resize   (derived from uiohook + window rect polling)
 *   transient    ← minimize | close               (brief, ~800ms pulse)
 *   ambientState ← afk | music | video | audio    (derived from active-win + idle timer)
 *
 * Strategy:
 *   uiohook-napi       → global mouse moves + buttons (works anywhere on Windows).
 *   get-windows        → enumerate top-level windows; diff rects every 200ms to
 *                        detect drag (origin change) vs resize (size change) vs
 *                        minimize (window disappears but app still present) vs
 *                        close (window + owner app both gone).
 *   active-win         → current foreground app — used to pick music/video state
 *                        from well-known apps (Spotify, VLC, Chrome + YouTube, etc.).
 */
let uIOhook;
try {
  // require at runtime so npm install failures don't crash Electron;
  // we gracefully degrade to no-hook mode.
  // eslint-disable-next-line global-require
  ({ uIOhook } = require('uiohook-napi'));
} catch (e) {
  // eslint-disable-next-line no-console
  console.warn('[native] uiohook-napi unavailable:', e.message);
}

let activeWinFn = null;
try {
  // active-win v8 is ESM-only; use dynamic import.
  activeWinFn = (...args) => import('active-win').then((m) => m.default(...args));
} catch (_) { /* leave null */ }

let openWindowsFn = null;
try {
  openWindowsFn = (...args) => import('get-windows').then((m) => m.openWindows(...args));
} catch (_) { /* leave null */ }

let enabled = true;
let listeners = {};
let pollTimer = null;
let afkTimer = null;
let lastActivity = Date.now();
let lastMouseDown = false;
let lastWinSnapshot = new Map(); // id -> { x, y, w, h, title, app }
let currentMouseState = 'idle';
let currentAmbient = null;

const AFK_SECONDS = 60;
const MUSIC_APPS = [/Spotify/i, /Apple Music/i, /iTunes/i, /Foobar/i, /Groove/i, /AIMP/i];
const VIDEO_APPS = [/VLC/i, /Netflix/i, /mpv/i, /Media Player/i, /Movies & TV/i, /PotPlayer/i];
const BROWSER_APPS = [/Chrome/i, /Edge/i, /Firefox/i, /Brave/i, /Opera/i];

function emit(name, payload) {
  const cb = listeners[name];
  if (cb) try { cb(payload); } catch (_) { /* ignore */ }
}

function setMouseState(next) {
  if (next === currentMouseState) return;
  currentMouseState = next;
  emit('onMouseState', next);
}

function setAmbient(next) {
  if (next === currentAmbient) return;
  currentAmbient = next;
  emit('onAmbientState', next);
}

async function pollWindows() {
  if (!enabled || !openWindowsFn) return;
  try {
    const wins = await openWindowsFn();
    const snap = new Map();
    for (const w of wins) {
      if (!w || !w.bounds) continue;
      const id = `${w.owner?.processId || 0}:${w.id || w.title || ''}`;
      snap.set(id, {
        x: w.bounds.x, y: w.bounds.y, w: w.bounds.width, h: w.bounds.height,
        title: w.title || '', app: (w.owner && w.owner.name) || '',
      });
    }
    // Diff vs previous snapshot — only report a "drag/resize" if the user is
    // actively holding the mouse button (set by uiohook below).
    if (lastMouseDown && lastWinSnapshot.size) {
      let moved = false, resized = false;
      for (const [id, cur] of snap) {
        const prev = lastWinSnapshot.get(id);
        if (!prev) continue;
        if (prev.x !== cur.x || prev.y !== cur.y) moved = true;
        if (prev.w !== cur.w || prev.h !== cur.h) resized = true;
      }
      if (resized) setMouseState('resize');
      else if (moved) setMouseState('drag');
    }
    // Detect close / minimize: a previously-seen window that is no longer
    // present in this snapshot.
    if (lastWinSnapshot.size) {
      for (const [id, prev] of lastWinSnapshot) {
        if (!snap.has(id)) {
          // If the app still has another window open ⇒ minimize; else close.
          const appStillAround = [...snap.values()].some((v) => v.app === prev.app);
          emit('onTransient', appStillAround ? 'minimize' : 'close');
          break;
        }
      }
    }
    lastWinSnapshot = snap;
  } catch (_) { /* ignore transient enumeration errors */ }
}

async function pollActiveApp() {
  if (!enabled || !activeWinFn) return;
  try {
    const w = await activeWinFn();
    if (!w) return;
    const appName = (w.owner && w.owner.name) || '';
    const title = w.title || '';
    if (MUSIC_APPS.some((r) => r.test(appName))) { setAmbient('music'); return; }
    if (VIDEO_APPS.some((r) => r.test(appName)) ||
        (BROWSER_APPS.some((r) => r.test(appName)) && /YouTube|Netflix|Twitch|Prime Video/i.test(title))) {
      setAmbient('video'); return;
    }
    if (BROWSER_APPS.some((r) => r.test(appName)) && /Spotify|SoundCloud|Bandcamp/i.test(title)) {
      setAmbient('music'); return;
    }
    // Nothing media-like in focus → clear music/video ambient. Leave afk alone.
    if (currentAmbient === 'music' || currentAmbient === 'video' || currentAmbient === 'audio') {
      setAmbient(null);
    }
  } catch (_) { /* ignore */ }
}

function tickAFK() {
  if (!enabled) return;
  const idleMs = Date.now() - lastActivity;
  if (idleMs > AFK_SECONDS * 1000) {
    if (currentAmbient !== 'afk') setAmbient('afk');
  } else if (currentAmbient === 'afk') {
    setAmbient(null);
  }
}

function start(cbs) {
  listeners = cbs || {};

  if (uIOhook) {
    uIOhook.on('mousemove', (e) => {
      lastActivity = Date.now();
      emit('onMouseMove', { x: e.x, y: e.y });
      if (!lastMouseDown && currentMouseState !== 'drag' && currentMouseState !== 'resize') {
        setMouseState('move');
      }
    });
    uIOhook.on('mousedown', () => { lastMouseDown = true; lastActivity = Date.now(); });
    uIOhook.on('mouseup', () => {
      lastMouseDown = false;
      if (currentMouseState === 'drag' || currentMouseState === 'resize') {
        setMouseState('move');
      }
    });
    uIOhook.on('keydown', () => { lastActivity = Date.now(); });
    uIOhook.start();
  }

  pollTimer = setInterval(() => {
    pollWindows();
    pollActiveApp();
    // Decay move → idle when mouse stops moving for a short window.
    if (currentMouseState === 'move' && Date.now() - lastActivity > 500) {
      setMouseState('idle');
    }
  }, 200);
  afkTimer = setInterval(tickAFK, 1000);
}

function stop() {
  try { uIOhook && uIOhook.stop(); } catch (_) { /* ignore */ }
  if (pollTimer) clearInterval(pollTimer);
  if (afkTimer) clearInterval(afkTimer);
}

function setEnabled(v) { enabled = !!v; if (!enabled) setAmbient(null); }

module.exports = { start, stop, setEnabled };
