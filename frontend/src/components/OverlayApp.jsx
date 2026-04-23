import React, { useEffect, useMemo, useRef, useState } from "react";
import SpriteFollower from "./SpriteFollower";
import { fetchSprites, fetchSettings } from "../lib/api";

/**
 * OverlayApp — the renderer that runs inside the Electron transparent
 * click-through window. It does nothing but listen to IPC events coming
 * from the Electron main process (global mouse + state) and render the
 * existing SpriteFollower on top of the whole screen.
 */

// A light-weight stand-in for DesktopContext so SpriteFollower keeps working
// without any of the fake-desktop UI around it.
import { createContext, useContext } from "react";

const OverlayContext = createContext(null);
export const useOverlay = () => useContext(OverlayContext);

function OverlayProvider({ children }) {
  const [mouseState, setMouseState] = useState("idle");
  const [transientState, setTransientState] = useState(null);
  const [ambientState, setAmbientState] = useState(null);

  useEffect(() => {
    if (!window.electronAPI) return undefined;
    const offMove = window.electronAPI.on("mf:mouseMove", (p) => {
      // Re-broadcast as a synthetic mousemove so the existing SpriteFollower
      // RAF loop (which listens on window) can pick it up without changes.
      const evt = new MouseEvent("mousemove", { clientX: p.x, clientY: p.y });
      window.dispatchEvent(evt);
    });
    const offState = window.electronAPI.on("mf:mouseState", (s) => setMouseState(s || "idle"));
    const offAmb = window.electronAPI.on("mf:ambientState", (s) => setAmbientState(s));
    const offTrans = window.electronAPI.on("mf:transientState", (s) => {
      setTransientState(s);
      setTimeout(() => setTransientState(null), 900);
    });
    return () => { offMove(); offState(); offAmb(); offTrans(); };
  }, []);

  const value = useMemo(
    () => ({ mouseState, transientState, ambientState, setMouseState, setAmbientState }),
    [mouseState, transientState, ambientState]
  );
  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
}

// Monkey-patch the DesktopContext consumer used by SpriteFollower so it reads
// from the overlay context instead.
// SpriteFollower uses `useDesktop()` — we override that import via the module
// path. Instead of rewriting SpriteFollower, we re-export a shim.
export default function OverlayApp() {
  const [sprites, setSprites] = useState([]);
  const [settings, setSettings] = useState({
    enabled: true, sprite_size: 56, follow_speed: 0.09,
    offset_x: 30, offset_y: 30, state_map: {},
  });
  useEffect(() => {
    (async () => {
      try { setSprites(await fetchSprites()); } catch {}
      try { setSettings(await fetchSettings()); } catch {}
    })();
  }, []);

  return (
    <OverlayProvider>
      <OverlaySpriteFollowerShim sprites={sprites} settings={settings} />
    </OverlayProvider>
  );
}

// A thin shim that injects the overlay context into SpriteFollower's
// `useDesktop` calls by rendering it inside a DesktopProvider-compatible
// wrapper. SpriteFollower only reads mouseState/transientState/ambientState
// from context, so we expose exactly those keys.
import { DesktopProvider, useDesktop } from "../context/DesktopContext";

function OverlaySpriteFollowerShim({ sprites, settings }) {
  return (
    <DesktopProvider>
      <OverlaySync />
      <SpriteFollower sprites={sprites} settings={settings} />
    </DesktopProvider>
  );
}

function OverlaySync() {
  const desk = useDesktop();
  const ov = useOverlay();
  useEffect(() => { desk.setMouseState(ov.mouseState); }, [ov.mouseState]);
  useEffect(() => {
    if (ov.transientState) desk.triggerTransient(ov.transientState);
  }, [ov.transientState]);
  useEffect(() => { desk.setAmbientState(ov.ambientState); }, [ov.ambientState]);
  return null;
}
