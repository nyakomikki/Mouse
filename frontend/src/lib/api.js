/*
 * api.js — thin re-export of the localStorage adapter.
 *
 * Keeping this file so existing imports (`from "../lib/api"`) keep working.
 * All persistence now happens entirely client-side in `storage.js`.
 */
export {
  fetchSprites,
  createSprite,
  updateSprite,
  deleteSprite,
  seedSprites,
  fetchSettings,
  updateSettings,
  exportSprite,
  importSpriteFromObject,
  spriteShareLink,
  parseSpriteFromHash,
  clearShareHash,
} from "./storage";

// kept for any legacy consumer
export const API = "local";
