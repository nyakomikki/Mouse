import React, { useEffect, useRef, useState } from "react";

/**
 * System tray — a small companion chip in the top status bar.
 * Click to open Settings, hover to see current state.
 */
export default function SystemTray({ sprites, settings, effectiveState, onOpenSettings }) {
  const imgRef = useRef(null);
  const [frameIdx, setFrameIdx] = useState(0);

  // Pick tray sprite (uses state_map mapping; falls back to idle)
  const activeId = settings?.state_map?.[effectiveState] || settings?.state_map?.idle;
  const sprite = (sprites || []).find((s) => s.id === activeId) || (sprites || [])[0];

  // Animate — pauses while tab hidden
  useEffect(() => {
    setFrameIdx(0);
    if (!sprite?.frames?.length || sprite.frames.length === 1) return undefined;
    const fps = Math.max(1, sprite.fps || 6);
    const id = setInterval(() => {
      if (document.hidden) return;
      setFrameIdx((i) => (i + 1) % sprite.frames.length);
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [sprite?.id, sprite?.fps, sprite?.frames?.length]);

  if (!settings?.show_in_tray) return null;
  if (!sprite) return null;

  return (
    <button
      data-testid="system-tray"
      onClick={onOpenSettings}
      title={`Companion: ${effectiveState}`}
      className="flex items-center gap-2 px-2 py-0.5 border border-[#2E2E2E] hover:bg-[#1A1A1A] hover:border-[#6fa04f] transition-all"
    >
      <img
        ref={imgRef}
        src={sprite.frames[Math.min(frameIdx, sprite.frames.length - 1)]?.data}
        alt={sprite.name}
        width={18}
        height={18}
        className="pixelated tray-pulse"
        draggable={false}
      />
      <span className="text-[9px] font-mono uppercase tracking-widest text-[#888]">
        {effectiveState}
      </span>
    </button>
  );
}
