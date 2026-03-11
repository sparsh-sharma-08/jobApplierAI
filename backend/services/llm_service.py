"""
Resume & Cover Letter Generation.

Key design:
  - Resume generation uses the master_resume JSON DIRECTLY (no hallucination risk).
  - LLM is only used for: (1) tailored summary, (2) cover letter, (3) initial PDF parsing.
  - ATS keyword injection is done programmatically by extracting keywords from job descriptions.
"""
import json
import os
import re
import logging
from typing import Dict, Any, List, Optional, Set
from datetime import datetime
from tenacity import retry, wait_exponential, stop_after_attempt
from collections import Counter

logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "ollama-dummy-key")
LLM_MODEL = os.getenv("LLM_MODEL", "gemma:2b")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:11434/v1")


def get_openai_client():
    try:
        from openai import OpenAI
        return OpenAI(api_key=OPENAI_API_KEY, base_url=LLM_BASE_URL)
    except ImportError:
        raise RuntimeError("openai package not installed. Run: pip install openai")


@retry(wait=wait_exponential(multiplier=1, min=2, max=10), stop=stop_after_attempt(3))
def _call_llm_with_retry(client, messages, temperature, max_tokens):
    return client.chat.completions.create(
        model=LLM_MODEL,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens
    )


# ─────────────────────────────────────────────────────
# ATS Keyword Extraction (no LLM needed)
# ─────────────────────────────────────────────────────

# Common tech keywords / skills that ATS systems look for
TECH_KEYWORDS = {
    'python', 'java', 'javascript', 'typescript', 'react', 'node', 'nodejs', 'angular', 'vue',
    'sql', 'nosql', 'mongodb', 'postgresql', 'mysql', 'redis', 'elasticsearch',
    'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'ci/cd', 'jenkins', 'terraform',
    'git', 'linux', 'rest', 'api', 'graphql', 'microservices', 'agile', 'scrum',
    'machine learning', 'deep learning', 'ai', 'nlp', 'pytorch', 'tensorflow',
    'data science', 'data engineering', 'etl', 'spark', 'hadoop', 'kafka',
    'html', 'css', 'sass', 'tailwind', 'figma', 'ux', 'ui',
    'go', 'rust', 'c++', 'c#', '.net', 'swift', 'kotlin', 'flutter', 'react native',
    'pandas', 'numpy', 'scikit-learn', 'hugging face', 'langchain', 'rag',
    'fastapi', 'flask', 'django', 'express', 'spring', 'nextjs', 'next.js',
    'firebase', 'supabase', 'oauth', 'jwt', 'websocket', 'grpc',
    'selenium', 'playwright', 'cypress', 'jest', 'pytest',
    'system design', 'distributed systems', 'scalability', 'performance',
}

# Words to skip when extracting keywords
STOP_WORDS = {
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
    'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'must',
    'not', 'no', 'as', 'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before',
    'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once',
    'here', 'there', 'when', 'where', 'why', 'how', 'all', 'both', 'each', 'few', 'more',
    'most', 'other', 'some', 'such', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'just', 'also', 'that', 'this', 'these', 'those', 'it', 'its', 'we', 'our', 'you',
    'your', 'they', 'their', 'what', 'which', 'who', 'whom', 'work', 'working', 'experience',
    'ability', 'able', 'team', 'strong', 'including', 'well', 'role', 'looking', 'join',
    'company', 'opportunity', 'plus', 'years', 'year', 'new', 'help', 'great', 'good',
}


def extract_job_keywords(job_description: str, job_title: str) -> List[str]:
    """Extract ATS-relevant keywords from a job description."""
    text = f"{job_title} {job_description}".lower()

    # Find tech keywords present in job description
    found_tech = set()
    for kw in TECH_KEYWORDS:
        if kw in text:
            found_tech.add(kw)

    # Extract additional important words (2+ occurrences, capitalized in original, etc.)
    words = re.findall(r'\b[a-zA-Z][a-zA-Z+#./-]{1,30}\b', f"{job_title} {job_description}")
    word_counts = Counter(w.lower() for w in words if w.lower() not in STOP_WORDS and len(w) > 2)

    # Get words that appear 2+ times (important to the JD)
    frequent = {w for w, c in word_counts.items() if c >= 2}

    # Merge
    all_keywords = found_tech | frequent
    return sorted(all_keywords)[:30]  # Cap at 30 keywords


