FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers
RUN playwright install chromium --with-deps || true

# Copy application
COPY . .

# Create a non-root user
RUN groupadd -r appgroup && useradd -r -g appgroup appuser

# Create data and log directories and set permissions for appuser
RUN mkdir -p /app/data/resumes /app/logs && \
    chown -R appuser:appgroup /app/data /app/logs /app

# Switch to non-root user
USER appuser

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
