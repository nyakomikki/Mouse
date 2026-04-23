/*
 * Mouseferatu — Electron main process.
 *
 * Two windows are created on launch:
 *   1. "Overlay"   — a transparent, always-on-top, click-through window that
 *                    covers the whole primary screen. The puppy sprite is
 *                    rendered here via the React bundle's /overlay route.
 *   2. "Settings"  — a regular frame window that hosts the full Mouseferatu
 *                    React app (Settings, Sprite Editor, Media, etc.). It is
 *                    hidden by default; shown when the user clicks the tray.
 *
 * Native hooks (see native.js) produce a stream of events:
 *   - globalMouseMove   → forwarded to overlay
 *   - mouseState change → idle / move / drag / resize / minimize / close
 *   - ambientState      → music / video / audio / afk
 * These are sent to the overlay via IPC so the existing React SpriteFollower
 * can pick the right puppy animation.
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const AutoLaunch = require('auto-launch');
const native = require('./native');

const store = new Store({ name: 'mouseferatu-settings', defaults: { autoStart: false } });
const autoLauncher = new AutoLaunch({ name: 'Mouseferatu' });

let overlayWin = null;
let settingsWin = null;
let tray = null;

const isDev = !!process.env.MOUSEFERATU_DEV;
const RENDERER_DIR = path.join(__dirname, 'renderer');
const DEV_URL = process.env.MOUSEFERATU_DEV_URL || 'http://localhost:3000';

function rendererURL(route) {
  if (isDev) return `${DEV_URL}${route}`;
  const indexHtml = path.join(RENDERER_DIR, 'index.html');
  return `file://${indexHtml}${route ? `#${route}` : ''}`;
}

function createOverlay() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;
  overlayWin = new BrowserWindow({
    x, y, width, height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  // Click-through: mouse events fall through to whatever's underneath.
  overlayWin.setIgnoreMouseEvents(true, { forward: true });
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.loadURL(rendererURL('?overlay=1'));
  overlayWin.once('ready-to-show', () => overlayWin.showInactive());
  overlayWin.on('closed', () => { overlayWin = null; });
}

function createSettingsWindow() {
  if (settingsWin) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 1180, height: 760,
    minWidth: 900, minHeight: 560,
    backgroundColor: '#0A0A0A',
    title: 'Mouseferatu',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
  });
  settingsWin.loadURL(rendererURL(''));
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.on('closed', () => { settingsWin = null; });
  settingsWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray.png');
  const image = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();
  tray = new Tray(image);
  tray.setToolTip('Mouseferatu — cursor companion');
  const menu = Menu.buildFromTemplate([
    { label: 'Open Settings',     click: () => createSettingsWindow() },
    { label: 'Open Sprite Editor', click: () => {
        createSettingsWindow();
        settingsWin && settingsWin.webContents.send('mouseferatu:open-app', 'editor');
      } },
    { type: 'separator' },
    { label: 'Pause companion', type: 'checkbox', checked: false,
      click: (item) => native.setEnabled(!item.checked) },
    { label: 'Start with Windows', type: 'checkbox', checked: !!store.get('autoStart'),
      click: async (item) => {
        store.set('autoStart', item.checked);
        if (item.checked) await autoLauncher.enable().catch(() => {});
        else await autoLauncher.disable().catch(() => {});
      } },
    { type: 'separator' },
    { label: 'Quit Mouseferatu', role: 'quit' },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => createSettingsWindow());
}

// ---------- IPC bridge between native hooks and the overlay renderer ----------
function relayToOverlay(channel, payload) {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send(channel, payload);
  }
}

ipcMain.handle('mf:getInitial', () => ({
  isOverlay: true,
  platform: process.platform,
  version: app.getVersion(),
}));

ipcMain.on('mf:open-settings', () => createSettingsWindow());

app.whenReady().then(async () => {
  // Honor the stored autoStart preference (best-effort).
  if (store.get('autoStart')) autoLauncher.enable().catch(() => {});

  createOverlay();
  createTray();

  native.start({
    onMouseMove:     (p) => relayToOverlay('mf:mouseMove', p),
    onMouseState:    (s) => relayToOverlay('mf:mouseState', s),
    onAmbientState:  (s) => relayToOverlay('mf:ambientState', s),
    onTransient:     (s) => relayToOverlay('mf:transientState', s),
  });
});

app.on('window-all-closed', (e) => {
  // Keep running in the tray; the overlay is intentionally not in the taskbar.
  e.preventDefault();
});

app.on('before-quit', () => {
  try { native.stop(); } catch (_) { /* ignore */ }
});
