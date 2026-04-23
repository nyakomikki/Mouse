/*
 * Local-storage-backed persistence adapter.
 *
 * Same function surface as the previous axios-backed api.js, so nothing
 * else in the app has to change. Works 100% offline — perfect for the
 * packaged Windows Electron build.
 *
 * Storage keys:
 *   mf:sprites    — Array<Sprite>
 *   mf:settings   — Settings object
 *   mf:seed-ver   — string, bumps if we ship new built-ins
 */
import builtinSprites from "./builtinSprites.json";

const SPRITES_KEY = "mf:sprites";
const SETTINGS_KEY = "mf:settings";
const SEED_VER_KEY = "mf:seed-ver";
const CURRENT_SEED_VERSION = "puppy-v1";

const DEFAULT_SETTINGS = {
  id: "user",
  enabled: true,
  sprite_size: 56,
  follow_speed: 0.09,
  offset_x: 30,
  offset_y: 30,
  trail_enabled: false,
  cursor_theme: "zombie",
  cursor_size: "md",
  show_in_tray: true,
  click_flash: false,
  afk_timeout_sec: 30,
  reduce_motion: false,
  state_map: {
    idle: "builtin-blob-idle",
    move: "builtin-blob-move",
    drag: "builtin-blob-drag",
    resize: "builtin-blob-resize",
    minimize: "builtin-blob-minimize",
    close: "builtin-blob-close",
    music: "builtin-blob-music",
    video: "builtin-blob-video",
    audio: "builtin-blob-audio",
    afk: "builtin-blob-afk",
  },
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { console.warn("[storage] write failed", e); }
}

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function nowIso() { return new Date().toISOString(); }

function stampDates(s) {
  return { ...s, created_at: s.created_at || nowIso(), updated_at: nowIso() };
}

// ---- Bootstrap ----------------------------------------------------
function ensureSeed() {
  const currentVer = localStorage.getItem(SEED_VER_KEY);
  const existing = readJson(SPRITES_KEY, null);
  if (existing && currentVer === CURRENT_SEED_VERSION) return;
  // Preserve any user-created (non-built-in) sprites on upgrade.
  const userCreated = (existing || []).filter((s) => !s.built_in);
  const merged = [...builtinSprites.map(stampDates), ...userCreated];
  writeJson(SPRITES_KEY, merged);
  localStorage.setItem(SEED_VER_KEY, CURRENT_SEED_VERSION);
}

function ensureSettings() {
  const cur = readJson(SETTINGS_KEY, null);
  if (!cur) { writeJson(SETTINGS_KEY, DEFAULT_SETTINGS); return; }
  // Backfill any new fields that didn't exist before this version.
  const patched = { ...DEFAULT_SETTINGS, ...cur };
  patched.state_map = { ...DEFAULT_SETTINGS.state_map, ...(cur.state_map || {}) };
  if (JSON.stringify(patched) !== JSON.stringify(cur)) {
    writeJson(SETTINGS_KEY, patched);
  }
}

ensureSeed();
ensureSettings();

// ---- Sprite API ---------------------------------------------------
export const fetchSprites = async () => readJson(SPRITES_KEY, []);

export const createSprite = async (payload) => {
  const list = readJson(SPRITES_KEY, []);
  const sprite = stampDates({
    id: uuid(),
    name: payload.name || "Untitled",
    width: payload.width ?? 32,
    height: payload.height ?? 32,
    fps: payload.fps ?? 8,
    loop: payload.loop ?? true,
    frames: payload.frames || [],
    tags: payload.tags || [],
    built_in: false,
  });
  list.push(sprite);
  writeJson(SPRITES_KEY, list);
  return sprite;
};

export const updateSprite = async (id, payload) => {
  const list = readJson(SPRITES_KEY, []);
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error("Sprite not found");
  const current = list[idx];
  const next = stampDates({
    ...current,
    ...payload,
    // Don't let a payload flip the built_in flag
    built_in: current.built_in,
    id: current.id,
  });
  list[idx] = next;
  writeJson(SPRITES_KEY, list);
  return next;
};

export const deleteSprite = async (id) => {
  const list = readJson(SPRITES_KEY, []);
  const target = list.find((s) => s.id === id);
  if (!target) throw new Error("Sprite not found");
  if (target.built_in) throw new Error("Cannot delete built-in sprites");
  writeJson(SPRITES_KEY, list.filter((s) => s.id !== id));
  return { ok: true };
};

export const seedSprites = async () => {
  // Restore built-ins (leaves user sprites intact).
  const existing = readJson(SPRITES_KEY, []);
  const user = existing.filter((s) => !s.built_in);
  writeJson(SPRITES_KEY, [...builtinSprites.map(stampDates), ...user]);
  localStorage.setItem(SEED_VER_KEY, CURRENT_SEED_VERSION);
  return readJson(SPRITES_KEY, []);
};

// ---- Settings API -------------------------------------------------
export const fetchSettings = async () => readJson(SETTINGS_KEY, DEFAULT_SETTINGS);

export const updateSettings = async (partial) => {
  const cur = readJson(SETTINGS_KEY, DEFAULT_SETTINGS);
  const next = { ...cur, ...partial };
  if (partial.state_map) next.state_map = { ...(cur.state_map || {}), ...partial.state_map };
  writeJson(SETTINGS_KEY, next);
  return next;
};

// ---- Import / Export / Share-link ---------------------------------
export function exportSprite(sprite) {
  // Returns a downloadable .mfpup JSON string.
  return JSON.stringify({
    format: "mouseferatu-sprite/1",
    sprite: {
      name: sprite.name, width: sprite.width, height: sprite.height,
      fps: sprite.fps, loop: sprite.loop, tags: sprite.tags || [],
      frames: sprite.frames,
    },
  }, null, 2);
}

export async function importSpriteFromObject(obj) {
  if (!obj || obj.format !== "mouseferatu-sprite/1" || !obj.sprite)
    throw new Error("Not a Mouseferatu sprite file");
  const s = obj.sprite;
  return createSprite({
    name: `${s.name || "Imported"}`,
    width: s.width ?? 32,
    height: s.height ?? 32,
    fps: s.fps ?? 8,
    loop: s.loop ?? true,
    frames: s.frames || [],
    tags: s.tags || [],
  });
}

// Share-link — encode sprite as base64-gzipped (via compact JSON) fragment.
// URL length grows with frame count; typical 2-frame 32×32 sprite ≈ 4 kB URL.
export function spriteShareLink(sprite, baseUrl) {
  const payload = {
    format: "mouseferatu-sprite/1",
    sprite: {
      name: sprite.name, width: sprite.width, height: sprite.height,
      fps: sprite.fps, loop: sprite.loop, tags: sprite.tags || [],
      frames: sprite.frames,
    },
  };
  const json = JSON.stringify(payload);
  // base64url so it survives in URL fragments
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const href = baseUrl || (typeof window !== "undefined" ? window.location.origin + window.location.pathname : "");
  return `${href}#import=${b64}`;
}

export function parseSpriteFromHash() {
  if (typeof window === "undefined") return null;
  const m = window.location.hash.match(/[#&]import=([A-Za-z0-9_\-]+)/);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = decodeURIComponent(escape(atob(padded)));
    return JSON.parse(json);
  } catch (e) {
    console.warn("[storage] failed to parse share hash", e);
    return null;
  }
}

export function clearShareHash() {
  if (typeof window === "undefined") return;
  const clean = window.location.pathname + window.location.search;
  window.history.replaceState({}, document.title, clean);
}
