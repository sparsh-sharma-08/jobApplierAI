import sys
import os
import json

# Add backend to path
sys.path.insert(0, os.path.abspath('.'))

from services.scorer import score_job

def test_semantic_match():
    print("Testing Semantic Scoring Engine...")
    
    # Dummy Job profile
    job = {
        "role": "Frontend Developer",
        "description": "We are looking for an experienced UI creator who loves building fast web interfaces. Need strong component architecture knowledge and ability to hook into REST endpoints. State management understanding is a huge plus.",
        "location": "remote",
        "salary": "120k",
        "posted_date": "2026-03-08T10:00:00"
    }
    
    # Candidate profile (Uses totally different words but SAME semantic meaning!)
    profile = {
        "skills": ["ReactJS", "Redux", "Typescript", "TailwindCSS"],
        "master_resume": {
            "summary": "I build beautiful scalable frontends. Obsessed with responsive layouts and atomic components. I've designed systems consuming JSON from backend APIs.",
            "experience": [
                {
                    "title": "React Engineer",
                    "company": "Startup Inc",
                    "description": "Led the web platform. Built components in React."
                }
            ]
        },
        "experience_level": "mid",
        "remote_preference": "remote",
        "preferred_locations": ["Remote"]
    }

    try:
        result = score_job(job, profile)
        print("\n\n=== VERDICT ===")
        print(f"Final Score: {result['score']}")
        print(json.dumps(result['explanation']['breakdown'], indent=2))
        print(f"Reasoning: {result['explanation']['reasoning']}")
    except Exception as e:
        print(f"FAILED: {e}")

if __name__ == "__main__":
    test_semantic_match()
