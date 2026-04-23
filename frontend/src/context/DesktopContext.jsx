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
  // Transient mouse state tag: 'idle' | 'move' | 'drag' | 'resize' | 'minimize' | 'close'
  const [mouseState, setMouseState] = useState("idle");
  const [transientState, setTransientState] = useState(null); // pulse e.g. 'minimize'
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
      spritesRefreshKey,
      bumpSprites,
    }),
    [windows, openWindow, closeWindow, minimizeWindow, focusWindow, updateWindow,
     mouseState, transientState, triggerTransient, spritesRefreshKey, bumpSprites]
  );

  return <DesktopContext.Provider value={value}>{children}</DesktopContext.Provider>;
}

export const useDesktop = () => {
  const v = useContext(DesktopContext);
  if (!v) throw new Error("useDesktop must be inside DesktopProvider");
  return v;
};

// Keeps mouse state automatically in sync with activity (idle fallback).
export function useAutoIdle() {
  const { setMouseState, mouseState } = useDesktop();
  useEffect(() => {
    let last = Date.now();
    let timer;
    const onMove = () => {
      last = Date.now();
      if (mouseState === "idle") setMouseState("move");
    };
    const check = () => {
      if (Date.now() - last > 450 && (mouseState === "move")) {
        setMouseState("idle");
      }
      timer = setTimeout(check, 150);
    };
    window.addEventListener("mousemove", onMove);
    timer = setTimeout(check, 150);
    return () => {
      window.removeEventListener("mousemove", onMove);
      clearTimeout(timer);
    };
  }, [mouseState, setMouseState]);
}
