import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Pencil, Eraser, PaintBucket, Pipette, Trash2, Copy, Plus,
  Play, Pause, Save, Eye, EyeOff, SquarePlus, Download, Upload, Share2
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Slider } from "../ui/slider";
import { Switch } from "../ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { toast } from "sonner";
import {
  createSprite, updateSprite, deleteSprite,
  exportSprite, importSpriteFromObject, spriteShareLink,
} from "../../lib/api";

const DEFAULT_W = 32;
const DEFAULT_H = 32;
const PIXEL = (r,g,b,a=255) => [r,g,b,a];
const CLEAR = [0,0,0,0];

const PALETTE = [
  "#FAFAFA","#888888","#2E2E2E","#0A0A0A",
  "#DC2626","#F97316","#FACC15","#22C55E",
  "#0EA5E9","#6366F1","#A855F7","#EC4899",
  "#7C2D12","#065F46","#1E3A8A","#4C1D95",
];

function hexToRgba(hex) {
  const h = hex.replace("#","");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16), 255];
}
function rgbaEq(a,b){return a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2]&&a[3]===b[3];}

function emptyFrame(w,h){
  return Array.from({length: h}, () => Array.from({length: w}, () => CLEAR.slice()));
}

// Render a frame (2D array of [r,g,b,a]) to a base64 PNG data URL using a canvas.
function frameToDataURL(frame, w, h, scale = 4) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  const imgData = ctx.createImageData(w, h);
  for (let y=0; y<h; y++){
    for (let x=0; x<w; x++){
      const idx = (y*w + x) * 4;
      const p = frame[y][x];
      imgData.data[idx] = p[0];
      imgData.data[idx+1] = p[1];
      imgData.data[idx+2] = p[2];
      imgData.data[idx+3] = p[3];
    }
  }
  ctx.putImageData(imgData, 0, 0);
  // Optional upscale (keeps nearest-neighbour for export)
  const c2 = document.createElement("canvas");
  c2.width = w*scale; c2.height = h*scale;
  const ctx2 = c2.getContext("2d");
  ctx2.imageSmoothingEnabled = false;
  ctx2.drawImage(c, 0, 0, w*scale, h*scale);
  return c2.toDataURL("image/png");
}

// Load a PNG data URL into a 2D pixel array of size w x h (downsample via image bitmap).
async function dataURLToFrame(url, w, h) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const frame = [];
  for (let y=0; y<h; y++){
    const row = [];
    for (let x=0; x<w; x++){
      const i = (y*w + x) * 4;
      row.push([data[i], data[i+1], data[i+2], data[i+3]]);
    }
    frame.push(row);
  }
  return frame;
}

