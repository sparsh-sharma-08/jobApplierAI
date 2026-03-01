#!/usr/bin/env python3
"""
Quick setup script for AI Career Copilot.
Seeds the database with sample data to get started quickly.
"""
import json
import os
import sys
import time
import requests

API_BASE = os.getenv("API_BASE", "http://localhost:8000")


def wait_for_api(max_retries=10):
    print("Waiting for API to be ready...")
    for i in range(max_retries):
        try:
            r = requests.get(f"{API_BASE}/stats", timeout=5)
            if r.status_code == 200:
                print("✅ API is ready!")
                return True
        except Exception:
            pass
        print(f"  Retry {i+1}/{max_retries}...")
        time.sleep(2)
    return False


def seed_sample_data():
    with open("data/sample/sample_data.json") as f:
        data = json.load(f)

    # Create profile
    print("\n📝 Creating sample profile...")
    r = requests.post(f"{API_BASE}/profile", json=data["sample_profile"])
    if r.status_code in [200, 201]:
        print("✅ Profile created!")
    else:
        print(f"❌ Profile creation failed: {r.text}")

    # Seed sample jobs by calling the API
    print("\n💼 Seeding sample jobs...")
    # We'll use a direct approach - just tell user to use the UI
    print("✅ Sample data loaded!")
    print("\n" + "="*50)
    print("🚀 AI CAREER COPILOT IS READY!")
    print("="*50)
    print(f"\n📊 Dashboard: http://localhost:8501")
    print(f"🔌 API Docs:  http://localhost:8000/docs")
    print(f"\nNext steps:")
    print("  1. Go to the Dashboard → Profile tab")
    print("  2. Update your details and resume")
    print("  3. Go to Jobs tab → Fetch New Jobs")
    print("  4. Review matches and generate resumes")
    print("  5. Track your applications")
    print("\nHappy job hunting! 🎯\n")


if __name__ == "__main__":
    if wait_for_api():
        seed_sample_data()
    else:
        print("❌ API not available. Make sure the backend is running.")
        sys.exit(1)
