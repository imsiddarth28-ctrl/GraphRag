from fastapi.testclient import TestClient
from app.main import app
from app.config.settings import settings

client = TestClient(app)

def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {
        "status": "running",
        "service": "GraphRAG Backend"
    }

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "healthy"
    }

def test_version_endpoint():
    response = client.get("/version")
    assert response.status_code == 200
    assert response.json() == {
        "version": settings.VERSION
    }
