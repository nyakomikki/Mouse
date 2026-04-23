import React, { useEffect, useState, useCallback } from "react";
import { DesktopProvider, useDesktop, useAutoIdle } from "../context/DesktopContext";
import DesktopWindow from "./DesktopWindow";
import Dock from "./Dock";
import SpriteFollower from "./SpriteFollower";
import SystemTray from "./SystemTray";
import SettingsApp from "./apps/SettingsApp";
import SpriteEditorApp from "./apps/SpriteEditorApp";
import MediaApp from "./apps/MediaApp";
import { ReadmeApp, NotepadApp, FilesApp, PlaygroundApp } from "./apps/MiniApps";
import { fetchSprites, fetchSettings, updateSettings } from "../lib/api";
import { Toaster } from "./ui/sonner";

function DesktopInner() {
  const [sprites, setSprites] = useState([]);
  const [settings, setSettings] = useState({
    enabled: true, sprite_size: 56, follow_speed: 0.09, offset_x: 30, offset_y: 30,
    cursor_theme: "zombie", cursor_size: "md", show_in_tray: true, click_flash: false,
    afk_timeout_sec: 30, reduce_motion: false,
    state_map: {},
  });

  useAutoIdle(settings.afk_timeout_sec || 30);
  const { windows, mouseState, transientState, ambientState, openWindow } = useDesktop();

  const refreshSprites = async () => {
    try { setSprites(await fetchSprites()); } catch { /* swallow */ }
  };

  useEffect(() => {
    (async () => {
      await refreshSprites();
      try { setSettings(await fetchSettings()); } catch { /* keep defaults */ }
    })();
  }, []);

  const setActiveSpriteId = async (id) => {
    const next = { ...settings, state_map: { ...(settings.state_map || {}), idle: id, move: id } };
    setSettings(next);
    try { await updateSettings({ state_map: next.state_map }); } catch { /* nop */ }
  };

  // Click-flash feedback (pools up to 6 concurrent dots)
  const [flashes, setFlashes] = useState([]);
  useEffect(() => {
    if (!settings.click_flash) return undefined;
    let nextId = 0;
    const onDown = (e) => {
      const id = ++nextId;
      setFlashes((f) => [...f.slice(-5), { id, x: e.clientX, y: e.clientY }]);
      setTimeout(() => setFlashes((f) => f.filter((x) => x.id !== id)), 400);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [settings.click_flash]);

  const renderApp = (win) => {
    switch (win.app) {
      case "settings":
        return <SettingsApp settings={settings} setSettings={setSettings} sprites={sprites} onSpritesRefresh={refreshSprites} />;
      case "editor":
        return <SpriteEditorApp sprites={sprites} onSpritesRefresh={refreshSprites} setActiveSpriteId={setActiveSpriteId} />;
      case "media":   return <MediaApp />;
      case "readme":  return <ReadmeApp />;
      case "notepad": return <NotepadApp />;
      case "files":   return <FilesApp />;
      case "playground": return <PlaygroundApp />;
      default: return <div className="p-6 text-sm text-[#888]">Unknown app</div>;
    }
  };

  const openSettings = useCallback(() => {
    openWindow("settings", { singleton: true, title: "Settings", w: 620, h: 640 });
  }, [openWindow]);

  // Effective state mirrors SpriteFollower priority for the tray display
  const effectiveState = (() => {
    if (transientState) return transientState;
    if (mouseState === "drag" || mouseState === "resize") return mouseState;
    if (ambientState) return ambientState;
    return mouseState || "idle";
  })();

  const cursorClass = settings.cursor_theme === "classic"
    ? "classic-cursor"
    : settings.cursor_theme === "off"
      ? "off-cursor"
      : "zombie-cursor";
  const sizeClass = `cursor-${settings.cursor_size || "md"}`;

  return (
    <div
      className={`dot-grid relative h-screen w-screen overflow-hidden ${cursorClass} ${sizeClass}`}
      data-testid="desktop-root"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 20% 10%, rgba(220,38,38,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 90%, rgba(250,204,21,0.06) 0%, transparent 55%)",
        }}
      />

      {/* Top status / task bar with system tray */}
      <div className="absolute top-0 left-0 right-0 h-9 flex items-center justify-between px-4 text-[10px] font-mono uppercase tracking-[0.25em] text-[#888] bg-[#0A0A0A]/80 backdrop-blur border-b border-[#2E2E2E] z-30">
        <div className="flex items-center gap-3">
          <span className="text-[#FAFAFA]">MOUSEFERATU OS</span>
          <span>/</span>
          <span>cursor companion // v0.1</span>
        </div>
        <div className="flex items-center gap-3">
          <span data-testid="state-indicator" className="text-[#FACC15]">
            state: {effectiveState}
          </span>
          <span>windows: {windows.filter((w) => !w.minimized).length}</span>
          <span>sprites: {sprites.length}</span>
          <span className="w-px h-4 bg-[#2E2E2E]" />
          <SystemTray
            sprites={sprites}
            settings={settings}
            effectiveState={effectiveState}
            onOpenSettings={openSettings}
          />
        </div>
      </div>

      {windows.map((w) => (
        <DesktopWindow key={w.id} win={w}>{renderApp(w)}</DesktopWindow>
      ))}

      {/* Minimized tray (window chips) */}
      <div className="absolute bottom-28 left-1/2 -translate-x-1/2 flex gap-2 z-30">
        {windows.filter((w) => w.minimized).map((w) => (
          <MinimizedChip key={w.id} win={w} />
        ))}
      </div>

      <Dock />

      <SpriteFollower sprites={sprites} settings={settings} />

      {/* Click flashes */}
      {flashes.map((f) => (
        <span key={f.id} className="click-flash-dot" style={{ left: f.x, top: f.y }} />
      ))}

      <Toaster position="top-right" />
    </div>
  );
}

function MinimizedChip({ win }) {
  const { focusWindow } = useDesktop();
  return (
    <button
      data-testid={`min-chip-${win.app}`}
      onClick={() => focusWindow(win.id)}
      className="px-3 py-1 text-[10px] font-mono uppercase tracking-widest border border-[#2E2E2E] bg-[#111111]/80 hover:border-[#FAFAFA] hover:bg-[#1A1A1A] transition-all"
    >
      {win.title}
    </button>
  );
}

export default function Desktop() {
  return (
    <DesktopProvider>
      <DesktopInner />
    </DesktopProvider>
  );
}
