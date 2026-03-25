from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    page = context.new_page()
    try:
        print("Visiting LinkedIn...")
        page.goto("https://www.linkedin.com/jobs/search/?keywords=frontend", wait_until="domcontentloaded", timeout=15000)
        print("Page title:", page.title())
    except Exception as e:
        print("Error:", e)
    finally:
        browser.close()
