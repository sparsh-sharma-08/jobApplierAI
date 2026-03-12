import os
import sys

# Add backend to path so we can import modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from scrapers.job_scraper import JobScrapeManager

def test_location_filtering():
    manager = JobScrapeManager()
    
    roles = ["software engineer"]
    locations = ["India"]
    
    print("\n--- Testing Arbeitnow ---")
    jobs = manager.scrapers["arbeitnow"].scrape(roles, locations, max_jobs=5)
    for j in jobs:
        print(f"{j['company']}: {j['role']} | Loc: {j['location']}")

    print("\n--- Testing Remotive ---")
    jobs = manager.scrapers["remotive"].scrape(roles, locations, max_jobs=5)
    for j in jobs:
        print(f"{j['company']}: {j['role']} | Loc: {j['location']}")
        
    print("\n--- Testing Jobicy ---")
    jobs = manager.scrapers["jobicy"].scrape(roles, locations, max_jobs=5)
    for j in jobs:
        print(f"{j['company']}: {j['role']} | Loc: {j['location']}")

if __name__ == "__main__":
    test_location_filtering()
