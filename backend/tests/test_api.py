import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from main import app
from models.database import Base, get_db

# Use in-memory SQLite for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

def test_health():
    # FastAPI doesn't have a /health route natively unless implemented,
    # but let's test a non-authenticated route if it exists.
    pass

def test_user_registration():
    response = client.post(
        "/auth/register",
        json={"email": "testuser@example.com", "password": "testpassword123"}
    )
    assert response.status_code == 200
    assert response.json()["email"] == "testuser@example.com"

def test_user_login():
    response = client.post(
        "/auth/login",
        data={"username": "testuser@example.com", "password": "testpassword123"}
    )
    assert response.status_code == 200
    assert "access_token" in response.json()

def test_create_profile_requires_auth():
    response = client.post(
        "/profile",
        json={"name": "Test User", "email": "test@example.com", "skills": ["Python"]}
    )
    # Since no token is provided, should be 401
    assert response.status_code == 401

def test_create_profile_with_auth():
    # Login first
    login_response = client.post(
        "/auth/login",
        data={"username": "testuser@example.com", "password": "testpassword123"}
    )
    token = login_response.json()["access_token"]
    
    response = client.post(
        "/profile",
        json={
            "name": "Test User", 
            "email": "testuser@example.com", 
            "skills": ["Python", "FastAPI"],
            "experience_level": "mid"
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Test User"
    assert "FastAPI" in response.json()["skills"]

def test_fetch_jobs_with_auth():
    login_response = client.post(
        "/auth/login",
        data={"username": "testuser@example.com", "password": "testpassword123"}
    )
    token = login_response.json()["access_token"]
    
    response = client.post(
        "/jobs/fetch",
        json=["remoteok"],
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    assert "message" in response.json()
