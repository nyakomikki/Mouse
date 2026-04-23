import React, { useEffect, useRef, useState } from "react";
import { Music, Film, Volume2, Square, Play } from "lucide-react";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import { useDesktop } from "../../context/DesktopContext";

/**
 * Media app — toggles Music / Video / Audio playback and the companion blob reacts.
 * Uses the WebAudio API directly so we don't need any external asset files.
 */
export default function MediaApp() {
  const { ambientState, setAmbientState } = useDesktop();
  const [mode, setMode] = useState(null); // 'music' | 'video' | 'audio' | null
  const [volume, setVolume] = useState(30);
  const audioCtxRef = useRef(null);
  const oscListRef = useRef([]);
  const masterGainRef = useRef(null);
  const videoCanvasRef = useRef(null);
  const rafVideoRef = useRef(null);

  const ensureCtx = () => {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new AC();
      const g = audioCtxRef.current.createGain();
      g.gain.value = volume / 100;
      g.connect(audioCtxRef.current.destination);
      masterGainRef.current = g;
    }
    return audioCtxRef.current;
  };

  const stopAllAudio = () => {
    oscListRef.current.forEach((o) => { try { o.stop(); } catch {/*nop*/} });
    oscListRef.current = [];
  };

  const playMusic = () => {
    stopAllAudio();
    const ctx = ensureCtx();
    const now = ctx.currentTime;
    // Simple looping 4-note arpeggio via scheduled oscillators
    const notes = [220, 261.6, 329.6, 392.0, 329.6, 261.6];
    const stepDur = 0.28;
    const loopDur = notes.length * stepDur;
    const loops = 40;  // ~67 seconds then stop unless restarted
    for (let l = 0; l < loops; l++) {
      notes.forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.value = f;
        const g = ctx.createGain();
        const t = now + l * loopDur + i * stepDur;
        g.gain.setValueAtTime(0.0, t);
        g.gain.linearRampToValueAtTime(0.25, t + 0.01);
        g.gain.linearRampToValueAtTime(0.0, t + stepDur * 0.95);
        osc.connect(g).connect(masterGainRef.current);
        osc.start(t);
        osc.stop(t + stepDur);
        oscListRef.current.push(osc);
      });
    }
    setMode("music");
    setAmbientState("music");
  };

  const playAudio = () => {
    stopAllAudio();
    const ctx = ensureCtx();
    const now = ctx.currentTime;
    // Short spoken-like beep pattern (like notification)
    [600, 900].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const g = ctx.createGain();
      const t = now + i * 0.18;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.3, t + 0.02);
      g.gain.linearRampToValueAtTime(0, t + 0.16);
      osc.connect(g).connect(masterGainRef.current);
      osc.start(t);
      osc.stop(t + 0.2);
      oscListRef.current.push(osc);
    });
    setMode("audio");
    setAmbientState("audio");
    // Audio notifications are brief — clear state after ~1.5s
    setTimeout(() => {
      if (mode === "audio" || ambientState === "audio") {
        setMode(null);
        setAmbientState((prev) => (prev === "audio" ? null : prev));
      }
    }, 1500);
  };

  const playVideo = () => {
    stopAllAudio();
    setMode("video");
    setAmbientState("video");
  };

  const stop = () => {
    stopAllAudio();
    setMode(null);
    setAmbientState((s) => (s === "music" || s === "video" || s === "audio" ? null : s));
  };

  // Volume tracking
  useEffect(() => {
    if (masterGainRef.current) masterGainRef.current.gain.value = volume / 100;
  }, [volume]);

  // Video canvas animation (while mode === 'video')
  useEffect(() => {
    const canvas = videoCanvasRef.current;
    if (!canvas || mode !== "video") {
      if (rafVideoRef.current) cancelAnimationFrame(rafVideoRef.current);
      return undefined;
    }
    const ctx = canvas.getContext("2d");
    let t = 0;
    const draw = () => {
      if (document.hidden) {
        rafVideoRef.current = setTimeout(() => { rafVideoRef.current = requestAnimationFrame(draw); }, 500);
        return;
      }
      t += 0.02;
      const w = canvas.width, h = canvas.height;
      // VHS-style scene
      ctx.fillStyle = "#0A0A0A";
      ctx.fillRect(0, 0, w, h);
      // scanning gradient
      for (let y = 0; y < h; y += 3) {
        ctx.fillStyle = `rgba(111,160,79,${0.03 + 0.03 * Math.sin(y * 0.08 + t * 4)})`;
        ctx.fillRect(0, y, w, 1);
      }
      // moving ghost shapes
      for (let i = 0; i < 6; i++) {
        const x = (Math.sin(t + i) * 0.5 + 0.5) * w;
        const y = (Math.cos(t * 0.6 + i * 1.3) * 0.5 + 0.5) * h;
        const r = 14 + 4 * Math.sin(t * 2 + i);
        ctx.fillStyle = i % 2 === 0 ? "#6fa04f" : "#dc2626";
        ctx.globalAlpha = 0.25;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // timecode
      ctx.fillStyle = "#6fa04f";
      ctx.font = "10px monospace";
      ctx.fillText(`REC · ${t.toFixed(2)}`, 8, h - 8);
      rafVideoRef.current = requestAnimationFrame(draw);
    };
    rafVideoRef.current = requestAnimationFrame(draw);
    return () => {
      if (typeof rafVideoRef.current === "number") cancelAnimationFrame(rafVideoRef.current);
      if (rafVideoRef.current && typeof rafVideoRef.current === "object") {/*nop*/}
    };
  }, [mode]);

  // Cleanup on unmount
  useEffect(() => () => {
    stopAllAudio();
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch {/*nop*/} }
  }, []);

  return (
    <div className="h-full flex flex-col bg-[#0A0A0A] text-[#FAFAFA]" data-testid="media-app">
      <div className="h-12 border-b border-[#2E2E2E] flex items-center px-4 gap-2 bg-[#111111]">
        <div className="text-xs font-mono uppercase tracking-[0.25em] text-[#888]">Media Player</div>
        <div className="flex-1" />
        <div className="text-xs font-mono text-[#FACC15]">
          {mode ? `▸ ${mode}` : "— stopped —"}
        </div>
      </div>

      <div className="flex-1 p-6 space-y-5 overflow-auto scroll-mini">
        {/* Video preview */}
        <div className="border border-[#2E2E2E] bg-[#0A0A0A] aspect-video relative">
          <canvas
            ref={videoCanvasRef}
            width={480}
            height={270}
            className="w-full h-full block"
            data-testid="video-canvas"
          />
          {mode !== "video" && (
            <div className="absolute inset-0 flex items-center justify-center text-[#555] text-xs font-mono uppercase tracking-widest">
              video · stopped
            </div>
          )}
        </div>

        {/* Transport */}
        <div className="grid grid-cols-3 gap-2">
          <Button
            data-testid="play-music-btn"
            onClick={playMusic}
            variant="outline"
            className="h-11 rounded-none border-[#2E2E2E] bg-transparent hover:bg-[#1A1A1A] hover:border-[#FAFAFA] text-[#FAFAFA] justify-start px-3"
          >
            <Music size={16} className="mr-2 text-[#FACC15]" /> Play Music
          </Button>
          <Button
            data-testid="play-video-btn"
            onClick={playVideo}
            variant="outline"
            className="h-11 rounded-none border-[#2E2E2E] bg-transparent hover:bg-[#1A1A1A] hover:border-[#FAFAFA] text-[#FAFAFA] justify-start px-3"
          >
            <Film size={16} className="mr-2 text-[#DC2626]" /> Play Video
          </Button>
          <Button
            data-testid="play-audio-btn"
            onClick={playAudio}
            variant="outline"
            className="h-11 rounded-none border-[#2E2E2E] bg-transparent hover:bg-[#1A1A1A] hover:border-[#FAFAFA] text-[#FAFAFA] justify-start px-3"
          >
            <Volume2 size={16} className="mr-2 text-[#6fa04f]" /> Notify
          </Button>
        </div>

        <Button
          data-testid="media-stop-btn"
          onClick={stop}
          className="w-full h-10 rounded-none bg-[#DC2626] hover:bg-[#b91c1c] text-[#FAFAFA]"
        >
          <Square size={14} className="mr-2" /> Stop
        </Button>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#888]">Volume</div>
            <div className="text-xs font-mono text-[#888]">{volume}</div>
          </div>
          <Slider data-testid="volume-slider" value={[volume]} min={0} max={100} step={1}
            onValueChange={(v) => setVolume(v[0])} />
        </div>

        <div className="border-t border-[#2E2E2E] pt-4 text-xs text-[#888] leading-relaxed">
          <div className="font-mono uppercase tracking-widest text-[#555] mb-2">Companion reactions</div>
          <ul className="space-y-1">
            <li>· <span className="text-[#FACC15]">Music</span> → bouncing blob with music notes</li>
            <li>· <span className="text-[#DC2626]">Video</span> → wide staring eyes</li>
            <li>· <span className="text-[#6fa04f]">Notify</span> → radiating sound waves</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
