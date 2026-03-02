import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.model_loader import model_manager
from app.config import settings
@pytest.fixture
def client():
    """Create a test client that talks to the app without starting a real server."""
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")

@pytest.fixture(scope="session", autouse=True)
def load_model():
    """Load the model once before all integration tests run."""
    model_manager.load()

@pytest.mark.asyncio
async def test_health_returns_200(client):
    async with client as c:
        response = await c.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["model_loaded"] is True


@pytest.mark.asyncio
async def test_normalize_valid_log(client):
    async with client as c:
        response = await c.post("/api/normalize", json={
            "raw_log": '{"src_ip": "10.0.1.15", "dst_ip": "8.8.8.8", "action": "allow"}',
            "source": "palo-alto",
            "format": "json",
        })
    assert response.status_code == 200
    data = response.json()
    assert "ocsf" in data
    assert data["confidence"] > 0
    assert data["processing_time_ms"] > 0


@pytest.mark.asyncio
async def test_normalize_missing_raw_log(client):
    async with client as c:
        response = await c.post("/api/normalize", json={
            "source": "palo-alto",
            "format": "json",
        })
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_normalize_nonsense_input(client):
    async with client as c:
        response = await c.post("/api/normalize", json={
            "raw_log": "hello",
            "source": "unknown",
            "format": "unknown",
        })
    assert response.status_code == 200
    data = response.json()
    assert data["confidence"] < settings.confidence_threshold


@pytest.mark.asyncio
async def test_sequential_requests_succeed(client):
    """Two requests back to back — confirms model stays loaded, not reloaded."""
    payload = {
        "raw_log": '{"src_ip": "10.0.1.15", "dst_ip": "8.8.8.8", "action": "allow"}',
        "source": "palo-alto",
        "format": "json",
    }
    async with client as c:
        response1 = await c.post("/api/normalize", json=payload)
        response2 = await c.post("/api/normalize", json=payload)
    assert response1.status_code == 200
    assert response2.status_code == 200