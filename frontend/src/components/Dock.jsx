import React from "react";
import { Settings, Palette, FileText, FolderOpen, Gamepad2 } from "lucide-react";
import { useDesktop } from "../context/DesktopContext";

const items = [
  { app: "settings", icon: Settings, label: "Settings", w: 560, h: 560 },
  { app: "editor", icon: Palette, label: "Sprite Editor", w: 1100, h: 720 },
  { app: "notepad", icon: FileText, label: "Notepad", w: 520, h: 420 },
  { app: "files", icon: FolderOpen, label: "Files", w: 640, h: 480 },
  { app: "playground", icon: Gamepad2, label: "Playground", w: 560, h: 400 },
];

export default function Dock() {
  const { openWindow, windows } = useDesktop();
  return (
    <div
      data-testid="dock"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 flex gap-2 p-2 bg-[#111111]/85 backdrop-blur-2xl border border-[#2E2E2E] rounded z-40"
    >
      {items.map((it) => {
        const Icon = it.icon;
        const open = windows.some((w) => w.app === it.app);
        return (
          <button
            key={it.app}
            data-testid={`dock-${it.app}`}
            onClick={() =>
              openWindow(it.app, {
                singleton: true,
                title: it.label,
                w: it.w,
                h: it.h,
              })
            }
            title={it.label}
            className="relative w-12 h-12 flex items-center justify-center border border-transparent hover:bg-[#1A1A1A] hover:border-[#2E2E2E] transition-all group"
          >
            <Icon size={20} className="text-[#FAFAFA] group-hover:text-[#FACC15] transition-colors" />
            {open && <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-[#DC2626]" />}
            <span className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-mono uppercase tracking-widest bg-[#0A0A0A] border border-[#2E2E2E] px-2 py-1 whitespace-nowrap">
              {it.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
