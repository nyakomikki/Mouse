import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";

const DesktopContext = createContext(null);

let zCounter = 10;

const initialWindows = [
  {
    id: "welcome",
    app: "readme",
    title: "README.TXT",
    x: 120, y: 90, w: 460, h: 300, z: 11, minimized: false,
  },
];

export function DesktopProvider({ children }) {
  const [windows, setWindows] = useState(initialWindows);
  // Direct user-interaction state: 'idle' | 'move' | 'drag' | 'resize'
  const [mouseState, setMouseState] = useState("idle");
  // Brief pulses triggered by specific events: 'minimize' | 'close'
  const [transientState, setTransientState] = useState(null);
  // Ambient / context state: 'music' | 'video' | 'audio' | 'afk' | null
  const [ambientState, setAmbientState] = useState(null);
  const [spritesRefreshKey, setSpritesRefreshKey] = useState(0);

  const openWindow = useCallback((app, opts = {}) => {
    zCounter += 1;
    const id = opts.id || `${app}-${Date.now()}`;
    setWindows((ws) => {
      const existing = ws.find((w) => w.app === app && opts.singleton);
      if (existing) {
        return ws.map((w) =>
          w.id === existing.id ? { ...w, minimized: false, z: zCounter } : w
        );
      }
      return [
        ...ws,
        {
          id,
          app,
          title: opts.title || app.toUpperCase(),
          x: opts.x ?? 160 + (ws.length * 36) % 300,
          y: opts.y ?? 110 + (ws.length * 28) % 180,
          w: opts.w ?? 640,
          h: opts.h ?? 460,
          z: zCounter,
          minimized: false,
          payload: opts.payload,
        },
      ];
    });
  }, []);

  const focusWindow = useCallback((id) => {
    zCounter += 1;
    setWindows((ws) => ws.map((w) => (w.id === id ? { ...w, z: zCounter, minimized: false } : w)));
  }, []);

  const closeWindow = useCallback((id) => {
    setWindows((ws) => ws.filter((w) => w.id !== id));
    triggerTransient("close");
  }, []);

  const minimizeWindow = useCallback((id) => {
    setWindows((ws) => ws.map((w) => (w.id === id ? { ...w, minimized: true } : w)));
    triggerTransient("minimize");
  }, []);

  const updateWindow = useCallback((id, patch) => {
    setWindows((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  }, []);

  const triggerTransient = useCallback((s) => {
    setTransientState(s);
    setTimeout(() => setTransientState(null), 900);
  }, []);

  const bumpSprites = useCallback(() => setSpritesRefreshKey((k) => k + 1), []);

  const value = useMemo(
    () => ({
      windows,
      openWindow,
      closeWindow,
      minimizeWindow,
      focusWindow,
      updateWindow,
      mouseState,
      setMouseState,
      transientState,
      triggerTransient,
      ambientState,
      setAmbientState,
      spritesRefreshKey,
      bumpSprites,
    }),
    [windows, openWindow, closeWindow, minimizeWindow, focusWindow, updateWindow,
     mouseState, transientState, triggerTransient, ambientState, spritesRefreshKey, bumpSprites]
  );

  return <DesktopContext.Provider value={value}>{children}</DesktopContext.Provider>;
}

export const useDesktop = () => {
  const v = useContext(DesktopContext);
  if (!v) throw new Error("useDesktop must be inside DesktopProvider");
  return v;
};

// Keeps mouse state automatically in sync with activity (idle fallback) + AFK detection
export function useAutoIdle(afkTimeoutSec = 30) {
  const { setMouseState, mouseState, setAmbientState, ambientState } = useDesktop();
  useEffect(() => {
    let lastActivity = Date.now();
    let lastMove = Date.now();
    let timer;
    const activity = () => { lastActivity = Date.now(); if (ambientState === "afk") setAmbientState(null); };
    const onMove = (e) => {
      lastMove = Date.now();
      lastActivity = Date.now();
      if (ambientState === "afk") setAmbientState(null);
      if (mouseState === "idle") setMouseState("move");
    };
    const check = () => {
      const now = Date.now();
      if (now - lastMove > 450 && mouseState === "move") setMouseState("idle");
      if (now - lastActivity > afkTimeoutSec * 1000 && ambientState !== "afk") {
        setAmbientState("afk");
      }
      timer = setTimeout(check, 250);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("keydown", activity);
    window.addEventListener("mousedown", activity);
    timer = setTimeout(check, 250);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("mousedown", activity);
      clearTimeout(timer);
    };
  }, [mouseState, setMouseState, ambientState, setAmbientState, afkTimeoutSec]);
}
