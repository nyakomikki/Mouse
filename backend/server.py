from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="Mouseferatu - Desktop Companion API")
api_router = APIRouter(prefix="/api")


# ---------- Models ----------

class SpriteFrame(BaseModel):
    model_config = ConfigDict(extra="ignore")
    data: str  # base64 PNG data URL

class Sprite(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    width: int = 32
    height: int = 32
    fps: int = 8
    loop: bool = True
    frames: List[SpriteFrame] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)  # e.g. ["idle","move"]
    built_in: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class SpriteCreate(BaseModel):
    name: str
    width: int = 32
    height: int = 32
    fps: int = 8
    loop: bool = True
    frames: List[SpriteFrame] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)

class SpriteUpdate(BaseModel):
    name: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    fps: Optional[int] = None
    loop: Optional[bool] = None
    frames: Optional[List[SpriteFrame]] = None
    tags: Optional[List[str]] = None


class Settings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "user"
    enabled: bool = True
    sprite_size: int = 56
    follow_speed: float = 0.09  # lower = more chase / lag
    offset_x: int = 30
    offset_y: int = 30
    trail_enabled: bool = False
    # Cursor theming (applies to the native pointer the OS/browser shows)
    cursor_theme: str = "zombie"   # "zombie" | "classic" | "off"
    cursor_size: str = "md"         # "sm" | "md" | "lg"
    # Tray & feedback
    show_in_tray: bool = True
    click_flash: bool = False
    # AFK timing (in seconds). When the user is inactive this long, ambient = afk.
    afk_timeout_sec: int = 30
    # Performance mode — drops frame cycling when tab hidden / reduces motion
    reduce_motion: bool = False
    state_map: Dict[str, Optional[str]] = Field(default_factory=lambda: {
        "idle": "builtin-blob-idle",
        "move": "builtin-blob-move",
        "drag": "builtin-blob-drag",
        "resize": "builtin-blob-resize",
        "minimize": "builtin-blob-minimize",
        "close": "builtin-blob-close",
        "music": "builtin-blob-music",
        "video": "builtin-blob-video",
        "audio": "builtin-blob-audio",
        "afk": "builtin-blob-afk",
    })

class SettingsUpdate(BaseModel):
    enabled: Optional[bool] = None
    sprite_size: Optional[int] = None
    follow_speed: Optional[float] = None
    offset_x: Optional[int] = None
    offset_y: Optional[int] = None
    trail_enabled: Optional[bool] = None
    cursor_theme: Optional[str] = None
    cursor_size: Optional[str] = None
    show_in_tray: Optional[bool] = None
    click_flash: Optional[bool] = None
    afk_timeout_sec: Optional[int] = None
    reduce_motion: Optional[bool] = None
    state_map: Optional[Dict[str, Optional[str]]] = None


# ---------- Built-in sprite factory ----------

