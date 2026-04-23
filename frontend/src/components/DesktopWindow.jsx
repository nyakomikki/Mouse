import React, { useRef, useEffect } from "react";
import { Minus, X, Square } from "lucide-react";
import { useDesktop } from "../context/DesktopContext";

export default function DesktopWindow({ win, children }) {
  const { updateWindow, focusWindow, minimizeWindow, closeWindow, setMouseState } = useDesktop();
  const headerRef = useRef(null);
  const bodyRef = useRef(null);
  const dragState = useRef(null);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragState.current) return;
      const ds = dragState.current;
      if (ds.mode === "drag") {
        updateWindow(win.id, { x: e.clientX - ds.dx, y: e.clientY - ds.dy });
      } else if (ds.mode === "resize") {
        const newW = Math.max(260, ds.startW + (e.clientX - ds.startX));
        const newH = Math.max(180, ds.startH + (e.clientY - ds.startY));
        updateWindow(win.id, { w: newW, h: newH });
      }
    };
    const onMouseUp = () => {
      if (dragState.current) {
        dragState.current = null;
        setMouseState("move");
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [win.id, updateWindow, setMouseState]);

  const startDrag = (e) => {
    focusWindow(win.id);
    dragState.current = {
      mode: "drag",
      dx: e.clientX - win.x,
      dy: e.clientY - win.y,
    };
    setMouseState("drag");
  };

  const startResize = (e) => {
    e.stopPropagation();
    focusWindow(win.id);
    dragState.current = {
      mode: "resize",
      startX: e.clientX, startY: e.clientY,
      startW: win.w, startH: win.h,
    };
    setMouseState("resize");
  };

  if (win.minimized) return null;

  return (
    <div
      data-testid={`window-${win.app}`}
      onMouseDown={() => focusWindow(win.id)}
      className="absolute bg-[#111111] border border-[#2E2E2E] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden"
      style={{ left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }}
    >
      <div
        ref={headerRef}
        data-testid={`window-header-${win.app}`}
        onMouseDown={startDrag}
        className="h-10 bg-[#0A0A0A] border-b border-[#2E2E2E] flex items-center justify-between px-3 select-none"
        style={{ cursor: "grab" }}
      >
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em] text-[#FAFAFA]">
          <span className="w-2 h-2 bg-[#DC2626]" />
          <span>{win.title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            data-testid={`window-minimize-${win.app}`}
            onClick={(e) => { e.stopPropagation(); minimizeWindow(win.id); }}
            className="w-7 h-7 flex items-center justify-center hover:bg-[#1A1A1A] text-[#888] hover:text-[#FACC15] transition-colors"
            aria-label="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            data-testid={`window-max-${win.app}`}
            onClick={(e) => {
              e.stopPropagation();
              updateWindow(win.id, { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight - 100 });
            }}
            className="w-7 h-7 flex items-center justify-center hover:bg-[#1A1A1A] text-[#888] hover:text-[#FAFAFA] transition-colors"
            aria-label="Maximize"
          >
            <Square size={12} />
          </button>
          <button
            data-testid={`window-close-${win.app}`}
            onClick={(e) => { e.stopPropagation(); closeWindow(win.id); }}
            className="w-7 h-7 flex items-center justify-center hover:bg-[#DC2626] text-[#888] hover:text-[#FAFAFA] transition-colors"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div ref={bodyRef} className="flex-1 overflow-auto scroll-mini bg-[#111111]">
        {children}
      </div>
      <div
        data-testid={`window-resize-${win.app}`}
        onMouseDown={startResize}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
        style={{
          background:
            "linear-gradient(135deg, transparent 0 50%, #2E2E2E 50% 60%, transparent 60% 75%, #2E2E2E 75% 85%, transparent 85%)",
        }}
      />
    </div>
  );
}
