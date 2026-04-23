"""Backend tests for Mouseferatu desktop companion API."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://cursor-animator.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


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

    def test_list_seeded_sprites(self, client):
        r = client.get(f"{API}/sprites")
        assert r.status_code == 200
        data = r.json()
        names = [s["name"] for s in data if s.get("built_in")]
        for expected in ["Tabby Cat", "Lil Ghost", "Pulse Star", "Crimson Arrow", "X-Burst", "Minimize Pop"]:
            assert expected in names, f"Missing built-in: {expected}"
        # Must be 6 built-ins
        built_ins = [s for s in data if s.get("built_in")]
        assert len(built_ins) == 6

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
        assert "id" in created and created["id"]
        assert created.get("built_in") is False
        sid = created["id"]

        # GET to confirm persistence
        g = client.get(f"{API}/sprites/{sid}")
        assert g.status_code == 200
        assert g.json()["name"] == "TEST_CustomSprite"

        # PUT update name
        u = client.put(f"{API}/sprites/{sid}", json={"name": "TEST_Renamed"})
        assert u.status_code == 200
        assert u.json()["name"] == "TEST_Renamed"

        # verify persistence
        g2 = client.get(f"{API}/sprites/{sid}")
        assert g2.json()["name"] == "TEST_Renamed"

        # DELETE custom
        d = client.delete(f"{API}/sprites/{sid}")
        assert d.status_code == 200

        # 404 after delete
        assert client.get(f"{API}/sprites/{sid}").status_code == 404

    def test_delete_builtin_rejected(self, client):
        r = client.get(f"{API}/sprites")
        builtin = next(s for s in r.json() if s.get("built_in"))
        d = client.delete(f"{API}/sprites/{builtin['id']}")
        assert d.status_code == 400

    def test_seed_endpoint(self, client):
        r = client.post(f"{API}/sprites/seed")
        assert r.status_code == 200
        assert len(r.json()) == 6
        # Verify all 6 built-ins still present
        lst = client.get(f"{API}/sprites").json()
        assert len([s for s in lst if s.get("built_in")]) == 6


# --- Settings ---
class TestSettings:
    def test_get_default_settings(self, client):
        r = client.get(f"{API}/settings")
        assert r.status_code == 200
        data = r.json()
        assert "state_map" in data
        for k in ["idle", "move", "drag", "resize", "minimize", "close"]:
            assert k in data["state_map"]
        assert data.get("enabled") is True

    def test_update_settings_state_map(self, client):
        # get existing built-in sprite id to assign
        sprites = client.get(f"{API}/sprites").json()
        sid = next(s["id"] for s in sprites if s["name"] == "Tabby Cat")
        new_state_map = {
            "idle": sid, "move": None, "drag": None,
            "resize": None, "minimize": None, "close": None
        }
        u = client.put(f"{API}/settings", json={"state_map": new_state_map, "sprite_size": 72})
        assert u.status_code == 200
        assert u.json()["state_map"]["idle"] == sid
        assert u.json()["sprite_size"] == 72

        # re-fetch
        g = client.get(f"{API}/settings").json()
        assert g["state_map"]["idle"] == sid
        assert g["sprite_size"] == 72