# ─────────────────────────────────────────────────────
# Resume Generation (master_resume-based, no hallucination)
# ─────────────────────────────────────────────────────

def generate_resume(
    job_description: str,
    job_title: str,
    company: str,
    master_resume: Dict[str, Any],
    profile: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Generate an ATS-optimized resume by using the master_resume DIRECTLY
    and adding a tailored summary + injecting relevant ATS keywords.

    NO fabrication — only the user's real data is used.
    """

    if not master_resume or not master_resume.get("name"):
        # No master resume available — build from profile
        logger.warning("No master resume found. Building from profile data.")
        master_resume = _build_from_profile(profile)

    # Deep copy to avoid mutating the original
    import copy
    resume = copy.deepcopy(master_resume)

    # Extract ATS keywords from the job description
    job_keywords = extract_job_keywords(job_description, job_title)

    # Ensure contact info is populated from profile if missing
    contact = resume.get("contact", {})
    if not contact.get("email"):
        contact["email"] = profile.get("email", "")
    if not contact.get("phone"):
        contact["phone"] = profile.get("phone", "")
    if not contact.get("location"):
        contact["location"] = profile.get("location", "")
    if not contact.get("linkedin"):
        contact["linkedin"] = profile.get("linkedin", "")
    if not contact.get("github"):
        contact["github"] = profile.get("github", "")
    resume["contact"] = contact

    if not resume.get("name"):
        resume["name"] = profile.get("name", "")

    # Normalize skills to strings
    raw_skills = resume.get("skills", [])
    clean_skills = []
    for s in raw_skills:
        if isinstance(s, str):
            clean_skills.append(s)
        elif isinstance(s, dict):
            clean_skills.append(s.get("title", s.get("name", str(s))))
        else:
            clean_skills.append(str(s))
    resume["skills"] = clean_skills

    # Inject relevant ATS keywords into skills (if not already present)
    existing_skills_lower = {s.lower() for s in clean_skills}
    keywords_to_add = [kw for kw in job_keywords if kw not in existing_skills_lower and kw in TECH_KEYWORDS]
    # Only add keywords that are actually relevant tech skills, not generic words
    if keywords_to_add:
        resume["skills"] = clean_skills + [kw.title() if len(kw) > 3 else kw.upper() for kw in keywords_to_add[:8]]

    # Generate a tailored summary using LLM (or fallback)
    resume["summary"] = _generate_tailored_summary(
        job_title=job_title,
        company=company,
        job_keywords=job_keywords,
        profile=profile,
        master_resume=master_resume
    )

    return resume


def _build_from_profile(profile: Dict) -> Dict:
    """Fallback: build a basic resume from profile data."""
    return {
        "name": profile.get("name", ""),
        "contact": {
            "email": profile.get("email", ""),
            "phone": profile.get("phone", ""),
            "location": profile.get("location", ""),
            "linkedin": profile.get("linkedin", ""),
            "github": profile.get("github", ""),
        },
        "summary": "",
        "skills": profile.get("skills", []),
        "experience": [],
        "projects": [],
        "education": [],
        "certifications": [],
    }


def _generate_tailored_summary(
    job_title: str,
    company: str,
    job_keywords: List[str],
    profile: Dict,
    master_resume: Dict
) -> str:
    """Generate a tailored career objective/summary using LLM, or fallback."""
    # Collect the user's real data points
    skills = profile.get("skills", [])[:10]
    exp_level = profile.get("experience_level", "fresher")
    projects = [p.get("name", "") for p in master_resume.get("projects", [])[:3]]
    existing_summary = master_resume.get("summary", "")

    # Fallback summary (no LLM needed)
    fallback_skills = ", ".join(skills[:6])
    level_map = {"fresher": "aspiring", "junior": "junior", "mid": "experienced", "senior": "senior"}
    level_word = level_map.get(exp_level, "motivated")
    fallback = (
        f"{level_word.capitalize()} {job_title} candidate experienced in {fallback_skills}. "
        f"Skilled in building production-quality software with modern engineering practices "
        f"including REST APIs, automated testing, and CI/CD. "
        f"Seeking a {job_title} role to design reliable systems and ship impactful features."
    )

    try:
        client = get_openai_client()
        prompt = f"""Write a 2-3 sentence career objective for a resume targeting this role:

Role: {job_title} at {company}
Candidate Skills: {', '.join(skills[:10])}
Experience Level: {exp_level}
Key Projects: {', '.join(projects)}
Important Job Keywords: {', '.join(job_keywords[:15])}
Existing Summary: {existing_summary}

RULES:
- Be concise (2-3 sentences max)
- Mention the candidate's REAL skills only
- Include 3-5 relevant keywords from the job naturally
- Do NOT fabricate experience
- Professional tone, no fluff
- Return ONLY the summary text, no quotes or labels"""

        response = _call_llm_with_retry(
            client=client,
            messages=[
                {"role": "system", "content": "You write concise, professional resume summaries. Return only the summary text."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=200
        )
        summary = response.choices[0].message.content.strip()
        # Clean up: remove quotes, labels, extra whitespace
        summary = summary.strip('"\'')
        if summary.lower().startswith("career objective"):
            summary = summary.split(":", 1)[-1].strip()
        if summary.lower().startswith("summary"):
            summary = summary.split(":", 1)[-1].strip()
        return summary if len(summary) > 20 else fallback

    except Exception as e:
        logger.error(f"LLM summary generation failed: {e}")
        return fallback


# ─────────────────────────────────────────────────────
# Cover Letter
# ─────────────────────────────────────────────────────

COVER_LETTER_SYSTEM_PROMPT = """You are an expert cover letter writer.
Write a compelling, personalized cover letter for the given job posting using only true information from the candidate profile.

CRITICAL RULES:
- NEVER use placeholder text like [Your Name], [Your Address], [City], [Date], [Company Address] etc.
- Use the candidate's REAL name, email, phone, and location provided in the prompt
- Use today's date provided in the prompt
- Start the letter directly with the candidate's real contact info
- Do NOT fabricate or exaggerate anything
- Be specific, reference the company and role by name
- Highlight the most relevant skills and experience
- Keep it to 3-4 paragraphs
- Professional but personable tone
- End with "Sincerely," followed by the candidate's real name"""


def generate_cover_letter(
    job_description: str,
    job_title: str,
    company: str,
    resume_data: Dict[str, Any],
    profile: Dict[str, Any]
) -> str:
    """Generate cover letter for a job."""

    # Build context from the REAL resume data
    skills = resume_data.get("skills", [])[:15]
    projects = resume_data.get("projects", [])[:3]
    experience = resume_data.get("experience", [])[:2]
    name = resume_data.get("name", profile.get("name", ""))
    contact = resume_data.get("contact", {})
    email = contact.get("email", profile.get("email", ""))
    phone = contact.get("phone", profile.get("phone", ""))
    location = contact.get("location", profile.get("location", ""))

    project_summaries = []
    for p in projects:
        if isinstance(p, dict):
            desc = p.get('description') or ''
            project_summaries.append(f"{p.get('name') or ''}: {desc[:100]}")

    exp_summaries = []
    for e in experience:
        if isinstance(e, dict):
            exp_summaries.append(f"{e.get('title') or ''} at {e.get('company') or ''}")

    skills_str = ', '.join(skills) if skills and isinstance(skills[0], str) else ', '.join(str(s) for s in skills)
    today = datetime.now().strftime("%B %d, %Y")

    user_prompt = f"""Job Title: {job_title}
Company: {company}

JOB DESCRIPTION:
{job_description[:2000]}

CANDIDATE DETAILS (use these EXACT details, never use placeholders):
Full Name: {name}
Email: {email}
Phone: {phone}
Location: {location}
Today's Date: {today}
Skills: {skills_str}
Experience Level: {profile.get('experience_level', 'fresher')}
Projects: {'; '.join(project_summaries)}
Work Experience: {'; '.join(exp_summaries) if exp_summaries else 'Fresher / Student'}

Write a professional cover letter. Start with:
{name}
{location}
{email} | {phone}

{today}

Dear Hiring Manager at {company},

Then write 3-4 paragraphs. End with:
Sincerely,
{name}"""

    try:
        client = get_openai_client()
        response = _call_llm_with_retry(
            client=client,
            messages=[
                {"role": "system", "content": COVER_LETTER_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.5,
            max_tokens=800
        )
        cover_letter = response.choices[0].message.content.strip()
        
        # Post-process: replace any remaining placeholders the LLM might have snuck in
        replacements = {
            "[Your Name]": name,
            "[Your Address]": location,
            "[City, Postal Code]": location,
            "[City, State ZIP]": location,
            "[City, State, Zip]": location,
            "[Your Email]": email,
            "[Your Phone]": phone,
            "[Your Phone Number]": phone,
            "[Date]": today,
            "[Today's Date]": today,
            "[Company Address]": company,
            "[Company Name]": company,
            "[Hiring Manager's Name]": "Hiring Manager",
        }
        for placeholder, value in replacements.items():
            cover_letter = cover_letter.replace(placeholder, value or "")
        
        return cover_letter
    except Exception as e:
        logger.error(f"LLM cover letter generation failed: {e}")
        return _template_cover_letter(job_title, company, name, email, phone, location)


def _template_cover_letter(job_title: str, company: str, name: str, email: str, phone: str, location: str) -> str:
    today = datetime.now().strftime("%B %d, %Y")
    return f"""{name}
{location}
{email} | {phone}

{today}

Dear Hiring Manager at {company},

I am excited to apply for the {job_title} position at {company}. With my technical background and passion for the field, I believe I would be a strong addition to your team.

I am particularly drawn to {company} because of the opportunity to work on challenging problems and grow professionally. My background aligns well with the requirements of this role, and I am eager to contribute my skills to your team's success.

I would welcome the opportunity to discuss how my experience and enthusiasm can benefit {company}. Thank you for considering my application.

Sincerely,
{name}"""


# ─────────────────────────────────────────────────────
# PDF Text → JSON Parsing (for initial resume upload)
# ─────────────────────────────────────────────────────

PARSE_RESUME_SYSTEM_PROMPT = """You are an expert Data Extraction AI. 
Extract resume data from the provided unstructured text into a STRICT JSON format. 
DO NOT output any conversational text, introductions, or explanations. ONLY output valid JSON.

CRITICAL ANTI-HALLUCINATION RULES:
1. ONLY extract skills that are EXPLICITLY written in the text. NEVER guess or assume skills based on job titles.
2. If a section is missing from the text (e.g. no projects), return an empty array [] or empty string "". Do NOT invent fallback data.
3. NEVER wrap the response in markdown blocks like ```json. Return ONLY the raw JSON object starting with { and ending with }.

Use this EXACT JSON schema (replace empty strings and empty arrays with extracted data):
{
  "name": "",
  "contact": {
    "email": "",
    "phone": "",
    "location": "",
    "linkedin": "",
    "github": ""
  },
  "summary": "",
  "skills": [],
  "experience": [
    {
      "title": "",
      "company": "",
      "start_date": "",
      "end_date": "",
      "description": "",
      "technologies": []
    }
  ],
  "projects": [
    {
      "name": "",
      "description": "",
      "technologies": [],
      "link": ""
    }
  ],
  "education": [
    {
      "degree": "",
      "institution": "",
      "year": "",
      "gpa": ""
    }
  ],
  "certifications": [],
  "languages": []
}

CRITICAL GUIDELINES:
1. DO NOT HALLUCINATE: Only extract data explicitly present in the text.
2. TEMPLATE VALUES: Never return words like "Cert 1", "Lang 1", "YYYY", or "MM/YYYY". If a field is missing in the text, leave it as an empty string `""` or empty array `[]`.
3. EXPERIENCE VS PROJECTS: If the resume has a "Projects" section but no explicit "Experience" or "Work History" section, the `experience` array MUST be empty `[]`. Do not fabricate experience from Hackathons or Achievements.
4. CAPTURE EVERYTHING: Extract ALL projects provided in the text (do not stop after one). Extract ALL skills under "Key Proficiency" or "Skills" into the `skills` array as FLAT STRINGS, not objects.
5. SKILLS FORMAT: Skills must be a flat array of strings like ["Python", "React", "Docker"]. Do NOT nest them as objects.
6. BULLET POINTS: Extract all bullet points for Projects and Experience into the `highlights` array as separate strings.
7. JSON FORMAT: Your entire response MUST be valid JSON starting with `{` and ending with `}`."""


def _extract_json(text: str, is_array: bool = False) -> Any:
    # Helper to safely extract JSON arrays or objects from LLM text
    start_char = '[' if is_array else '{'
    end_char = ']' if is_array else '}'
    start = text.find(start_char)
    end = text.rfind(end_char)
    if start != -1 and end != -1 and end >= start:
        return json.loads(text[start:end+1])
    return [] if is_array else {}

def parse_pdf_to_json(pdf_text: str) -> Dict[str, Any]:
    """Parse raw PDF text into a structured JSON master resume using a multi-pass focused strategy."""
    if not OPENAI_API_KEY:
        raise ValueError("No OpenAI API key set. Cannot parse PDF.")

    client = get_openai_client()

    # Base parsed object
    parsed = {
        "name": "",
        "contact": {"email": "", "phone": "", "location": "", "linkedin": "", "github": ""},
        "summary": "",
        "skills": [],
        "experience": [],
        "projects": [],
        "education": []
    }

    # Pass 1: Core Information
    core_prompt = """Extract basic resume information into STRICT JSON. 
DO NOT hallucinate. Reply ONLY with JSON.
Schema:
{
  "name": "",
  "contact": {"email": "", "phone": "", "location": "", "linkedin": "", "github": ""},
  "summary": "",
  "skills": ["Skill1", "Skill2"]
}"""
    try:
        res1 = _call_llm_with_retry(client, [{"role": "system", "content": core_prompt}, {"role": "user", "content": pdf_text[:4000]}], 0.1, 800)
        p1 = _extract_json(res1.choices[0].message.content)
        parsed.update({k: p1.get(k, parsed[k]) for k in ["name", "contact", "summary"]})
        if isinstance(p1.get("skills"), list):
            parsed["skills"] = [str(s) for s in p1["skills"]]
    except Exception as e:
        logger.error(f"Pass 1 (Core) Failed: {e}")

    # Pass 2: Work Experience
    exp_prompt = """Extract PROFESSIONAL WORK EXPERIENCE (jobs at companies) into a STRICT JSON array. 
DO NOT include academic projects, personal projects, or hackathons here (they go elsewhere).
If there is no formal employment history, return an empty array [].
Reply ONLY with a JSON array starting with [ and ending with ].
Schema:
[{"title": "", "company": "", "start_date": "", "end_date": "", "description": "", "technologies": []}]"""
    try:
        res2 = _call_llm_with_retry(client, [{"role": "system", "content": exp_prompt}, {"role": "user", "content": pdf_text}], 0.1, 1500)
        parsed["experience"] = _extract_json(res2.choices[0].message.content, is_array=True)
    except Exception as e:
        logger.error(f"Pass 2 (Exp) Failed: {e}")

    # Pass 3: Projects & Education
    proj_prompt = """Extract ACADEMIC/PERSONAL PROJECTS and EDUCATION into STRICT JSON.
DO NOT include professional work experience or formal employment here.
Reply ONLY with JSON.
Schema:
{
  "projects": [{"name": "", "description": "", "technologies": [], "link": ""}],
  "education": [{"degree": "", "institution": "", "year": ""}]
}"""
    try:
        res3 = _call_llm_with_retry(client, [{"role": "system", "content": proj_prompt}, {"role": "user", "content": pdf_text}], 0.1, 1000)
        p3 = _extract_json(res3.choices[0].message.content)
        parsed["projects"] = p3.get("projects", [])
        parsed["education"] = p3.get("education", [])
    except Exception as e:
        logger.error(f"Pass 3 (Proj) Failed: {e}")

    # Final Schema Guarantee
    if not isinstance(parsed["skills"], list): parsed["skills"] = []
    if not isinstance(parsed["experience"], list): parsed["experience"] = []
    if not isinstance(parsed["projects"], list): parsed["projects"] = []
    
    # --- POST-PROCESSING: FIX GEMMA 2B EXPERIENCE VS PROJECTS HALLUCINATION ---
    # Gemma 2B often misclassifies Academic/Personal Projects as "Experience" with company="N/A"
    cleaned_experience = []
    project_names = {str(p.get("name", "")).lower().strip() for p in parsed["projects"] if isinstance(p, dict)}
    
    for exp in parsed["experience"]:
        if not isinstance(exp, dict): continue
        title = str(exp.get("title", "")).strip()
        company = str(exp.get("company", "")).strip().lower()
        
        # Heuristics: if company is 'n/a', 'none', empty, or literally the same as the title, it's a project.
        if company in ["n/a", "none", "", title.lower()] or title.lower() in project_names:
            # It's a project masquerading as experience. Add it to projects if not already there.
            if title.lower() not in project_names and title:
                parsed["projects"].append({
                    "name": title,
                    "description": exp.get("description", ""),
                    "technologies": exp.get("technologies", []),
                    "link": exp.get("link", "")
                })
                project_names.add(title.lower())
        else:
            cleaned_experience.append(exp)
            
    parsed["experience"] = cleaned_experience
    
    return parsed


# ─────────────────────────────────────────────────────
# AI Feature Upgrades: Mock Interviews & Cold Emails
# ─────────────────────────────────────────────────────

def generate_mock_interview(job_description: str, job_title: str, resume_data: Dict[str, Any]) -> List[Dict[str, str]]:
    """
    Generate 5 highly specific interview questions the candidate is likely to face for this exact role,
    along with suggested talking points, based on their resume and the JD.
    """
    client = get_openai_client()
    
    job_desc = job_description or "No description provided."
    skills = resume_data.get("skills", [])
    skills = [s for s in skills if s]
    exp = [e.get("title") for e in resume_data.get("experience", []) if isinstance(e, dict)]
    exp = [title for title in exp if title]
    
    prompt = f"""
    You are an expert technical interviewer and hiring manager.
    
    Job Title: {job_title}
    Job Description Snippet: {job_desc[:1500]}
    
    Candidate Skills: {', '.join(skills[:15])}
    Candidate Experience: {', '.join(exp)}
    
    Generate exactly 5 highly specific interview questions this candidate is likely to face for this role.
    For each question, provide a brief 'strategy' on how the candidate should answer, leveraging their specific skills.
    
    Format the output strictly as a JSON array of objects with keys "question" and "strategy".
    Example:
    [
      {{"question": "How would you design X?", "strategy": "Mention your experience with Y and focus on Z."}}
    ]
    Return ONLY valid JSON.
    """
    
    response = _call_llm_with_retry(
        client=client,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
        max_tokens=1500
    )
    
    content = response.choices[0].message.content.strip()
    start_idx = content.find('[')
    end_idx = content.rfind(']')
    
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        try:
            return json.loads(content[start_idx:end_idx+1])
        except json.JSONDecodeError:
            pass
            
    # Fallback if parsing fails
    return [
        {"question": "Tell me about your experience with the key technologies mentioned in the JD.", "strategy": "Highlight overlaps between your resume skills and the job description."},
        {"question": "Describe a challenging project from your past.", "strategy": "Use the STAR method."}
    ]


def generate_cold_email(job_title: str, company: str, resume_data: Dict[str, Any]) -> str:
    """
    Generate a short, punchy outreach email tailored for recruiters or hiring managers on LinkedIn.
    """
    client = get_openai_client()
    skills = resume_data.get("skills", [])
    skills = [s for s in skills if s][:5]
    name = resume_data.get("name") or "[Your Name]"
    
    prompt = f"""
    Write a short, punchy cold outreach message (for LinkedIn or email) to a recruiter or hiring manager at {company} regarding the {job_title} role.
    
    Candidate Name: {name}
    Candidate Top Skills: {', '.join(skills)}
    
    RULES:
    - Keep it under 100 words.
    - Be professional but conversational.
    - Highlight 1-2 key skills.
    - Include a clear call to action (e.g., a quick chat).
    - Do NOT include subject lines. Just the body.
    """
    
    response = _call_llm_with_retry(
        client=client,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
        max_tokens=300
    )
    
    return response.choices[0].message.content.strip()
