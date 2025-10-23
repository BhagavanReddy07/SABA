# Use official Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy and install dependencies first for caching
COPY requirements.txt .

# Upgrade pip and install dependencies
RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Environment will be provided via Docker Compose or deployment platform
# (If you need to bake envs in, mount or COPY a file explicitly in your own Docker build)

# Expose FastAPI port (use 5000 to match frontend proxy and app config)
EXPOSE 5000

# Copy the Python runner script
COPY run_server.py /app/run_server.py

# Start the application via Python script
CMD ["python", "run_server.py"]