export default function SpriteEditorApp({ sprites, onSpritesRefresh, activeSpriteId, setActiveSpriteId }) {
  const [name, setName] = useState("Untitled Sprite");
  const [width, setWidth] = useState(DEFAULT_W);
  const [height, setHeight] = useState(DEFAULT_H);
  const [fps, setFps] = useState(8);
  const [loop, setLoop] = useState(true);
  const [tags, setTags] = useState(["idle"]);
  const [frames, setFrames] = useState(() => [emptyFrame(DEFAULT_W, DEFAULT_H)]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [tool, setTool] = useState("pencil");
  const [color, setColor] = useState("#FAFAFA");
  const [onionSkin, setOnionSkin] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [loadedId, setLoadedId] = useState(null);

  const canvasRef = useRef(null);
  const drawing = useRef(false);

  // Load a sprite for editing
  const loadSprite = async (sp) => {
    if (!sp) return;
    setName(sp.name);
    setWidth(sp.width);
    setHeight(sp.height);
    setFps(sp.fps);
    setLoop(sp.loop);
    setTags(sp.tags || []);
    setLoadedId(sp.id);
    setCurrentFrame(0);
    try {
      const converted = await Promise.all(
        sp.frames.map((f) => dataURLToFrame(f.data, sp.width, sp.height))
      );
      setFrames(converted.length ? converted : [emptyFrame(sp.width, sp.height)]);
    } catch {
      setFrames([emptyFrame(sp.width, sp.height)]);
      toast.error("Failed to decode sprite frames");
    }
  };

  // Render current frame (with onion skin) to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = Math.min(Math.floor(480 / width), Math.floor(480 / height), 24);
    const s = Math.max(4, scale);
    canvas.width = width * s;
    canvas.height = height * s;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    // checker background
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        ctx.fillStyle = (x+y) % 2 === 0 ? "#141414" : "#1A1A1A";
        ctx.fillRect(x*s, y*s, s, s);
      }
    }
    // onion skin (previous frame)
    if (onionSkin && frames.length > 1 && currentFrame > 0) {
      const prev = frames[currentFrame-1];
      for (let y=0; y<height; y++) for (let x=0; x<width; x++){
        const p = prev[y][x];
        if (p[3] > 0) {
          ctx.fillStyle = `rgba(${p[0]},${p[1]},${p[2]},0.22)`;
          ctx.fillRect(x*s, y*s, s, s);
        }
      }
    }
    const f = frames[currentFrame];
    for (let y=0; y<height; y++) for (let x=0; x<width; x++){
      const p = f[y][x];
      if (p[3] > 0) {
        ctx.fillStyle = `rgba(${p[0]},${p[1]},${p[2]},${p[3]/255})`;
        ctx.fillRect(x*s, y*s, s, s);
      }
    }
    // grid overlay (subtle)
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    for (let i=0; i<=width; i++){ ctx.beginPath(); ctx.moveTo(i*s,0); ctx.lineTo(i*s, height*s); ctx.stroke(); }
    for (let i=0; i<=height; i++){ ctx.beginPath(); ctx.moveTo(0,i*s); ctx.lineTo(width*s, i*s); ctx.stroke(); }
  }, [frames, currentFrame, onionSkin, width, height]);

  // Playback
  useEffect(() => {
    if (!isPlaying) return;
    setPreviewIdx(0);
    const it = setInterval(() => {
      setPreviewIdx((i) => {
        const nx = i + 1;
        if (nx >= frames.length) return loop ? 0 : frames.length - 1;
        return nx;
      });
    }, 1000 / Math.max(1, fps));
    return () => clearInterval(it);
  }, [isPlaying, fps, frames.length, loop]);

  const applyBrush = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    setFrames((fs) => {
      const copy = fs.slice();
      const frame = copy[currentFrame].map((r) => r.slice());
      if (tool === "pencil") frame[y][x] = hexToRgba(color);
      else if (tool === "eraser") frame[y][x] = CLEAR.slice();
      else if (tool === "fill") {
        const target = frame[y][x].slice();
        const replace = hexToRgba(color);
        if (!rgbaEq(target, replace)) {
          const stack = [[x,y]];
          while (stack.length) {
            const [cx, cy] = stack.pop();
            if (cx<0||cy<0||cx>=width||cy>=height) continue;
            if (!rgbaEq(frame[cy][cx], target)) continue;
            frame[cy][cx] = replace.slice();
            stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
          }
        }
      } else if (tool === "picker") {
        const p = frame[y][x];
        if (p[3] > 0) setColor(`#${[p[0],p[1],p[2]].map((n)=>n.toString(16).padStart(2,"0")).join("")}`);
      }
      copy[currentFrame] = frame;
      return copy;
    });
  };

  const pixelFromEvent = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const s = canvas.width / width;
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width / s);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height / s);
    return [x, y];
  };

  const onDown = (e) => {
    drawing.current = true;
    const [x,y] = pixelFromEvent(e);
    applyBrush(x,y);
  };
  const onMove = (e) => {
    if (!drawing.current) return;
    const [x,y] = pixelFromEvent(e);
    applyBrush(x,y);
  };
  const onUp = () => { drawing.current = false; };

  const addFrame = () => {
    setFrames((fs) => [...fs, emptyFrame(width, height)]);
    setCurrentFrame(frames.length);
  };
  const dupFrame = () => {
    setFrames((fs) => {
      const copy = fs.slice();
      copy.splice(currentFrame+1, 0, fs[currentFrame].map((r) => r.slice()));
      return copy;
    });
    setCurrentFrame((i) => i + 1);
  };
  const delFrame = () => {
    if (frames.length === 1) return;
    setFrames((fs) => fs.filter((_, i) => i !== currentFrame));
    setCurrentFrame((i) => Math.max(0, i - 1));
  };

  const saveSprite = async () => {
    const dataFrames = frames.map((f) => ({ data: frameToDataURL(f, width, height, 2) }));
    const payload = { name, width, height, fps, loop, frames: dataFrames, tags };
    try {
      if (loadedId) {
        await updateSprite(loadedId, payload);
        toast.success("Sprite updated");
      } else {
        const created = await createSprite(payload);
        setLoadedId(created.id);
        toast.success("Sprite saved");
      }
      onSpritesRefresh?.();
    } catch (e) {
      toast.error("Save failed");
    }
  };

  // ---- Export / Import / Share ------------------------------------
  const exportCurrent = () => {
    const dataFrames = frames.map((f) => ({ data: frameToDataURL(f, width, height, 2) }));
    const json = exportSprite({ name, width, height, fps, loop, tags, frames: dataFrames });
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(name || "sprite").replace(/\s+/g, "-")}.mfpup.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast.success("Exported");
  };

  const importFromFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const obj = JSON.parse(text);
        const created = await importSpriteFromObject(obj);
        toast.success(`Imported "${created.name}"`);
        onSpritesRefresh?.();
        loadSprite(created);
      } catch (err) {
        toast.error(`Import failed: ${err.message || err}`);
      }
    };
    input.click();
  };

  const [shareLink, setShareLink] = useState(null);
  const sharePup = async () => {
    const dataFrames = frames.map((f) => ({ data: frameToDataURL(f, width, height, 2) }));
    const link = spriteShareLink({ name, width, height, fps, loop, tags, frames: dataFrames });
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Share link copied to clipboard!", {
        description: "Anyone who opens it can import your pup.",
      });
    } catch (e) {
      setShareLink(link);
      toast.info("Clipboard blocked — link below", {
        description: "Select & copy it manually.",
      });
    }
  };

  const newSprite = () => {
    setLoadedId(null);
    setName("Untitled Sprite");
    setFrames([emptyFrame(width, height)]);
    setCurrentFrame(0);
    setTags(["idle"]);
  };

  const assignCursor = async () => {
    // Save first if new, then activate as current follower sprite
    await saveSprite();
    if (loadedId) setActiveSpriteId?.(loadedId);
  };

  const framePreviewURLs = useMemo(
    () => frames.map((f) => frameToDataURL(f, width, height, 4)),
    [frames, width, height]
  );

  const tools = [
    { id: "pencil", icon: Pencil, label: "Pencil" },
    { id: "eraser", icon: Eraser, label: "Eraser" },
    { id: "fill",   icon: PaintBucket, label: "Fill" },
    { id: "picker", icon: Pipette, label: "Picker" },
  ];

  return (
    <div className="h-full w-full flex flex-col bg-[#0A0A0A] text-[#FAFAFA]" data-testid="sprite-editor">
      {shareLink && (
        <div className="border-b border-[#6fa04f] bg-[#0f1a08] px-4 py-3 flex items-center gap-2">
          <Share2 size={14} className="text-[#6fa04f] shrink-0" />
          <Input
            data-testid="share-link-input"
            readOnly
            value={shareLink}
            onFocus={(e) => e.target.select()}
            className="h-8 flex-1 rounded-none bg-[#0A0A0A] border-[#2E2E2E] font-mono text-xs text-[#6fa04f]"
          />
          <Button
            data-testid="share-link-close"
            size="sm"
            variant="outline"
            onClick={() => setShareLink(null)}
            className="h-8 rounded-none border-[#2E2E2E] bg-transparent hover:bg-[#1A1A1A]"
          >Close</Button>
        </div>
      )}
      {/* Header toolbar */}
      <div className="h-12 border-b border-[#2E2E2E] flex items-center px-3 gap-2 bg-[#111111]">
        <Input
          data-testid="sprite-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 w-64 rounded-none bg-[#0A0A0A] border-[#2E2E2E] font-mono text-xs"
        />
        <span className="text-[10px] font-mono uppercase tracking-widest text-[#555]">{width}×{height}</span>
        <div className="flex-1" />
        <Button data-testid="new-sprite-btn" onClick={newSprite} variant="outline" className="h-8 rounded-none border-[#2E2E2E] bg-transparent hover:bg-[#1A1A1A] hover:border-[#FAFAFA]">
          <SquarePlus size={14} className="mr-1" /> New
        </Button>
        <Button data-testid="import-sprite-btn" onClick={importFromFile} variant="outline" className="h-8 rounded-none border-[#2E2E2E] bg-transparent hover:bg-[#1A1A1A] hover:border-[#FAFAFA]" title="Import .mfpup.json file">
          <Upload size={14} className="mr-1" /> Import
        </Button>
        <Button data-testid="export-sprite-btn" onClick={exportCurrent} variant="outline" className="h-8 rounded-none border-[#2E2E2E] bg-transparent hover:bg-[#1A1A1A] hover:border-[#FAFAFA]" title="Download as .mfpup.json">
          <Download size={14} className="mr-1" /> Export
        </Button>
        <Button data-testid="share-sprite-btn" onClick={sharePup} variant="outline" className="h-8 rounded-none border-[#6fa04f] bg-transparent text-[#6fa04f] hover:bg-[#0f1a08] hover:text-[#8fc06a]" title="Copy shareable link">
          <Share2 size={14} className="mr-1" /> Share your pup
        </Button>
        <Button data-testid="save-sprite-btn" onClick={saveSprite} className="h-8 rounded-none bg-[#FAFAFA] text-[#0A0A0A] hover:bg-[#d4d4d8]">
          <Save size={14} className="mr-1" /> Save
        </Button>
        <Button data-testid="assign-cursor-btn" onClick={assignCursor} className="h-8 rounded-none bg-[#DC2626] text-white hover:bg-[#b91c1c]">
          <Download size={14} className="mr-1" /> Use as cursor
        </Button>
      </div>

      <div className="flex-1 grid grid-cols-[56px_1fr_280px] overflow-hidden">
        {/* Tool sidebar */}
        <div className="border-r border-[#2E2E2E] flex flex-col items-center py-3 gap-2 bg-[#111111]">
          {tools.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                data-testid={`tool-${t.id}`}
                onClick={() => setTool(t.id)}
                title={t.label}
                className={`w-10 h-10 flex items-center justify-center border transition-all ${
                  tool === t.id ? "bg-[#FAFAFA] text-[#0A0A0A] border-[#FAFAFA]" : "border-transparent hover:bg-[#1A1A1A] text-[#FAFAFA]"
                }`}
              >
                <Icon size={16} />
              </button>
            );
          })}
          <div className="w-8 border-t border-[#2E2E2E] my-2" />
          <button
            data-testid="tool-clear"
            onClick={() => setFrames((fs) => { const c = fs.slice(); c[currentFrame] = emptyFrame(width, height); return c; })}
            title="Clear frame"
            className="w-10 h-10 flex items-center justify-center hover:bg-[#1A1A1A] text-[#FAFAFA]"
          >
            <Trash2 size={16} />
          </button>
        </div>

        {/* Canvas */}
        <div className="relative bg-[#141414] flex items-center justify-center overflow-auto scroll-mini">
          <canvas
            ref={canvasRef}
            data-testid="sprite-canvas"
            onMouseDown={onDown}
            onMouseMove={onMove}
            onMouseUp={onUp}
            onMouseLeave={onUp}
            className="pixelated border border-[#2E2E2E] shadow-2xl"
            style={{ cursor: tool === "picker" ? "crosshair" : tool === "eraser" ? "cell" : "crosshair", width: 512, height: 512, imageRendering: "pixelated" }}
          />
        </div>

        {/* Properties panel */}
        <div className="border-l border-[#2E2E2E] bg-[#111111] p-4 overflow-y-auto scroll-mini space-y-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#888] mb-2">Palette</div>
            <div className="grid grid-cols-8 gap-1">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  data-testid={`swatch-${c}`}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 border ${color === c ? "border-[#FAFAFA] scale-110" : "border-[#2E2E2E]"} transition-all`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                data-testid="color-picker"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-10 h-8 bg-transparent border border-[#2E2E2E]"
              />
              <span className="text-xs font-mono text-[#888]">{color.toUpperCase()}</span>
            </div>
          </div>

          <div className="border-t border-[#2E2E2E] pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs">FPS</Label>
              <span className="text-xs font-mono text-[#888]">{fps}</span>
            </div>
            <Slider data-testid="fps-slider" value={[fps]} min={1} max={30} step={1} onValueChange={(v) => setFps(v[0])} />
            <div className="flex items-center justify-between">
              <Label className="text-xs">Loop</Label>
              <Switch data-testid="loop-switch" checked={loop} onCheckedChange={setLoop} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-2">{onionSkin ? <Eye size={12}/> : <EyeOff size={12}/>} Onion skin</Label>
              <Switch data-testid="onion-switch" checked={onionSkin} onCheckedChange={setOnionSkin} />
            </div>
          </div>

          <div className="border-t border-[#2E2E2E] pt-4">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#888] mb-2">Cursor state tag</div>
            <Select value={tags[0] || "idle"} onValueChange={(v) => setTags([v])}>
              <SelectTrigger data-testid="tag-select" className="bg-[#0A0A0A] border-[#2E2E2E] rounded-none"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#111111] text-[#FAFAFA]">
                {["idle","move","drag","resize","minimize","close"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="border-t border-[#2E2E2E] pt-4">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#888] mb-2">Live preview</div>
            <div className="flex items-center gap-3">
              <div className="w-24 h-24 bg-[#141414] border border-[#2E2E2E] flex items-center justify-center">
                {framePreviewURLs.length > 0 && (
                  <img
                    key={previewIdx}
                    src={framePreviewURLs[Math.min(previewIdx, framePreviewURLs.length - 1)]}
                    alt="preview"
                    className="pixelated"
                    style={{ width: 96, height: 96 }}
                  />
                )}
              </div>
              <Button
                data-testid="play-btn"
                onClick={() => setIsPlaying((p) => !p)}
                variant="outline"
                className="rounded-none border-[#2E2E2E] bg-transparent hover:bg-[#1A1A1A]"
              >
                {isPlaying ? <Pause size={14}/> : <Play size={14}/>}
              </Button>
            </div>
          </div>

          <div className="border-t border-[#2E2E2E] pt-4">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#888] mb-2">Library</div>
            <div className="space-y-1 max-h-48 overflow-auto scroll-mini">
              {sprites.map((sp) => (
                <div
                  key={sp.id}
                  className={`flex items-center gap-2 p-2 border ${loadedId === sp.id ? "border-[#FAFAFA] bg-[#1A1A1A]" : "border-[#2E2E2E] hover:bg-[#1A1A1A]"} transition-colors`}
                >
                  <img src={sp.frames[0]?.data} width={24} height={24} alt={sp.name} className="pixelated"/>
                  <button
                    data-testid={`load-sprite-${sp.id}`}
                    onClick={() => loadSprite(sp)}
                    className="flex-1 text-left text-xs font-mono truncate"
                  >
                    {sp.name}{sp.built_in ? " ·sys" : ""}
                  </button>
                  {!sp.built_in && (
                    <button
                      data-testid={`delete-sprite-${sp.id}`}
                      onClick={async () => { await deleteSprite(sp.id); onSpritesRefresh?.(); toast.success("Deleted"); }}
                      className="text-[#888] hover:text-[#DC2626]"
                      title="Delete"
                    >
                      <Trash2 size={12}/>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="h-32 border-t border-[#2E2E2E] bg-[#111111] flex">
        <div className="w-56 border-r border-[#2E2E2E] p-3 flex flex-col gap-2">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#888]">Timeline</div>
          <div className="flex gap-1">
            <Button data-testid="add-frame-btn" onClick={addFrame} variant="outline" className="h-8 rounded-none flex-1 border-[#2E2E2E] bg-transparent hover:bg-[#1A1A1A] text-xs">
              <Plus size={12} className="mr-1"/> Frame
            </Button>
            <Button data-testid="dup-frame-btn" onClick={dupFrame} variant="outline" className="h-8 rounded-none border-[#2E2E2E] bg-transparent hover:bg-[#1A1A1A]" title="Duplicate">
              <Copy size={12}/>
            </Button>
            <Button data-testid="del-frame-btn" onClick={delFrame} variant="outline" className="h-8 rounded-none border-[#2E2E2E] bg-transparent hover:bg-[#1A1A1A]" title="Delete">
              <Trash2 size={12}/>
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-x-auto scroll-mini flex items-center gap-2 p-3">
          {framePreviewURLs.map((url, i) => (
            <button
              key={i}
              data-testid={`frame-${i}`}
              onClick={() => setCurrentFrame(i)}
              className={`relative w-16 h-20 flex flex-col items-center justify-center border ${currentFrame === i ? "border-[#FAFAFA]" : "border-[#2E2E2E]"} bg-[#141414] hover:border-[#888] transition-colors`}
            >
              <img src={url} width={48} height={48} alt={`frame ${i+1}`} className="pixelated"/>
              <span className="absolute bottom-0 left-0 right-0 text-[9px] font-mono text-[#888] bg-[#0A0A0A]/80 text-center">#{i+1}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
