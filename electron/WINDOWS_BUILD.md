# Mouseferatu — Build for Windows

Mouseferatu ships as a native Windows desktop app via **Electron**.
You get a translucent always-on-top overlay where the puppy chases your
cursor across the entire desktop, plus a tray icon + Settings / Sprite
Editor windows.

---

## Prerequisites (on your Windows machine)

1. **Node.js 20 LTS or newer** — <https://nodejs.org> (installer, add to PATH).
2. **Yarn Classic** — `npm i -g yarn` (v1.22+).
3. **Windows Build Tools** (only needed the first time; installs a C++
   toolchain so the native mouse-hook module can compile):
   ```powershell
   npm i -g windows-build-tools
   ```
   If that fails on Windows 11, use Visual Studio Installer → install
   "Desktop development with C++" workload instead.
4. **Git** — to clone this repo.

---

## One-time setup

```powershell
# 1. Clone your project
git clone <your-repo-url> mouseferatu
cd mouseferatu

# 2. Build the React front-end (produces /frontend/build/)
cd frontend
yarn install
yarn build
# copy the built bundle into the electron renderer folder
xcopy /E /I /Y build ..\electron\renderer

# 3. Install the Electron side (compiles native modules)
cd ..\electron
yarn install
```

> **Heads-up about the backend:** the React front-end currently calls
> `REACT_APP_BACKEND_URL` (the FastAPI + MongoDB service) to load sprites
> and settings. If you want Mouseferatu to run **fully offline** on the
> desktop, point that URL to a local backend before `yarn build` — see
> "Running the backend locally" below.

---

## Run it in dev (fast iteration, no installer)

From `/electron`:
```powershell
# starts Electron against a dev React server on http://localhost:3000
cd ..\frontend
yarn start        # in one terminal
cd ..\electron
yarn start:dev    # in another
```

The overlay appears over your whole screen, the puppy follows your real
mouse, and changes you save in Settings / Sprite Editor hit the live
backend as usual.

---

## Build the installable `.exe`

From `/electron`:
```powershell
yarn dist
```

That produces `dist\Mouseferatu-Setup-0.1.0.exe` (≈110 MB).
Double-click to install. The app will:

- Launch a tray icon (right-click for menu: Settings, Sprite Editor,
  Pause companion, Start with Windows, Quit).
- Show a translucent overlay above every window with the puppy.
- Register an auto-start entry **only if** you toggle "Start with
  Windows" from the tray menu (default off).

### First-run warning
Since the build isn't code-signed yet, Windows SmartScreen will show a
"Windows protected your PC" dialog → click **More info** → **Run
anyway**. To make that go away, buy a code-signing certificate
(DigiCert / Sectigo / SSL.com ≈ $80–300/yr) and add to
`electron/package.json` under `build.win`:
```json
"certificateFile": "path/to/cert.pfx",
"certificatePassword": "..."
```

---

## Running the backend locally (offline mode)

The React app was built for a web preview, so it currently needs the
FastAPI backend to persist sprites + settings. Two options:

### Option A — keep using the hosted backend
Nothing to do. `REACT_APP_BACKEND_URL` is already baked into the React
bundle you built. Everyone who installs the app hits your Emergent
preview backend. Easiest but requires network + your preview app staying
alive.

### Option B — bundle a local backend (recommended for distribution)
1. Install MongoDB Community Server on the machine (or use a tiny
   embedded DB — see below).
2. Run the FastAPI server on `127.0.0.1:8001` (you already have it in
   `/app/backend`).
3. Before `yarn build` of the frontend, set:
   ```powershell
   $env:REACT_APP_BACKEND_URL="http://127.0.0.1:8001"
   yarn build
   ```
4. (Optional, heavier) Spawn the Python backend as a child process of
   Electron — add to `main.js`:
   ```js
   const { spawn } = require('child_process');
   const backend = spawn('python', ['-m', 'uvicorn', 'server:app',
     '--host', '127.0.0.1', '--port', '8001'], { cwd: path.join(__dirname, 'backend') });
   app.on('before-quit', () => backend.kill());
   ```
   Package Python + dependencies with `pyinstaller` and copy `backend`
   into `electron/` before `yarn dist`.

### Option C — rewrite persistence to localStorage (simplest for v1)
If you don't need cross-device sync, swap the axios calls in
`frontend/src/lib/api.js` for a localStorage-backed adapter. ~40 lines
of code; keeps the app 100% offline with zero extra processes.
(Happy to generate that for you — just say the word.)

---

## What each state listens to on real Windows

| Puppy state | Native trigger |
|---|---|
| **idle**      | No cursor movement for ~500 ms |
| **move**      | `uiohook-napi` global `mousemove` |
| **drag**      | Mouse button held + any top-level window's position changes (polled every 200 ms) |
| **resize**    | Mouse button held + any top-level window's size changes |
| **minimize**  | A top-level window disappears but its owner app is still around |
| **close**     | A top-level window disappears and its owner app is gone too |
| **music**     | `active-win` detects Spotify / iTunes / etc. in focus, or YouTube Music / Spotify Web in a browser tab |
| **video**     | `active-win` detects VLC / mpv / Netflix, or YouTube / Netflix / Twitch in a browser tab |
| **audio**     | Short-lived (fires on OS notification beeps — extend if you want) |
| **afk**       | No mouse or keyboard activity for 60 seconds |

Tune thresholds and app name regexes in `electron/native.js`.

---

## Troubleshooting

- **The installer runs but nothing appears** — check Task Manager; the
  app is running. Look at the system tray (next to the clock); the
  Mouseferatu icon lives there. Right-click → Open Settings.
- **The puppy is invisible** — the overlay window might be covered by
  an always-on-top app (OBS, some games). That's a Windows limitation
  for click-through overlays.
- **"A JavaScript error occurred in the main process: uiohook-napi"** —
  the native module didn't compile. Re-run `yarn install` inside
  `/electron` with the C++ toolchain installed (see Prerequisites 3).
- **Antivirus flags the installer** — unsigned Electron apps get flagged
  often. Code-signing fixes this.

---

## Next steps to ship it

1. **Buy a code-signing cert** → signed builds, no SmartScreen warning.
2. **Auto-updates** — add `electron-updater` + a GitHub Releases feed
   so users get upgrades without re-downloading.
3. **Local backend** — go with Option C above for the cleanest
   distribution story.
4. **Bigger icon assets** — drop a 256×256 `icon.ico` into
   `electron/assets/` and a 32×32 `tray.png` for the tray.
