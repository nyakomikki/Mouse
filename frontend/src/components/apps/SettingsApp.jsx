import React from "react";
import { Slider } from "../ui/slider";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Button } from "../ui/button";
import { updateSettings, seedSprites } from "../../lib/api";
import { toast } from "sonner";

const STATES = [
  { key: "idle", label: "At rest" },
  { key: "move", label: "Mouse moving" },
  { key: "drag", label: "Moving a window" },
  { key: "resize", label: "Resizing window" },
  { key: "minimize", label: "Minimizing" },
  { key: "close", label: "Closing program" },
  { key: "music", label: "Music playing" },
  { key: "video", label: "Video playing" },
  { key: "audio", label: "Notification audio" },
  { key: "afk", label: "PC idle (AFK)" },
];

export default function SettingsApp({ settings, setSettings, sprites, onSpritesRefresh }) {
  const patch = async (p) => {
    const next = { ...settings, ...p };
    setSettings(next);
    try { await updateSettings(p); } catch { toast.error("Failed to save settings"); }
  };

  const patchMap = (k, v) => {
    const state_map = { ...(settings.state_map || {}), [k]: v === "__none__" ? null : v };
    patch({ state_map });
  };

  return (
    <div className="p-6 space-y-6 text-[#FAFAFA]" data-testid="settings-app">
      <div>
        <div className="text-xs font-mono uppercase tracking-[0.25em] text-[#888]">Mouseferatu</div>
        <h2 className="text-2xl font-semibold tracking-tight mt-1">Companion Settings</h2>
      </div>

      {/* Master enable */}
      <div className="flex items-center justify-between border border-[#2E2E2E] p-4">
        <div>
          <Label className="text-sm">Enable cursor companion</Label>
          <p className="text-xs text-[#888] mt-1">Turn the animated sprite follower on or off.</p>
        </div>
        <Switch
          data-testid="setting-enabled"
          checked={!!settings.enabled}
          onCheckedChange={(v) => patch({ enabled: v })}
        />
      </div>

      {/* Sprite sizing & motion */}
      <div className="grid grid-cols-1 gap-6 border border-[#2E2E2E] p-4">
        <Slide testId="setting-size" label="Sprite size" suffix="px"
          value={settings.sprite_size} min={24} max={160} step={2}
          onChange={(v) => patch({ sprite_size: v })} />
        <Slide testId="setting-speed" label="Follow smoothness" suffix="%"
          value={Math.round((settings.follow_speed || 0.09) * 100)} min={3} max={60} step={1}
          onChange={(v) => patch({ follow_speed: v / 100 })} />
        <div className="grid grid-cols-2 gap-4">
          <Slide testId="setting-offsetx" label="Offset X" suffix="px"
            value={settings.offset_x} min={-60} max={80} step={1}
            onChange={(v) => patch({ offset_x: v })} />
          <Slide testId="setting-offsety" label="Offset Y" suffix="px"
            value={settings.offset_y} min={-60} max={80} step={1}
            onChange={(v) => patch({ offset_y: v })} />
        </div>
      </div>

      {/* Mouse · Tray · Performance */}
      <div className="border border-[#2E2E2E]">
        <div className="px-4 py-3 border-b border-[#2E2E2E]">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#888]">Mouse · Tray · Performance</div>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Cursor theme</Label>
              <Select value={settings.cursor_theme || "zombie"} onValueChange={(v) => patch({ cursor_theme: v })}>
                <SelectTrigger data-testid="cursor-theme-select" className="bg-[#0A0A0A] border-[#2E2E2E] rounded-none mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#111111] text-[#FAFAFA]">
                  <SelectItem value="zombie">Puppy Bone (themed)</SelectItem>
                  <SelectItem value="classic">Classic arrow</SelectItem>
                  <SelectItem value="off">Hidden</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Cursor size</Label>
              <Select value={settings.cursor_size || "md"} onValueChange={(v) => patch({ cursor_size: v })}>
                <SelectTrigger data-testid="cursor-size-select" className="bg-[#0A0A0A] border-[#2E2E2E] rounded-none mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#111111] text-[#FAFAFA]">
                  <SelectItem value="sm">Small</SelectItem>
                  <SelectItem value="md">Medium</SelectItem>
                  <SelectItem value="lg">Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Slide testId="setting-afk" label="Idle (AFK) timeout" suffix="s"
            value={settings.afk_timeout_sec ?? 30} min={5} max={300} step={5}
            onChange={(v) => patch({ afk_timeout_sec: v })} />

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Show in system tray</Label>
              <p className="text-[11px] text-[#666] mt-0.5">Small companion chip in the status bar (click to open Settings).</p>
            </div>
            <Switch data-testid="setting-tray"
              checked={!!settings.show_in_tray}
              onCheckedChange={(v) => patch({ show_in_tray: v })} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Click flash</Label>
              <p className="text-[11px] text-[#666] mt-0.5">Radial pulse at every click.</p>
            </div>
            <Switch data-testid="setting-click-flash"
              checked={!!settings.click_flash}
              onCheckedChange={(v) => patch({ click_flash: v })} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Reduce motion (low-battery mode)</Label>
              <p className="text-[11px] text-[#666] mt-0.5">Pauses idle animation frames when the tab is hidden.</p>
            </div>
            <Switch data-testid="setting-reduce-motion"
              checked={!!settings.reduce_motion}
              onCheckedChange={(v) => patch({ reduce_motion: v })} />
          </div>
        </div>
      </div>

      {/* State → sprite mapping */}
      <div className="border border-[#2E2E2E]">
        <div className="px-4 py-3 border-b border-[#2E2E2E]">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#888]">Animation for each cursor state</div>
        </div>
        <div className="divide-y divide-[#2E2E2E]">
          {STATES.map((s) => (
            <div key={s.key} className="flex items-center justify-between px-4 py-3 gap-4">
              <div>
                <div className="text-sm">{s.label}</div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-[#555]">state: {s.key}</div>
              </div>
              <div className="w-60">
                <Select
                  value={settings.state_map?.[s.key] || "__none__"}
                  onValueChange={(v) => patchMap(s.key, v)}
                >
                  <SelectTrigger data-testid={`state-select-${s.key}`} className="bg-[#0A0A0A] border-[#2E2E2E] rounded-none">
                    <SelectValue placeholder="Auto" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111111] border-[#2E2E2E] text-[#FAFAFA]">
                    <SelectItem value="__none__">Auto (by tag)</SelectItem>
                    {sprites.map((sp) => (
                      <SelectItem key={sp.id} value={sp.id}>{sp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          data-testid="reseed-btn"
          variant="outline"
          className="rounded-none border-[#2E2E2E] hover:border-[#FAFAFA] bg-transparent text-[#FAFAFA]"
          onClick={async () => {
            try { await seedSprites(); toast.success("Re-seeded built-in sprites"); onSpritesRefresh?.(); }
            catch { toast.error("Seed failed"); }
          }}
        >Re-seed built-in sprites</Button>
      </div>
    </div>
  );
}

function Slide({ label, value, min, max, step, onChange, suffix, testId }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Label className="text-sm">{label}</Label>
        <span className="text-xs font-mono text-[#888]">{value}{suffix}</span>
      </div>
      <Slider
        data-testid={testId}
        value={[value ?? min]}
        min={min} max={max} step={step}
        onValueChange={(v) => onChange(v[0])}
        className="mt-2"
      />
    </div>
  );
}
