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

# Expose FastAPI port (use 5000 to match frontend proxy and app config)
EXPOSE 5000

# Start the application via Python script
CMD ["python", "run_server.py"]
