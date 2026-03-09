import sys
import os

# Add backend to path
sys.path.insert(0, os.path.abspath('.'))

from core.tasks import fetch_and_score_jobs_task

def trigger():
    print("Sending task to Celery...")
    
    # We will use user_id 1 (assume the user has ID 1)
    # The user has some skills in the DB? Let's just provide a valid profile dict
    profile_dict = {
        "skills": ["React", "Python", "FastAPI"],
        "remote_preference": "remote",
        "preferred_locations": ["Remote"],
        "experience_level": "mid",
        "master_resume": {
            "summary": "Full stack developer",
            "experience": [{"title": "Software Engineer", "company": "Tech Corp"}]
        }
    }
    
    # We'll just ask remotive for 1 job to keep it fast
    task = fetch_and_score_jobs_task.delay(
        user_id=1, 
        profile_dict=profile_dict, 
        sources=["remotive"], 
        roles=["Python"], 
        locations=["Remote"]
    )
    
    print(f"Task dispatched with ID: {task.id}")

if __name__ == "__main__":
    trigger()
