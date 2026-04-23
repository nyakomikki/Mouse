import React, { useEffect, useState } from "react";
import { DesktopProvider, useDesktop, useAutoIdle } from "../context/DesktopContext";
import DesktopWindow from "./DesktopWindow";
import Dock from "./Dock";
import SpriteFollower from "./SpriteFollower";
import SettingsApp from "./apps/SettingsApp";
import SpriteEditorApp from "./apps/SpriteEditorApp";
import { ReadmeApp, NotepadApp, FilesApp, PlaygroundApp } from "./apps/MiniApps";
import { fetchSprites, fetchSettings, updateSettings } from "../lib/api";
import { Toaster } from "./ui/sonner";

function DesktopInner() {
  useAutoIdle();
  const { windows, mouseState, transientState } = useDesktop();

  const [sprites, setSprites] = useState([]);
  const [settings, setSettings] = useState({
    enabled: true, sprite_size: 64, follow_speed: 0.18, offset_x: 18, offset_y: 18,
    state_map: {}
  });

  const refreshSprites = async () => {
    try { setSprites(await fetchSprites()); } catch (e) { /* swallow */ }
  };

  useEffect(() => {
    (async () => {
      await refreshSprites();
      try { setSettings(await fetchSettings()); } catch {}
    })();
  }, []);

  const setActiveSpriteId = async (id) => {
    const next = { ...settings, state_map: { ...(settings.state_map || {}), idle: id, move: id } };
    setSettings(next);
    try { await updateSettings({ state_map: next.state_map }); } catch {}
  };

  const renderApp = (win) => {
    switch (win.app) {
      case "settings":
        return <SettingsApp settings={settings} setSettings={setSettings} sprites={sprites} onSpritesRefresh={refreshSprites} />;
      case "editor":
        return <SpriteEditorApp sprites={sprites} onSpritesRefresh={refreshSprites} setActiveSpriteId={setActiveSpriteId} />;
      case "readme": return <ReadmeApp />;
      case "notepad": return <NotepadApp />;
      case "files": return <FilesApp />;
      case "playground": return <PlaygroundApp />;
      default: return <div className="p-6 text-sm text-[#888]">Unknown app</div>;
    }
  };

  return (
    <div className="dot-grid relative h-screen w-screen overflow-hidden hide-cursor" data-testid="desktop-root">
      {/* Wallpaper tint */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 20% 10%, rgba(220,38,38,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 90%, rgba(250,204,21,0.06) 0%, transparent 55%)",
        }}
      />

      {/* Top status bar */}
      <div className="absolute top-0 left-0 right-0 h-8 flex items-center justify-between px-4 text-[10px] font-mono uppercase tracking-[0.25em] text-[#888] bg-[#0A0A0A]/70 backdrop-blur border-b border-[#2E2E2E] z-30">
        <div className="flex items-center gap-3">
          <span className="text-[#FAFAFA]">MOUSEFERATU OS</span>
          <span>/</span>
          <span>cursor companion // v0.1</span>
        </div>
        <div className="flex items-center gap-4">
          <span data-testid="state-indicator" className="text-[#FACC15]">
            state: {transientState || mouseState}
          </span>
          <span>windows: {windows.filter(w => !w.minimized).length}</span>
          <span>sprites: {sprites.length}</span>
        </div>
      </div>

      {/* Windows */}
      {windows.map((w) => (
        <DesktopWindow key={w.id} win={w}>{renderApp(w)}</DesktopWindow>
      ))}

      {/* Minimized tray */}
      <div className="absolute bottom-28 left-1/2 -translate-x-1/2 flex gap-2 z-30">
        {windows.filter((w) => w.minimized).map((w) => (
          <MinimizedChip key={w.id} win={w} />
        ))}
      </div>

      {/* Dock */}
      <Dock />

      {/* Cursor companion */}
      <SpriteFollower sprites={sprites} settings={settings} />

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
