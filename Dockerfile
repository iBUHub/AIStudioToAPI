# Single-stage build with Node.js 24
FROM node:24-slim

WORKDIR /app

# Install system dependencies required for Patchright/Chromium headless
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    fonts-noto-cjk \
    xvfb \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy package manifests and install all dependencies (including dev for build tools)
# Layer is cached unless package.json changes
COPY package*.json ./
RUN npm install --no-audit --no-fund --ignore-scripts \
    && npm cache clean --force

# Install Patchright Chromium browser (anti-detection)
RUN npx patchright install chromium

# Copy application source code with proper ownership
# Layer is rebuilt when source code changes
COPY --chown=node:node main.js ./
COPY --chown=node:node vite.config.js ./
COPY --chown=node:node src ./src
COPY --chown=node:node configs ./configs
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node ui ./ui

# Build frontend assets with Vite
# VERSION is passed from docker build-args for version display in UI
ARG VERSION
RUN VERSION=${VERSION} npm run build:ui

# Remove dev dependencies after build to reduce image size
RUN npm prune --omit=dev && npm cache clean --force

# TODO: Temporarily use the root user, and in the future we will switch to the node user
USER root

# Expose application ports
EXPOSE 7860

# Configure runtime environment
ENV NODE_ENV=production

# Health check for container orchestration platforms
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "const port = process.env.PORT || 7860; require('http').get('http://localhost:' + port + '/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)}).on('error', () => process.exit(1));" || exit 1

# Start the application server
CMD ["node", "main.js"]
