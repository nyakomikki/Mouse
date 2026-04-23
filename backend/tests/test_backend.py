"""Backend tests for Mouseferatu desktop companion API (iteration 2: 10 blobs + new settings)."""
import os
import pytest
import requests

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
API = f"{BASE_URL}/api"

BLOB_STATES = ["idle", "move", "drag", "resize", "minimize", "close",
               "music", "video", "audio", "afk"]
BUILTIN_BLOB_IDS = [f"builtin-blob-{s}" for s in BLOB_STATES]


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- Sprites ---
class TestSprites:
    def test_root(self, client):
        r = client.get(f"{API}/")
        assert r.status_code == 200
        assert "Mouseferatu" in r.json().get("message", "")

    def test_list_has_10_blob_variants(self, client):
        r = client.get(f"{API}/sprites")
        assert r.status_code == 200
        data = r.json()
        ids = {s["id"] for s in data}
        for bid in BUILTIN_BLOB_IDS:
            assert bid in ids, f"Missing built-in blob: {bid}"
        # Total built-ins: 10 blob variants + 6 extras (Tabby Cat, Ghost, Star, Arrow, X, Minimize Pop) = 16
        builtins = [s for s in data if s.get("built_in")]
        assert len(builtins) == 16, f"Expected 16 built-ins, got {len(builtins)}"

    def test_blob_sprites_have_frames(self, client):
        r = client.get(f"{API}/sprites")
        data = r.json()
        by_id = {s["id"]: s for s in data}
        for bid in BUILTIN_BLOB_IDS:
            sp = by_id[bid]
            assert len(sp["frames"]) >= 1
            assert sp["frames"][0]["data"].startswith("data:image/png;base64,")
            assert sp["width"] == 32 and sp["height"] == 32

    def test_create_update_delete_sprite(self, client):
        payload = {
            "name": "TEST_CustomSprite",
            "width": 32, "height": 32, "fps": 10, "loop": True,
            "frames": [{"data": "data:image/png;base64,AAA"}],
            "tags": ["idle"]
        }
        cr = client.post(f"{API}/sprites", json=payload)
        assert cr.status_code == 200
        created = cr.json()
        assert created["name"] == "TEST_CustomSprite"
        assert created.get("built_in") is False
        sid = created["id"]

        g = client.get(f"{API}/sprites/{sid}")
        assert g.status_code == 200
        assert g.json()["name"] == "TEST_CustomSprite"

        u = client.put(f"{API}/sprites/{sid}", json={"name": "TEST_Renamed"})
        assert u.status_code == 200
        assert u.json()["name"] == "TEST_Renamed"

        g2 = client.get(f"{API}/sprites/{sid}")
        assert g2.json()["name"] == "TEST_Renamed"

        d = client.delete(f"{API}/sprites/{sid}")
        assert d.status_code == 200
        assert client.get(f"{API}/sprites/{sid}").status_code == 404

    def test_delete_builtin_rejected(self, client):
        d = client.delete(f"{API}/sprites/builtin-blob-idle")
        assert d.status_code == 400

    def test_seed_endpoint(self, client):
        r = client.post(f"{API}/sprites/seed")
        assert r.status_code == 200
        seeded = r.json()
        # seed returns all default built-ins (10 blob forms + 6 extras)
        assert len(seeded) == 16
        ids = {s["id"] for s in seeded}
        for bid in BUILTIN_BLOB_IDS:
            assert bid in ids


# --- Settings ---
class TestSettings:
    def test_get_default_settings_new_fields(self, client):
        r = client.get(f"{API}/settings")
        assert r.status_code == 200
        data = r.json()
        # new fields present with expected defaults
        assert data.get("cursor_theme") == "zombie"
        assert data.get("cursor_size") == "md"
        assert data.get("show_in_tray") is True
        assert data.get("click_flash") is False
        assert data.get("afk_timeout_sec") == 30
        assert data.get("reduce_motion") is False
        # state_map has all 10 keys mapped to builtin-blob-*
        sm = data["state_map"]
        for k in BLOB_STATES:
            assert k in sm, f"state_map missing '{k}'"
            assert sm[k] == f"builtin-blob-{k}", f"{k} -> {sm[k]} (expected builtin-blob-{k})"

    def test_partial_update_new_fields(self, client):
        payload = {
            "cursor_theme": "classic",
            "cursor_size": "lg",
            "show_in_tray": False,
            "click_flash": True,
            "afk_timeout_sec": 90,
            "reduce_motion": True,
        }
        u = client.put(f"{API}/settings", json=payload)
        assert u.status_code == 200
        body = u.json()
        for k, v in payload.items():
            assert body[k] == v, f"{k} did not persist: {body[k]} != {v}"

        g = client.get(f"{API}/settings").json()
        for k, v in payload.items():
            assert g[k] == v, f"{k} not persisted after re-fetch"

        # Revert to defaults so other tests aren't affected
        revert = {
            "cursor_theme": "zombie", "cursor_size": "md",
            "show_in_tray": True, "click_flash": False,
            "afk_timeout_sec": 30, "reduce_motion": False,
        }
        client.put(f"{API}/settings", json=revert)

    def test_update_state_map_preserves_10(self, client):
        # Set idle to a custom sprite, confirm other 9 keys preserved
        sprites = client.get(f"{API}/sprites").json()
        sid = next(s["id"] for s in sprites if s["name"] == "Tabby Cat")
        current_sm = client.get(f"{API}/settings").json()["state_map"]
        new_sm = dict(current_sm)
        new_sm["idle"] = sid
        u = client.put(f"{API}/settings", json={"state_map": new_sm})
        assert u.status_code == 200
        body = u.json()
        assert body["state_map"]["idle"] == sid
        # make sure other 9 keys still present
        for k in BLOB_STATES:
            assert k in body["state_map"]
        # revert
        client.put(f"{API}/settings", json={"state_map": current_sm})
