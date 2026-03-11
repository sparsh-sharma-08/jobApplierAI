import json
import os
import fitz  # PyMuPDF
from services.llm_service import parse_pdf_to_json

def extract_text_from_pdf(file_path):
    doc = fitz.open(file_path)
    text = ""
    for page in doc:
        text += page.get_text()
    return text

def test_parse():
    print("Looking for a PDF in the current directory...")
    pdfs = [f for f in os.listdir(".") if f.lower().endswith(".pdf")]
    
    if not pdfs:
        # If no local PDF is found, create a dummy text object to test the raw LLM capability
        dummy_resume = """
        John Doe
        San Francisco, CA | 555-0100 | john.doe@email.com | github.com/johndoe

        SUMMARY
        Passionate Software Engineer with 5 years of experience building scalable backend microservices.

        SKILLS
        Python, JavaScript, TypeScript, FastAPI, React, Docker, Kubernetes, PostgreSQL

        EXPERIENCE
        Senior Backend Engineer
        TechCorp Inc.
        Jan 2020 - Present
        - Designed and implemented a high-performance REST API using FastAPI.
        - Reduced database latency by 40% through query optimization.
        - Tech used: Python, Postgres, Docker.

        PROJECTS
        AI Resume Builder
        - Built an open-source tool that tailors resumes to job descriptions.
        - Technologies: React, Node.js, OpenAI API.
        - Link: github.com/johndoe/resume-builder

        EDUCATION
        B.S. Computer Science
        University of California, Berkeley
        2015 - 2019
        """
        print("No PDF found! Falling back to raw text testing string...")
        text = dummy_resume
    else:
        pdf_path = pdfs[0]
        print(f"📄 Found PDF: {pdf_path}. Extracting text...")
        text = extract_text_from_pdf(pdf_path)
    
    print("\n\n======== RAW EXTRACTED TEXT ========")
    print(text[:1000] + "...\n(Truncated for view)")
    print("====================================\n")
    
    print("🤖 Sending to Ollama Gemma:2b for JSON Parsing...")
    try:
        parsed_json = parse_pdf_to_json(text)
        print("\n✅ SUCCESS! Parsed JSON:")
        print(json.dumps(parsed_json, indent=2))
        
        # Diagnostics
        print("\n📊 DIAGNOSTICS:")
        print(f"- Skills count: {len(parsed_json.get('skills', []))}")
        print(f"- Experience count: {len(parsed_json.get('experience', []))}")
        print(f"- Projects count: {len(parsed_json.get('projects', []))}")
        
    except Exception as e:
        print(f"\n❌ FAILED TO PARSE!")
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    test_parse()
