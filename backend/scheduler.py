"""
Scheduler for automated daily job fetching and scoring.
Can be run standalone or integrated with Celery.
"""
import time
import logging
import schedule
import os
import requests
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

API_BASE = os.getenv("API_BASE", "http://localhost:8000")


def fetch_and_score_jobs():
    """Daily job: fetch new jobs and score them."""
    logger.info(f"[{datetime.now()}] Starting daily job fetch...")
    try:
        r = requests.post(f"{API_BASE}/jobs/fetch", timeout=60)
        r.raise_for_status()
        logger.info(f"Job fetch result: {r.json()}")
    except Exception as e:
        logger.error(f"Job fetch failed: {e}")


def score_unscored():
    """Score any jobs that haven't been scored yet."""
    try:
        r = requests.post(f"{API_BASE}/jobs/score-all", timeout=30)
        r.raise_for_status()
        logger.info(f"Scoring result: {r.json()}")
    except Exception as e:
        logger.error(f"Score-all failed: {e}")


def print_top_matches():
    """Log top job matches for the day."""
    try:
        r = requests.get(f"{API_BASE}/stats", timeout=10)
        r.raise_for_status()
        stats = r.json()
        top = stats.get("top_matches", [])
        logger.info(f"=== TOP MATCHES TODAY ===")
        for job in top[:5]:
            logger.info(f"  [{job['score']:.0f}] {job['company']} — {job['role']}")
    except Exception as e:
        logger.error(f"Stats fetch failed: {e}")


def run_daily_pipeline():
    fetch_and_score_jobs()
    time.sleep(5)
    score_unscored()
    time.sleep(2)
    print_top_matches()


if __name__ == "__main__":
    logger.info("Starting Career Copilot Scheduler")

    # Schedule daily at 8 AM
    schedule.every().day.at("08:00").do(run_daily_pipeline)
    # Also score on startup
    schedule.every(30).minutes.do(score_unscored)

    # Run immediately on first start
    logger.info("Running initial pipeline...")
    run_daily_pipeline()

    logger.info("Scheduler running. Press Ctrl+C to stop.")
    while True:
        schedule.run_pending()
        time.sleep(60)
