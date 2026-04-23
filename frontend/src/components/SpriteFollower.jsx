import React, { useEffect, useRef, useState } from "react";
import { useDesktop } from "../context/DesktopContext";

/**
 * Renders an animated sprite that "chases" the cursor with a trailing lag.
 * The native cursor remains visible; the sprite trails behind it,
 * offset opposite to the movement direction so it looks like it's running after.
 */
export default function SpriteFollower({ sprites, settings }) {
  const { mouseState, transientState, ambientState } = useDesktop();
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const pos = useRef({ x: -200, y: -200 });
  const target = useRef({ x: -200, y: -200 });
  const vel = useRef({ x: 0, y: 0 });
  const hiddenRef = useRef(false);
  const [, force] = useState(0);

  // Mouse tracking + RAF lerp — pauses automatically when tab hidden
  useEffect(() => {
    let lastX = null, lastY = null;
    const onMove = (e) => {
      if (lastX !== null) {
        vel.current.x = vel.current.x * 0.7 + (e.clientX - lastX) * 0.3;
        vel.current.y = vel.current.y * 0.7 + (e.clientY - lastY) * 0.3;
      }
      lastX = e.clientX; lastY = e.clientY;
      target.current = { x: e.clientX, y: e.clientY };
    };
    const onVisibility = () => { hiddenRef.current = document.hidden; };
    window.addEventListener("mousemove", onMove);
    document.addEventListener("visibilitychange", onVisibility);
    let rafId;
    const tick = () => {
      if (hiddenRef.current) {
        // Tab hidden — stop animating, schedule a light reschedule when visible again
        setTimeout(() => { rafId = requestAnimationFrame(tick); }, 500);
        return;
      }
      const speed = settings?.follow_speed ?? 0.09;
      pos.current.x += (target.current.x - pos.current.x) * speed;
      pos.current.y += (target.current.y - pos.current.y) * speed;
      vel.current.x *= 0.9;
      vel.current.y *= 0.9;
      if (containerRef.current) {
        const baseOx = settings?.offset_x ?? 30;
        const baseOy = settings?.offset_y ?? 30;
        const speedMag = Math.hypot(vel.current.x, vel.current.y);
        let trailX = 0, trailY = 0;
        if (speedMag > 0.5) {
          const nx = vel.current.x / speedMag;
          const ny = vel.current.y / speedMag;
          trailX = -nx * Math.min(speedMag * 1.2, 40);
          trailY = -ny * Math.min(speedMag * 1.2, 40);
        }
        containerRef.current.style.transform =
          `translate3d(${pos.current.x + baseOx + trailX}px, ${pos.current.y + baseOy + trailY}px, 0)`;
        if (imgRef.current) {
          const dx = target.current.x - pos.current.x;
          imgRef.current.style.transform = dx < -4 ? "scaleX(-1)" : "scaleX(1)";
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(rafId);
    };
  }, [settings?.follow_speed, settings?.offset_x, settings?.offset_y]);

  // Resolve effective state with priority:
  //   transient (close/minimize pulse)
  //   > active user gesture (drag/resize)
  //   > ambient (afk / music / video / audio)
  //   > cursor state (move / idle)
  const effectiveState = (() => {
    if (transientState) return transientState;
    if (mouseState === "drag" || mouseState === "resize") return mouseState;
    if (ambientState) return ambientState;
    return mouseState || "idle";
  })();
  const activeSprite = pickSprite(sprites, settings, effectiveState);

  // Frame cycling — pauses while tab is hidden (performance)
  const [frameIdx, setFrameIdx] = useState(0);
  useEffect(() => {
    setFrameIdx(0);
    if (!activeSprite?.frames?.length) return undefined;
    if (activeSprite.frames.length === 1) return undefined;
    const fps = Math.max(1, activeSprite.fps || 8);
    let interval;
    const start = () => {
      if (interval) clearInterval(interval);
      interval = setInterval(() => {
        if (document.hidden) return;
        setFrameIdx((i) => {
          const next = i + 1;
          if (next >= activeSprite.frames.length) {
            return activeSprite.loop ? 0 : activeSprite.frames.length - 1;
          }
          return next;
        });
      }, 1000 / fps);
    };
    start();
    const onVis = () => { if (!document.hidden) start(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
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
        ref={imgRef}
        src={src}
        alt={activeSprite.name}
        width={size}
        height={size}
        className={`pixelated select-none ${transientState ? "pop-fade" : ""} ${effectiveState === "drag" ? "wiggle" : ""}`}
        draggable={false}
        style={{ userSelect: "none", transition: "transform 120ms ease-out" }}
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
