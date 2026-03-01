# 🚀 AI Career Copilot

An intelligent, AI-powered job discovery and application automation system built for focused, quality-targeted job searching.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Career Copilot                        │
├────────────────┬──────────────────┬─────────────────────────┤
│  Job Scrapers  │  Scoring Engine  │  LLM Resume Generator   │
│  ─ RemoteOK    │  ─ Skill match   │  ─ OpenAI / Local LLM   │
│  ─ Wellfound   │  ─ Keyword match │  ─ ATS-optimized output │
│  ─ (extensible)│  ─ Location/Sal  │  ─ DOCX + PDF export    │
├────────────────┴──────────────────┴─────────────────────────┤
│              FastAPI Backend (REST API)                     │
├────────────────────────────────┬────────────────────────────┤
│     SQLite / PostgreSQL DB     │  Playwright Automation     │
│     ─ Jobs, Scores, Resumes    │  ─ Semi-auto (review)      │
│     ─ Applications, Profile    │  ─ Full auto mode          │
├────────────────────────────────┴────────────────────────────┤
│              Streamlit Dashboard (Frontend)                  │
│  Dashboard │ Jobs │ Applications │ Profile │ Settings       │
└─────────────────────────────────────────────────────────────┘
```

---

## ✨ Features

| Feature | Status |
|---------|--------|
| Candidate profile management | ✅ |
| Job scraping (RemoteOK, Wellfound) | ✅ |
| AI job scoring (0–100) | ✅ |
| LLM resume customization | ✅ |
| Cover letter generation | ✅ |
| DOCX + PDF resume export | ✅ |
| Application tracking | ✅ |
| Semi-automatic application | ✅ |
| Full auto application | ✅ |
| Streamlit dashboard | ✅ |
| Daily scheduler | ✅ |
| Docker support | ✅ |

---

## 🚀 Quick Start

### Option 1: Docker (Recommended)

```bash
# 1. Clone and enter directory
git clone <repo-url>
cd ai-career-copilot

# 2. Set your OpenAI API key (for AI resume generation)
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# 3. Start all services
docker-compose up -d

# 4. Run setup to seed sample data
python setup.py

# 5. Open the dashboard
open http://localhost:8501
```

### Option 2: Manual Setup

```bash
# Backend
cd backend
pip install -r requirements.txt
playwright install chromium  # For automation

# Create .env from template
cp ../.env.example .env

# Start backend
uvicorn main:app --reload --port 8000

# Frontend (in another terminal)
cd frontend
pip install streamlit requests pandas
streamlit run app.py

# Scheduler (optional, in another terminal)
cd backend
python scheduler.py
```

---

## 📖 Usage Guide

### 1. Set Up Your Profile

1. Open dashboard at http://localhost:8501
2. Navigate to **👤 Profile**
3. Fill in your personal details, skills, and job preferences
4. Enter your **Master Resume** in JSON format (template below)
5. Save profile

**Master Resume JSON Template:**
```json
{
  "summary": "Your professional summary",
  "experience": [
    {
      "title": "Software Engineer",
      "company": "Company Name",
      "start_date": "Jan 2023",
      "end_date": "Present",
      "highlights": ["Achievement 1", "Achievement 2"],
      "technologies": ["Python", "FastAPI"]
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "description": "What it does",
      "technologies": ["Python", "React"],
      "highlights": ["Key feature 1", "Key feature 2"]
    }
  ],
  "education": [
    {
      "degree": "B.Tech Computer Science",
      "institution": "University Name",
      "year": "2023",
      "gpa": "8.5/10"
    }
  ],
  "certifications": ["AWS Certified", "Google Cloud"]
}
```

### 2. Fetch Jobs

1. Go to **💼 Jobs** tab
2. Click **🔄 Fetch New Jobs**
3. Or configure sources in **⚙️ Settings** → Fetch Jobs Now
4. Jobs are automatically scored based on your profile

### 3. Review & Apply

For each high-scoring job:
1. Click **📝 Generate Resume** — AI customizes your resume for this role
2. Review the generated resume and cover letter
3. Click **📋 Track Application** to add to tracker
4. Click **🚀 Open & Apply** to open the job page in browser

### 4. Track Applications

1. Go to **📝 Applications** tab
2. Update status as you progress: `pending → applied → interview → offer`
3. Add notes for each application
4. Monitor your funnel on the Dashboard

---

## 🔌 API Reference

Full API documentation available at: http://localhost:8000/docs

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/profile` | Get candidate profile |
| POST | `/profile` | Create/update profile |
| GET | `/jobs` | List jobs (with optional score filter) |
| POST | `/jobs/fetch` | Trigger job fetching |
| POST | `/resumes/generate/{job_id}` | Generate AI resume for job |
| GET | `/applications` | List all applications |
| POST | `/applications` | Create application record |
| PATCH | `/applications/{id}` | Update application status |
| POST | `/applications/{id}/apply` | Trigger application automation |
| GET | `/stats` | Dashboard statistics |

---

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | OpenAI API key for AI features |
| `LLM_MODEL` | `gpt-4o-mini` | LLM model to use |
| `LLM_BASE_URL` | OpenAI | Override for local LLMs (Ollama etc.) |
| `DATABASE_URL` | SQLite | Database connection string |
| `DAILY_LIMIT` | `20` | Max applications per day |
| `OUTPUT_DIR` | `./data/resumes` | Resume file storage |

### Using Local LLMs (Ollama)

```bash
# Install Ollama and pull a model
ollama pull llama3

# Set environment variables
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=llama3
OPENAI_API_KEY=ollama  # Required but unused
```

---

## 🔮 Phase 2 Roadmap

- [ ] Semantic/embedding-based job matching
- [ ] Email/Telegram notifications for top matches
- [ ] Response rate analytics and success pattern detection
- [ ] LinkedIn Easy Apply automation
- [ ] Interview preparation generator (AI mock interviews)
- [ ] Multi-user support
- [ ] Company research integration

---

## 📁 Project Structure

```
ai-career-copilot/
├── backend/
│   ├── main.py              # FastAPI application
│   ├── models/
│   │   ├── database.py      # SQLAlchemy models
│   │   └── schemas.py       # Pydantic schemas
│   ├── services/
│   │   ├── scorer.py        # Job matching engine
│   │   ├── llm_service.py   # Resume/cover letter generation
│   │   ├── resume_exporter.py # DOCX/PDF export
│   │   └── automation.py    # Playwright automation
│   ├── scrapers/
│   │   └── job_scraper.py   # RemoteOK, Wellfound scrapers
│   ├── scheduler.py         # Daily automation scheduler
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── app.py               # Streamlit dashboard
│   └── Dockerfile
├── data/
│   ├── sample/
│   │   └── sample_data.json # Sample profile and jobs
│   └── resumes/             # Generated resume files
├── docker-compose.yml
├── setup.py                 # Quick setup script
├── .env.example
└── README.md
```

---

## 🛡️ Ethics & Compliance

- **Respects ToS**: Scrapers use human-like delays and avoid aggressive crawling
- **No fabrication**: LLM is explicitly instructed never to invent experience or skills
- **Daily limits**: Configurable cap on daily applications (default: 20)
- **User control**: Semi-auto mode (default) keeps humans in the loop
- **Data privacy**: All data stored locally; no external data sharing

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -m 'Add my feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📄 License

MIT License — see LICENSE file for details.
