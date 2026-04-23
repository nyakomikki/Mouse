# Mouseferatu — Product Requirements

## Original problem statement
> "Build a Windows APP that enhances the Mouse. Animated sprite follows the mouse, plays different animations for moving objects / resizing windows / minimizing / exiting programs / at rest. Quick launch for settings. Editor to design custom animated sprites." (user later iterated to: zombie blob → puppy chewing a bone)

## What's been implemented (as of 2026-04-23)
### Browser simulation (running on this Emergent preview)
- React + FastAPI + MongoDB desktop companion simulator
- Fake desktop with draggable/resizable/minimizable windows
- Puppy sprite companion with 10 per-state animations (chewing/chase/tug/stretch/lie-down/bark/bop/watch/listen/nap)
- Bone-shaped cursor (SVG) with sm/md/lg sizes
- Sprite Editor (frame-by-frame, onion skin, playback, library)
- Settings (size, speed, offsets, per-state sprite mapping, cursor theme/size, AFK timeout, tray toggle, click flash, reduce motion)
- System tray chip in top bar (click opens Settings)
- Media app (WebAudio synth music, canvas video, notify beep)
- Playground for manually triggering each state
- Idle chew behavior: puppy offset overrides to center on cursor
- Chase behavior: velocity-based trailing when mouse moves
- Performance: RAF + frame cycling pause when document.hidden
- Priority resolver: transient > drag/resize > ambient > move/idle

### Native Windows Electron bundle (`/app/electron/`)
- `main.js` — transparent click-through overlay + Settings window + tray + auto-launch
- `native.js` — global mouse hook (uiohook-napi) + active-window polling (active-win, get-windows) → derives drag/resize/minimize/close/music/video/afk states
- `preload.js` — safe IPC bridge
- `OverlayApp.jsx` — React renderer for the overlay window; dispatches synthetic mousemove events from IPC so SpriteFollower works unchanged
- `WINDOWS_BUILD.md` — step-by-step build instructions (prerequisites, dev mode, `yarn dist`, code-signing notes, troubleshooting)

## Next tasks / backlog
- P1 · Ship Level C: rewrite `frontend/src/lib/api.js` to localStorage backend so packaged Electron app runs 100% offline.
- P1 · Bundle FastAPI + MongoDB (or sqlite swap) as a Python sidecar for offline distribution.
- P1 · Code-signing cert workflow + auto-update via electron-updater.
- P2 · Better per-state Windows hooks: use `SetWinEventHook` through a tiny C++ addon for real minimize/close events rather than polling.
- P2 · "Treat sparkle" particle effect when puppy finishes a chew cycle.
- P2 · Theme gallery (swap between puppy, zombie-blob, cat, ghost with one click).
- P3 · Community sprite sharing (share-link, import from URL).
- P3 · Multi-monitor support for the overlay window.
