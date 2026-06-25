# Multi-process Node/Python environment for Hybrid Bot
FROM nikolaik/python-nodejs:python3.12-nodejs20-slim

WORKDIR /app

# Install system dependencies (required for building native modules like better-sqlite3)
RUN apt-get update && apt-get install -y \
    build-essential \
    python3-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install python libraries
RUN pip install --no-cache-dir \
    pandas \
    numpy \
    xgboost \
    pandas-ta

# Copy package configuration files
COPY package.json package-lock.json ./

# Install Node.js dependencies
RUN npm install

# Copy all project files (ignoring files defined in .gitignore)
COPY . .

# Build Next.js project
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Make entrypoint script executable
RUN chmod +x entrypoint.sh

# Expose Next.js port
EXPOSE 3039

# Execute startup script
CMD ["/bin/bash", "/app/entrypoint.sh"]