def _px(color_idx_grid, palette, w=16, h=16, scale=2):
    """Render a tiny pixel-grid (list of strings) to a base64 PNG data URL."""
    # We'll build a simple PNG without PIL by encoding raw pixels → but PIL not in deps.
    # Use a pure-python PNG builder via zlib + struct.
    import zlib, struct, base64
    out_w = w * scale
    out_h = h * scale
    raw = bytearray()
    # Build row by row with scaling
    for y in range(h):
        row = color_idx_grid[y]
        for _ in range(scale):
            raw.append(0)  # filter type none
            for x in range(w):
                ch = row[x] if x < len(row) else ' '
                rgba = palette.get(ch, (0, 0, 0, 0))
                for _s in range(scale):
                    raw.extend(rgba)

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack(">IIBBBBB", out_w, out_h, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    png = sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')
    return "data:image/png;base64," + base64.b64encode(png).decode('ascii')


def _build_defaults():
    """Create default sprites. The zombie-blob morphs between six per-state forms."""
    sprites = []

    # Shared zombie-blob palette
    pal_b = {
        ' ': (0, 0, 0, 0),
        'K': (16, 36, 10, 255),       # outline near-black green
        'G': (90, 140, 70, 255),      # main green
        'L': (140, 180, 110, 255),    # highlight
        'D': (60, 100, 45, 255),      # shadow
        'W': (245, 245, 245, 255),    # eye white
        'B': (18, 18, 18, 255),       # pupil
        'E': (220, 38, 38, 255),      # red pupil / eye highlight
        'R': (110, 26, 26, 255),      # wound dark
        'S': (239, 68, 68, 255),      # blood bright
    }

    def blob(rows):
        # ensure 16 columns per row via natural padding in _px
        return _px(rows, pal_b, 16, 16, 2)

    # ---------- IDLE: breathing blob with a single watching eye ----------
    idle_a = [
        "                ",
        "                ",
        "     KKKKKK     ",
        "    KLLLLLLK    ",
        "   KLGGGGGGGK   ",
        "   KLGWWGGLGK   ",
        "   KGLWBGGGGK   ",
        "   KGLWGGGGLK   ",
        "   KGGGGGGGGK   ",
        "    KGGGGGGK    ",
        "     KKKKKK     ",
        "      K  K      ",
        "       KK       ",
        "                ",
        "                ",
        "                ",
    ]
    idle_b = [
        "                ",
        "     KKKKKK     ",
        "    KLLLLLLK    ",
        "   KLGGGGGGGK   ",
        "   KLGWWGGLGK   ",
        "   KGLWBGGGGK   ",
        "   KGLWGGGGLK   ",
        "   KGGGGGGGGK   ",
        "   KGGGGGGGGK   ",
        "    KGGGGGGK    ",
        "     KKKKKK     ",
        "       KK       ",
        "                ",
        "                ",
        "                ",
        "                ",
    ]
    idle_c = [
        "                ",
        "                ",
        "                ",
        "    KKKKKKKK    ",
        "   KLLLLLLLGK   ",
        "  KLGGWWGGLGGK  ",
        "  KGGWBGGGGLGK  ",
        "  KGGWGGGGGGGK  ",
        "   KKGGGGGGKK   ",
        "     KKKKKK     ",
        "      K  K      ",
        "      K  K      ",
        "       KK       ",
        "                ",
        "                ",
        "                ",
    ]
    sprites.append(Sprite(
        id="builtin-blob-idle", name="Blob · Idle",
        fps=4, frames=[SpriteFrame(data=blob(f)) for f in [idle_a, idle_b, idle_c, idle_b]],
        tags=["idle"], built_in=True, width=32, height=32,
    ))

    # ---------- MOVE: stretched blob with motion trail streaks ----------
    move_a = [
        "                ",
        "                ",
        "                ",
        "           KKK  ",
        "  K      KKGGGK ",
        "   K    KGLLGGK ",
        " KK  KKKGLWBGGK ",
        "K K KGGGGGWGGGK ",
        "     KGGGGGGGK  ",
        "   KKK KKGGGGK  ",
        "  K  KKK KKKK   ",
        "                ",
        "                ",
        "                ",
        "                ",
        "                ",
    ]
    move_b = [
        "                ",
        "                ",
        "                ",
        "           KKKK ",
        "    K   KKKGLGK ",
        " KK  KKKGLWWGGK ",
        "K K KGGGGWBGGGK ",
        "  KKKGGGGGGGGGK ",
        "   K KKKGGGGGK  ",
        "  KK   KKKKKK   ",
        "                ",
        "                ",
        "                ",
        "                ",
        "                ",
        "                ",
    ]
    sprites.append(Sprite(
        id="builtin-blob-move", name="Blob · Move",
        fps=8, frames=[SpriteFrame(data=blob(f)) for f in [move_a, move_b]],
        tags=["move"], built_in=True, width=32, height=32,
    ))

    # ---------- DRAG: clawed blob with grasping tentacles ----------
    drag_a = [
        "   K        K   ",
        "   KK      KK   ",
        "    KK    KK    ",
        "     KGGGGGK    ",
        "    KGLLLLLGK   ",
        "    KGLWWLGLK   ",
        "   KKGLWBGLGK   ",
        "   KGGGWEGGGK   ",
        "   KGGGGGGGGK   ",
        "    KGGGGGGK    ",
        "   KKKGGGGKKK   ",
        "  KK K KK K KK  ",
        "  K  K  K  K K  ",
        " K   K      K K ",
        "                ",
        "                ",
    ]
    drag_b = [
        "    K      K    ",
        "   KK      KK   ",
        "    KK    KK    ",
        "     KGGGGGK    ",
        "    KGLLLLLGK   ",
        "    KGLWWLGLK   ",
        "   KKGLWBGLGK   ",
        "   KGGGWEGGGK   ",
        "   KGGGGGGGGK   ",
        "   KKKGGGGGKKK  ",
        "  KK KGGGGK KK  ",
        "  K   KKKK   K  ",
        " K  K K  K K  K ",
        " K K   KK   K K ",
        "K                ",
        "                ",
    ]
    sprites.append(Sprite(
        id="builtin-blob-drag", name="Blob · Drag",
        fps=6, frames=[SpriteFrame(data=blob(f)) for f in [drag_a, drag_b]],
        tags=["drag"], built_in=True, width=32, height=32,
    ))

    # ---------- RESIZE: diagonal stretched blob (NW-SE) ----------
    resize_a = [
        "KK              ",
        "KKK             ",
        " KLK            ",
        " KLLK           ",
        "  KGLK          ",
        "   KGLKK        ",
        "    KGGGKK      ",
        "    KGLWBGK     ",
        "     KGWEGGK    ",
        "      KGGGGKK   ",
        "       KGGGLK   ",
        "        KGGLLK  ",
        "         KKGLK  ",
        "           KKK  ",
        "            KKK ",
        "             KK ",
    ]
    resize_b = [
        "K               ",
        "KK              ",
        " KK             ",
        " KLLK           ",
        "  KLLK          ",
        "   KGLLK        ",
        "    KGGLKK      ",
        "    KGLWWGK     ",
        "     KGGBEGK    ",
        "      KKGGGLK   ",
        "        KGGGLK  ",
        "        KKGGLK  ",
        "          KKGLK ",
        "           KKKK ",
        "             KK ",
        "              K ",
    ]
    sprites.append(Sprite(
        id="builtin-blob-resize", name="Blob · Resize",
        fps=5, frames=[SpriteFrame(data=blob(f)) for f in [resize_a, resize_b]],
        tags=["resize"], built_in=True, width=32, height=32,
    ))

    # ---------- MINIMIZE: flattening melting blob ----------
    mini_a = [
        "                ",
        "                ",
        "                ",
        "                ",
        "                ",
        "                ",
        "     KKKKKK     ",
        "    KLLLLLLK    ",
        "   KGLWWWGGGK   ",
        "  KGGWBGWBGGGK  ",
        "  KGGGGGGGGGGK  ",
        "   KKGGGGGGKK   ",
        "     KKKKKK     ",
        "     K    K     ",
        "      K  K      ",
        "       KK       ",
    ]
    mini_b = [
        "                ",
        "                ",
        "                ",
        "                ",
        "                ",
        "                ",
        "                ",
        "    KKKKKKKK    ",
        "   KLLLLLLLGK   ",
        "  KGGWBGGWBGGK  ",
        "  KKGGGGGGGGKK  ",
        "    KKKKKKKK    ",
        "    K  K  K     ",
        "     K K  K     ",
        "      K   K     ",
        "       K  K     ",
    ]
    mini_c = [
        "                ",
        "                ",
        "                ",
        "                ",
        "                ",
        "                ",
        "                ",
        "                ",
        "                ",
        "   KKKKKKKKKK   ",
        "  KGGGWBGWBGGK  ",
        "   KKKKKKKKKK   ",
        "   K K K K KK   ",
        "    K K K  K    ",
        "     K   K  K   ",
        "      K   K     ",
    ]
    sprites.append(Sprite(
        id="builtin-blob-minimize", name="Blob · Minimize",
        fps=8, frames=[SpriteFrame(data=blob(f)) for f in [mini_a, mini_b, mini_c]],
        tags=["minimize"], built_in=True, width=32, height=32,
    ))

    # ---------- CLOSE: explosion splatter (goo bits flying out) ----------
    close_a = [
        "K              K",
        " K    KKKK    K ",
        "     KLLLLK     ",
        "    KLGGGGGK    ",
        "K  KGGSRSGGLGK K",
        "  KGGRSSSRGGGGK ",
        " KGGGSRRSSSGGGK ",
        "KGGSREERESSGGGK ",
        "KGGSRRRRRSSSGGK ",
        " KGGGSSSSRSGGK  ",
        "  KGGGGGGGGGK   ",
        " KKKGGGGGGGKK   ",
        "K  KKKKKKKKK  K ",
        " K  K  K  K  K  ",
        "K K        K  K ",
        "   K          K ",
    ]
    close_b = [
        "K   K      K   K",
        " K K        K K ",
        "K   KKKKKKKK   K",
        "    KLLLLLLK    ",
        "   KGGSSRSSGGK  ",
        "  KGGRREEERRGGK ",
        "  KGGRESSERRGGK ",
        " KGGSSRSSRSSGGK ",
        " KGGGRRSSRRRGGK ",
        "  KGGGSSSSSGGK  ",
        "   KKGGGGGGKK   ",
        " KK KKKKKKKK KK ",
        "K K K K  K K K K",
        "     K    K     ",
        "K  K        K  K",
        " K            K ",
    ]
    sprites.append(Sprite(
        id="builtin-blob-close", name="Blob · Close",
        fps=7, frames=[SpriteFrame(data=blob(f)) for f in [close_a, close_b]],
        tags=["close"], built_in=True, width=32, height=32,
    ))

    # ---------- MUSIC: bouncing blob with a hovering music note ----------
    music_a = [
        "       K        ",
        "      KK        ",
        "     KKK        ",
        "     KK         ",
        "                ",
        "     KKKKKK     ",
        "    KLLLLLLK    ",
        "   KLGGGGGGGK   ",
        "   KLGWWGGLGK   ",
        "   KGLWBGGGGK   ",
        "   KGLWGGGGLK   ",
        "   KGGGGGGGGK   ",
        "    KGGGGGGK    ",
        "     KKKKKK     ",
        "      K  K      ",
        "       KK       ",
    ]
    music_b = [
        "                ",
        "        K       ",
        "       KK       ",
        "      KKK       ",
        "      KK        ",
        "                ",
        "     KKKKKK     ",
        "    KLLLLLLK    ",
        "   KLGGGGGGGK   ",
        "   KLGWWGGLGK   ",
        "   KGLWBGGGGK   ",
        "   KGLWGGGGLK   ",
        "   KGGGGGGGGK   ",
        "    KGGGGGGK    ",
        "     KKKKKK     ",
        "       KK       ",
    ]
    music_c = [
        "     K          ",
        "    KK    K     ",
        "   KKK   KK     ",
        "   KK    KKK    ",
        "          KK    ",
        "                ",
        "     KKKKKK     ",
        "    KLLLLLLK    ",
        "   KLGGGGGGGK   ",
        "   KLGWWGGLGK   ",
        "   KGLWBGGGGK   ",
        "   KGLWGGGGLK   ",
        "   KGGGGGGGGK   ",
        "    KGGGGGGK    ",
        "     KKKKKK     ",
        "      K  K      ",
    ]
    sprites.append(Sprite(
        id="builtin-blob-music", name="Blob · Music",
        fps=6, frames=[SpriteFrame(data=blob(f)) for f in [music_a, music_b, music_c, music_b]],
        tags=["music"], built_in=True, width=32, height=32,
    ))

    # ---------- VIDEO: wide horizontal blob with two darting eyes ----------
    video_a = [
        "                ",
        "                ",
        "                ",
        "    KKKKKKKK    ",
        "   KLLLLLLLLK   ",
        "  KGGWWGGWWGGK  ",
        "  KGGWBGGWBGGK  ",
        "  KGGGGGGGGGGK  ",
        "  KGGRRSRSRGGK  ",
        "   KKGGGGGGKK   ",
        "     KKKKKK     ",
        "      K  K      ",
        "       KK       ",
        "                ",
        "                ",
        "                ",
    ]
    video_b = [
        "                ",
        "                ",
        "                ",
        "    KKKKKKKK    ",
        "   KLLLLLLLLK   ",
        "  KGGWWGGWWGGK  ",
        "  KGGBWGGBWGGK  ",
        "  KGGGGGGGGGGK  ",
        "  KGGSRRSSSRGGK ",
        "   KKGGGGGGKK   ",
        "     KKKKKK     ",
        "      K  K      ",
        "       KK       ",
        "                ",
        "                ",
        "                ",
    ]
    sprites.append(Sprite(
        id="builtin-blob-video", name="Blob · Video",
        fps=4, frames=[SpriteFrame(data=blob(f)) for f in [video_a, video_b]],
        tags=["video"], built_in=True, width=32, height=32,
    ))

    # ---------- AUDIO: idle blob with radiating sound waves ----------
    audio_a = [
        "                ",
        "                ",
        "           K    ",
        "     KKKKKKK    ",
        "    KLLLLLLGK K ",
        "   KLGGGGGGGK   ",
        "   KLGWWGGLGK K ",
        "   KGLWBGGGGK   ",
        "   KGLWGGGGLK K ",
        "   KGGGGGGGGK   ",
        "    KGGGGGGK  K ",
        "     KKKKKK     ",
        "      K  K      ",
        "       KK       ",
        "                ",
        "                ",
    ]
    audio_b = [
        "                ",
        "          K     ",
        "         KK K   ",
        "     KKKKKK  K  ",
        "    KLLLLLLGK K ",
        "   KLGGGGGGGK   ",
        "   KLGWWGGLGKKK ",
        "   KGLWBGGGGK K ",
        "   KGLWGGGGLKKK ",
        "   KGGGGGGGGK   ",
        "    KGGGGGGK K  ",
        "     KKKKKK K   ",
        "      K  K      ",
        "       KK       ",
        "                ",
        "                ",
    ]
    sprites.append(Sprite(
        id="builtin-blob-audio", name="Blob · Audio",
        fps=6, frames=[SpriteFrame(data=blob(f)) for f in [audio_a, audio_b]],
        tags=["audio"], built_in=True, width=32, height=32,
    ))

    # ---------- AFK: sleeping blob with Zzz ----------
    afk_a = [
        "       K        ",
        "      KKK       ",
        "       K  K     ",
        "         KKK    ",
        "           K    ",
        "                ",
        "     KKKKKK     ",
        "    KLLLLLLK    ",
        "   KLGGGGGGGK   ",
        "   KLKKKGGLGK   ",
        "   KGLGGGGGGK   ",
        "   KGGGGGGGGK   ",
        "    KGGGGGGK    ",
        "     KKKKKK     ",
        "      K  K      ",
        "       KK       ",
    ]
    afk_b = [
        "      K         ",
        "     KKK        ",
        "      K   K     ",
        "         KKK    ",
        "          K     ",
        "            K   ",
        "     KKKKKK KK  ",
        "    KLLLLLLK K  ",
        "   KLGGGGGGGK   ",
        "   KLKKKGGLGK   ",
        "   KGLGGGGGGK   ",
        "   KGGGGGGGGK   ",
        "    KGGGGGGK    ",
        "     KKKKKK     ",
        "      K  K      ",
        "       KK       ",
    ]
    sprites.append(Sprite(
        id="builtin-blob-afk", name="Blob · AFK",
        fps=3, frames=[SpriteFrame(data=blob(f)) for f in [afk_a, afk_b]],
        tags=["afk"], built_in=True, width=32, height=32,
    ))

    # --- CAT (orange tabby) 4 idle frames blink+tail sway
    cat_base = [
        "                ",
        "                ",
        "   OO      OO   ",
        "  OBBO    OBBO  ",
        "  OBBBOOOOBBBO  ",
        "  OBBWBBBBWBBO  ",
        "  OBBBBPPBBBBO  ",
        "  OBBBBBBBBBBO  ",
        "   BBBBBBBBBB   ",
        "    BBBBBBBB    ",
        "     PPPPPP     ",
        "                ",
        "                ",
        "                ",
        "                ",
        "                ",
    ]
    cat_tail_a = [list(r) for r in cat_base]
    cat_tail_b = [list(r) for r in cat_base]
    cat_tail_c = [list(r) for r in cat_base]
    # add swaying tail pixels
    cat_tail_a[9][14] = 'B'; cat_tail_a[10][14] = 'B'
    cat_tail_b[8][14] = 'B'; cat_tail_b[9][15] = 'B'
    cat_tail_c[10][14] = 'B'; cat_tail_c[11][13] = 'B'
    # blink frame: close eyes
    cat_blink = [list(r) for r in cat_base]
    cat_blink[3] = list("  O--O    O--O  ")
    cat_blink[2] = list("                ")
    pal_cat = {
        ' ': (0, 0, 0, 0),
        'O': (255, 140, 40, 255),   # outline orange
        'B': (255, 180, 80, 255),   # body lighter
        'W': (255, 255, 255, 255),  # muzzle
        'P': (230, 80, 80, 255),    # nose/mouth
        '-': (30, 30, 30, 255),     # closed eye
    }
    frames_cat = [
        _px(cat_tail_a, pal_cat, 16, 16, 2),
        _px(cat_tail_b, pal_cat, 16, 16, 2),
        _px(cat_tail_c, pal_cat, 16, 16, 2),
        _px(cat_blink, pal_cat, 16, 16, 2),
    ]
    sprites.append(Sprite(name="Tabby Cat", fps=6, frames=[SpriteFrame(data=f) for f in frames_cat],
                          tags=["idle"], built_in=True, width=32, height=32))

    # --- GHOST
    ghost_a = [
        "                ",
        "    WWWWWWWW    ",
        "   WWWWWWWWWW   ",
        "  WWWWWWWWWWWW  ",
        "  WWKWWWWWWKWW  ",
        "  WWKWWWWWWKWW  ",
        "  WWWWWWWWWWWW  ",
        "  WWWWWRRRWWWW  ",
        "  WWWWWWWWWWWW  ",
        "  WWWWWWWWWWWW  ",
        "  WWWWWWWWWWWW  ",
        "  W WW WW WW W  ",
        "                ",
        "                ",
        "                ",
        "                ",
    ]
    ghost_b = [list(r) for r in ghost_a]
    ghost_b[11] = list("   WW WW WW WW  ")
    pal_g = {' ': (0,0,0,0), 'W': (230,230,255,255), 'K': (20,20,30,255), 'R':(230,90,120,255)}
    frames_g = [_px(ghost_a, pal_g, 16, 16, 2), _px(ghost_b, pal_g, 16, 16, 2)]
    sprites.append(Sprite(name="Lil Ghost", fps=4, frames=[SpriteFrame(data=f) for f in frames_g],
                          tags=["idle","move"], built_in=True, width=32, height=32))

    # --- STAR (spinning/pulsing)
    def star_grid(scale_val):
        g = [[' ']*16 for _ in range(16)]
        cx, cy = 8, 8
        for y in range(16):
            for x in range(16):
                d = abs(x-cx) + abs(y-cy)
                if d <= scale_val:
                    g[y][x] = 'Y'
                elif d <= scale_val+1:
                    g[y][x] = 'O'
        return [''.join(r) for r in g]
    pal_s = {' ':(0,0,0,0), 'Y':(250,204,21,255), 'O':(220,38,38,255)}
    frames_s = [_px(star_grid(i), pal_s, 16, 16, 2) for i in [3,4,5,4]]
    sprites.append(Sprite(name="Pulse Star", fps=8, frames=[SpriteFrame(data=f) for f in frames_s],
                          tags=["move","drag"], built_in=True, width=32, height=32))

    # --- ARROW (grab cursor for drag)
    arrow = [
        "H               ",
        "HH              ",
        "HHH             ",
        "HHHH            ",
        "HHHHH           ",
        "HHHHHH          ",
        "HHHHHHH         ",
        "HHHHHHHH        ",
        "HHHHHHHHH       ",
        "HHHHHH          ",
        "HHHHH           ",
        "HHHH            ",
        "HH HH           ",
        "H   HH          ",
        "     HH         ",
        "                ",
    ]
    pal_a = {' ':(0,0,0,0), 'H':(220,38,38,255)}
    sprites.append(Sprite(name="Crimson Arrow", fps=1,
                          frames=[SpriteFrame(data=_px(arrow, pal_a, 16, 16, 2))],
                          tags=["drag","resize"], built_in=True, width=32, height=32))

    # --- X (close)
    xg = [
        "                ",
        "  R          R  ",
        "  RR        RR  ",
        "   RR      RR   ",
        "    RR    RR    ",
        "     RR  RR     ",
        "      RRRR      ",
        "       RR       ",
        "      RRRR      ",
        "     RR  RR     ",
        "    RR    RR    ",
        "   RR      RR   ",
        "  RR        RR  ",
        "  R          R  ",
        "                ",
        "                ",
    ]
    pal_x = {' ':(0,0,0,0), 'R':(239,68,68,255)}
    sprites.append(Sprite(name="X-Burst", fps=1,
                          frames=[SpriteFrame(data=_px(xg, pal_x, 16, 16, 2))],
                          tags=["close"], built_in=True, width=32, height=32))

    # --- DOWN-ARROW (minimize)
    dg = [
        "                ",
        "     YYYYYY     ",
        "     YYYYYY     ",
        "     YYYYYY     ",
        "     YYYYYY     ",
        "     YYYYYY     ",
        "  YYYYYYYYYYYY  ",
        "   YYYYYYYYYY   ",
        "    YYYYYYYY    ",
        "     YYYYYY     ",
        "      YYYY      ",
        "       YY       ",
        "                ",
        "                ",
        "                ",
        "                ",
    ]
    pal_d = {' ':(0,0,0,0), 'Y':(250,204,21,255)}
    sprites.append(Sprite(name="Minimize Pop", fps=1,
                          frames=[SpriteFrame(data=_px(dg, pal_d, 16, 16, 2))],
                          tags=["minimize"], built_in=True, width=32, height=32))

    return sprites


# ---------- Routes ----------

@api_router.get("/")
async def root():
    return {"message": "Mouseferatu API up", "service": "desktop-companion"}


@api_router.get("/sprites", response_model=List[Sprite])
async def list_sprites():
    docs = await db.sprites.find({}, {"_id": 0}).to_list(1000)
    return docs


@api_router.post("/sprites", response_model=Sprite)
async def create_sprite(input: SpriteCreate):
    s = Sprite(**input.model_dump())
    await db.sprites.insert_one(s.model_dump())
    return s


@api_router.get("/sprites/{sprite_id}", response_model=Sprite)
async def get_sprite(sprite_id: str):
    doc = await db.sprites.find_one({"id": sprite_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Sprite not found")
    return doc


@api_router.put("/sprites/{sprite_id}", response_model=Sprite)
async def update_sprite(sprite_id: str, input: SpriteUpdate):
    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    if not update_data:
        doc = await db.sprites.find_one({"id": sprite_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Sprite not found")
        return doc
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.sprites.update_one({"id": sprite_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Sprite not found")
    doc = await db.sprites.find_one({"id": sprite_id}, {"_id": 0})
    return doc


@api_router.delete("/sprites/{sprite_id}")
async def delete_sprite(sprite_id: str):
    doc = await db.sprites.find_one({"id": sprite_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Sprite not found")
    if doc.get("built_in"):
        raise HTTPException(status_code=400, detail="Cannot delete built-in sprites")
    await db.sprites.delete_one({"id": sprite_id})
    return {"ok": True}


@api_router.post("/sprites/seed", response_model=List[Sprite])
async def seed_defaults():
    # Remove existing built-ins and re-seed (idempotent refresh)
    await db.sprites.delete_many({"built_in": True})
    defaults = _build_defaults()
    await db.sprites.insert_many([d.model_dump() for d in defaults])
    return defaults


@api_router.get("/settings", response_model=Settings)
async def get_settings():
    doc = await db.settings.find_one({"id": "user"}, {"_id": 0})
    if not doc:
        s = Settings()
        await db.settings.insert_one(s.model_dump())
        return s
    return doc


@api_router.put("/settings", response_model=Settings)
async def update_settings(input: SettingsUpdate):
    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    doc = await db.settings.find_one({"id": "user"}, {"_id": 0})
    if not doc:
        s = Settings(**update_data) if update_data else Settings()
        await db.settings.insert_one(s.model_dump())
        return s
    if update_data:
        await db.settings.update_one({"id": "user"}, {"$set": update_data})
    doc = await db.settings.find_one({"id": "user"}, {"_id": 0})
    return doc


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup_seed():
    """Auto-seed defaults on first boot, or refresh when new built-ins are introduced."""
    latest = await db.sprites.find_one({"id": "builtin-blob-afk"})
    count = await db.sprites.count_documents({})
    if count == 0 or not latest:
        await db.sprites.delete_many({"built_in": True})
        defaults = _build_defaults()
        await db.sprites.insert_many([d.model_dump() for d in defaults])
        logger.info("Seeded/refreshed %d default sprites", len(defaults))
    current = await db.settings.find_one({"id": "user"})
    if not current:
        await db.settings.insert_one(Settings().model_dump())
        return
    patch = {}
    fresh_defaults = Settings().model_dump()
    sm = current.get("state_map") or {}
    legacy = {v for v in sm.values() if v}
    needs_sm_refresh = (
        not any(sm.values())
        or "builtin-pixel-zombie" in legacy
        or any(k not in sm for k in fresh_defaults["state_map"].keys())
    )
    if needs_sm_refresh:
        merged = dict(fresh_defaults["state_map"])
        for k, v in sm.items():
            if v and v != "builtin-pixel-zombie":
                merged[k] = v
        patch["state_map"] = merged
    for k in ("cursor_theme", "cursor_size", "show_in_tray",
              "click_flash", "afk_timeout_sec", "reduce_motion"):
        if k not in current:
            patch[k] = fresh_defaults[k]
    if patch:
        await db.settings.update_one({"id": "user"}, {"$set": patch})


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
