import React, { useEffect, useRef, useState } from "react";
import { useDesktop } from "../context/DesktopContext";

/**
 * Renders an animated sprite that smoothly follows the cursor.
 * Chooses which sprite to display based on current mouseState (via DesktopContext)
 * and settings.state_map. Falls back to any sprite whose `tags` include the state,
 * then to the first sprite in the library.
 */
export default function SpriteFollower({ sprites, settings }) {
  const { mouseState, transientState } = useDesktop();
  const containerRef = useRef(null);
  const pos = useRef({ x: 0, y: 0 });
  const target = useRef({ x: 0, y: 0 });
  const [, force] = useState(0);

  // Mouse tracking + RAF lerp
  useEffect(() => {
    const onMove = (e) => {
      target.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMove);
    let rafId;
    const tick = () => {
      const speed = settings?.follow_speed ?? 0.18;
      pos.current.x += (target.current.x - pos.current.x) * speed;
      pos.current.y += (target.current.y - pos.current.y) * speed;
      if (containerRef.current) {
        const ox = settings?.offset_x ?? 18;
        const oy = settings?.offset_y ?? 18;
        containerRef.current.style.transform =
          `translate3d(${pos.current.x + ox}px, ${pos.current.y + oy}px, 0)`;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(rafId);
    };
  }, [settings?.follow_speed, settings?.offset_x, settings?.offset_y]);

  // Pick active sprite based on state
  const effectiveState = transientState || mouseState || "idle";
  const activeSprite = pickSprite(sprites, settings, effectiveState);

  // Frame cycling
  const [frameIdx, setFrameIdx] = useState(0);
  useEffect(() => {
    setFrameIdx(0);
    if (!activeSprite?.frames?.length) return undefined;
    if (activeSprite.frames.length === 1) return undefined;
    const fps = Math.max(1, activeSprite.fps || 8);
    const interval = setInterval(() => {
      setFrameIdx((i) => {
        const next = i + 1;
        if (next >= activeSprite.frames.length) {
          return activeSprite.loop ? 0 : activeSprite.frames.length - 1;
        }
        return next;
      });
    }, 1000 / fps);
    return () => clearInterval(interval);
  }, [activeSprite?.id, activeSprite?.fps, activeSprite?.loop, activeSprite?.frames?.length]);

  useEffect(() => { force((n) => n + 1); }, []);

  if (!settings?.enabled) return null;
  if (!activeSprite?.frames?.length) return null;

  const size = settings?.sprite_size ?? 64;
  const src = activeSprite.frames[frameIdx]?.data;

  return (
    <div
      ref={containerRef}
      data-testid="sprite-follower"
      data-state={effectiveState}
      style={{
        position: "fixed",
        left: 0, top: 0,
        pointerEvents: "none",
        zIndex: 99999,
        willChange: "transform",
      }}
    >
      <img
        src={src}
        alt={activeSprite.name}
        width={size}
        height={size}
        className={`pixelated select-none ${transientState ? "pop-fade" : ""} ${effectiveState === "drag" ? "wiggle" : ""}`}
        draggable={false}
        style={{ userSelect: "none" }}
      />
    </div>
  );
}

function pickSprite(sprites, settings, state) {
  if (!sprites?.length) return null;
  const map = settings?.state_map || {};
  const assigned = map[state];
  if (assigned) {
    const s = sprites.find((sp) => sp.id === assigned);
    if (s) return s;
  }
  // fallback: any sprite tagged with this state
  const tagged = sprites.find((sp) => (sp.tags || []).includes(state));
  if (tagged) return tagged;
  // fallback: idle assignment if exists
  const idleAssigned = map.idle;
  if (idleAssigned) {
    const s = sprites.find((sp) => sp.id === idleAssigned);
    if (s) return s;
  }
  const idleTagged = sprites.find((sp) => (sp.tags || []).includes("idle"));
  if (idleTagged) return idleTagged;
  return sprites[0];
}
