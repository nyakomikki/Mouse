import React, { useState } from "react";
import { useDesktop } from "../../context/DesktopContext";

export function ReadmeApp() {
  return (
    <div className="p-6 text-[#FAFAFA] font-mono text-sm leading-relaxed" data-testid="readme-app">
      <div className="text-xs uppercase tracking-[0.3em] text-[#888]">Mouseferatu // v0.1</div>
      <h1 className="text-2xl mt-2 mb-4 font-sans font-semibold tracking-tight">A cursor companion for your desktop.</h1>
      <p className="text-[#aaaaaa]">
        This is a simulated Windows desktop running in your browser. A pixel companion follows your mouse
        and switches animations based on what you're doing:
      </p>
      <ul className="mt-3 space-y-1 text-[#aaaaaa]">
        <li><span className="text-[#FACC15]">·</span> <b className="text-[#FAFAFA]">at rest</b> — idle sprite</li>
        <li><span className="text-[#FACC15]">·</span> <b className="text-[#FAFAFA]">moving</b> — trail / walk</li>
        <li><span className="text-[#FACC15]">·</span> <b className="text-[#FAFAFA]">dragging</b> — grab pose (drag any window header)</li>
        <li><span className="text-[#FACC15]">·</span> <b className="text-[#FAFAFA]">resizing</b> — stretch pose (corner handle ↘)</li>
        <li><span className="text-[#FACC15]">·</span> <b className="text-[#FAFAFA]">minimize / close</b> — reaction burst (window buttons)</li>
      </ul>
      <div className="mt-5 text-[#888]">
        Open the <b className="text-[#FAFAFA]">Sprite Editor</b> from the dock to draw your own pixel companion — frame by frame.
      </div>
    </div>
  );
}

export function NotepadApp() {
  const [text, setText] = useState("Drag this window's header.\nResize from the bottom-right corner.\nClick − to minimize or × to close.\nWatch the companion react.");
  return (
    <div className="h-full flex flex-col" data-testid="notepad-app">
      <div className="px-3 py-2 border-b border-[#2E2E2E] text-[10px] font-mono uppercase tracking-widest text-[#888]">untitled.txt</div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="flex-1 bg-[#0A0A0A] text-[#FAFAFA] p-4 font-mono text-sm outline-none resize-none"
      />
    </div>
  );
}

export function FilesApp() {
  const items = [
    { name: "sprites/", type: "dir" },
    { name: "animations/", type: "dir" },
    { name: "README.TXT", type: "txt" },
    { name: "companion.exe", type: "exe" },
    { name: "palette.pal", type: "pal" },
  ];
  return (
    <div className="h-full overflow-auto scroll-mini" data-testid="files-app">
      <table className="w-full text-sm">
        <thead className="bg-[#0A0A0A] text-[#888] text-[10px] font-mono uppercase tracking-widest">
          <tr><th className="text-left px-4 py-2">Name</th><th className="text-left px-4 py-2">Type</th></tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.name} className="border-t border-[#2E2E2E] hover:bg-[#1A1A1A]">
              <td className="px-4 py-2 font-mono">{it.name}</td>
              <td className="px-4 py-2 font-mono text-[#888]">{it.type}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PlaygroundApp() {
  const { triggerTransient, setAmbientState, ambientState } = useDesktop();
  return (
    <div className="p-6 space-y-4" data-testid="playground-app">
      <div className="text-xs font-mono uppercase tracking-[0.25em] text-[#888]">Trigger the companion</div>
      <p className="text-sm text-[#aaa]">Fire each state manually and watch the blob morph.</p>
      <div className="grid grid-cols-2 gap-2">
        {["idle","move","drag","resize","minimize","close"].map((s) => (
          <button
            key={s}
            data-testid={`trigger-${s}`}
            onClick={() => triggerTransient(s)}
            className="px-3 py-2 text-xs font-mono uppercase tracking-widest border border-[#2E2E2E] hover:bg-[#1A1A1A] hover:border-[#FAFAFA] transition-all"
          >{s}</button>
        ))}
      </div>
      <div className="text-xs font-mono uppercase tracking-[0.25em] text-[#888] pt-2">Ambient states</div>
      <div className="grid grid-cols-2 gap-2">
        {["music","video","audio","afk"].map((s) => (
          <button
            key={s}
            data-testid={`ambient-${s}`}
            onClick={() => setAmbientState(ambientState === s ? null : s)}
            className={`px-3 py-2 text-xs font-mono uppercase tracking-widest border transition-all ${ambientState === s ? "bg-[#FAFAFA] text-[#0A0A0A] border-[#FAFAFA]" : "border-[#2E2E2E] hover:bg-[#1A1A1A] hover:border-[#FAFAFA]"}`}
          >{s}</button>
        ))}
      </div>
    </div>
  );
}
