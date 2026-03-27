---
description: How to start the full application stack (frontend, backend, celery)
---

# Starting the Application

Run these in **3 separate terminals**:

## Terminal 1: Backend (FastAPI)
// turbo
```bash
cd /Users/sparsh/Documents/Coding/AI_jobApplication/backend && source .venv/bin/activate && uvicorn main:app --reload --reload-exclude '*.venv*'
```
→ Runs on `http://127.0.0.1:8000`

> **Important**: The `--reload-exclude '*.venv*'` flag prevents uvicorn from restarting every time pip packages change.

## Terminal 2: Celery Worker
// turbo
```bash
cd /Users/sparsh/Documents/Coding/AI_jobApplication/backend && source .venv/bin/activate && celery -A core.tasks worker --pool=solo --loglevel=info
```

## Terminal 3: Frontend (Next.js)
// turbo
```bash
cd /Users/sparsh/Documents/Coding/AI_jobApplication/frontend && npm run dev
```
→ Runs on `http://localhost:3000`

## Troubleshooting

### Port already in use
```bash
lsof -ti :3000 | xargs kill -9
```

### Next.js cache corruption (`clientModules` error)
```bash
cd /Users/sparsh/Documents/Coding/AI_jobApplication/frontend && rm -rf .next && npm run dev
```

### Next.js module not found (`Cannot find module`)
```bash
cd /Users/sparsh/Documents/Coding/AI_jobApplication/frontend && rm -rf node_modules .next && npm install && npm run dev
```

### Celery bus error (corrupted packages)
```bash
cd /Users/sparsh/Documents/Coding/AI_jobApplication/backend && source .venv/bin/activate && pip install --force-reinstall packaging huggingface-hub sentence-transformers
```
