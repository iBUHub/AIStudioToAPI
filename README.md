# AIStudio To API

[中文文档](README_CN.md) | English

A tool that wraps Google AI Studio web interface to provide OpenAI API and Gemini API compatible endpoints. The service acts as a proxy, converting API requests to browser interactions with the AI Studio web interface.

> **Acknowledgements**: This project is forked from [ais2api](https://github.com/Ellinav/ais2api) by [Ellinav](https://github.com/Ellinav). We express our sincere gratitude to the original author for creating this excellent foundation.

## ✨ Features

- 🔄 **API Compatibility**: Compatible with both OpenAI API and Gemini API formats
- 🌐 **Web Automation**: Uses browser automation to interact with AI Studio web interface
- 🔐 **Authentication**: Secure API key-based authentication
- 🐳 **Docker Support**: Easy deployment with Docker and Docker Compose
- 📝 **Model Support**: Access to various Gemini models through AI Studio

## 🚀 Quick Start

### 💻 Local Development (Windows Only)

1. Clone the repository:
```powershell
git clone https://github.com/iBenzene/AIStudioToAPI.git
cd AIStudioToAPI
```

2. Run the setup script:
```powershell
npm run setup-auth
```

This script will:
- Automatically download the Camoufox browser (a privacy-focused Firefox fork)
- Launch the browser and navigate to AI Studio automatically
- Save your authentication credentials locally

3. Start the service:
```powershell
npm install
npm start
```

The API server will be available at `http://localhost:7860`

### 🌐 Server Deployment (Linux VPS)

For production deployment on a server (Linux VPS), you need to extract authentication credentials from a Windows machine first.

#### 📝 Step 1: Extract Authentication Credentials (on Windows)

1. Clone the repository on a Windows machine:
```powershell
git clone https://github.com/iBenzene/AIStudioToAPI.git
cd AIStudioToAPI
```

2. Run the setup script:
```powershell
npm run setup-auth
```

This will:
- Download Camoufox browser automatically
- Launch the browser and navigate to AI Studio automatically
- Log in with your Google account
- Save authentication credentials to `configs/auth/auth_N.json` (where N is an auto-incremented index starting from 0)

**How it works**: The script uses browser automation to capture your AI Studio session cookies and tokens, storing them securely in a JSON file. The authentication file is named with an auto-incremented index (auth_0.json, auth_1.json, etc.) to support multiple accounts. This allows the API to make authenticated requests to AI Studio without requiring interactive login on the server.

3. Locate the authentication file:
```powershell
ls configs/auth/auth_*.json
```

4. Copy the auth file to your server:
```powershell
scp configs/auth/auth_*.json user@your-server:/path/to/deployment/configs/auth/
```

5. You can now delete the cloned repository from your Windows machine.

#### 🚢 Step 2: Deploy on Server

##### 🐋 Option 1: Docker Command

```bash
docker run -d \
  --name aistudio-to-api \
  -p 7860:7860 \
  -v /path/to/auth:/app/configs/auth \
  -e API_KEYS=your-api-key-1,your-api-key-2 \
  --restart unless-stopped \
  ghcr.io/ibenzene/aistudio-to-api:latest
```

Parameters:
- `-p 7860:7860`: API server port (if using a reverse proxy, strongly consider `127.0.0.1:7860`)
- `-v /path/to/auth:/app/configs/auth`: Mount directory containing auth files
- `-e API_KEYS`: Comma-separated list of API keys for authentication

##### 📦 Option 2: Docker Compose

Create a `docker-compose.yml` file:

```yaml
name: aistudio-to-api

services:
  app:
    image: ghcr.io/ibenzene/aistudio-to-api:latest
    container_name: aistudio-to-api    
    ports:
      - 7860:7860
    restart: unless-stopped
    volumes:
      - ./auth:/app/configs/auth
    environment:
      API_KEYS: your-api-key-1,your-api-key-2
```

Start the service:
```bash
sudo docker compose up -d
```

View logs:
```bash
sudo docker compose logs -f
```

Stop the service:
```bash
sudo docker compose down
```

##### 🌐 Step 3 (Optional): Nginx Reverse Proxy

If you need to access via a domain name or want unified management at the reverse proxy layer (e.g., configure HTTPS, load balancing, etc.), you can use Nginx. Here's the recommended configuration:

Create an Nginx configuration file `/etc/nginx/sites-available/aistudio-api`:

```nginx
server {
    listen 80;
    listen [::]:80;  # IPv6 support
    server_name your-domain.com;  # Replace with your domain

    # For HTTPS, uncomment the following lines and configure SSL certificates
    # listen 443 ssl http2;
    # listen [::]:443 ssl http2;  # IPv6 HTTPS
    # ssl_certificate /path/to/your/certificate.crt;
    # ssl_certificate_key /path/to/your/private.key;

    # Client request body size limit (0 = unlimited)
    client_max_body_size 0;

    location / {
        # Reverse proxy to Docker container
        proxy_pass http://127.0.0.1:7860;

        # Critical: Pass real client IP
        # X-Real-IP: Highest priority, contains the real client IP
        proxy_set_header X-Real-IP $remote_addr;
        
        # X-Forwarded-For: Contains the complete proxy chain
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # Other necessary proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeout settings (adapted for long-running AI requests)
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;

        # Disable buffering to support streaming responses
        proxy_buffering off;
    }
}
```

Enable the configuration and restart Nginx:

```bash
# Create symbolic link to enable site
sudo ln -s /etc/nginx/sites-available/aistudio-api /etc/nginx/sites-enabled/

# Test if configuration is correct
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

**Tips**:
- If you configured HTTPS, it's recommended to set environment variable `SECURE_COOKIES=true` to enable secure cookies
- If using HTTP only, keep `SECURE_COOKIES=false` (default) or leave it unset
- The configuration must correctly set `X-Real-IP` and `X-Forwarded-For` headers to ensure the server can obtain the real client IP

## 📡 API Usage

### 🤖 OpenAI-Compatible API

```bash
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-2.5-flash-lite",
    "messages": [
      {
        "role": "user",
        "content": "Hello, how are you?"
      }
    ],
    "stream": false
  }'
```

### ♊ Gemini Native API Format

```bash
curl -X POST http://localhost:7860/proxy/v1beta/models/gemini-2.5-flash-lite:generateContent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "Hello, how are you?"
          }
        ]
      }
    ]
  }'
```

### 🌊 Streaming Response

```bash
# OpenAI Compatible Streaming Response
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-2.5-flash-lite",
    "messages": [
      {
        "role": "user",
        "content": "Write a short poem about autumn"
      }
    ],
    "stream": true
  }'
```

```bash
# Gemini Native API Streaming Response
curl -X POST http://localhost:7860/v1beta/models/gemini-2.5-flash-lite:streamGenerateContent?alt=sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "Write a short poem about autumn"
          }
        ]
      }
    ]
  }'
```

## ⚙️ Configuration

### 🔧 Environment Variables

- `API_KEYS`: Comma-separated list of valid API keys for authentication
- `PORT`: API server port (default: 7860)
- `HOST`: Server listening host address (default: 0.0.0.0)
- `SECURE_COOKIES`: Enable secure cookies (HTTPS only)
  - Set to `true`: Only HTTPS connections can login (for production with SSL certificates)
  - Set to `false` or leave unset: Both HTTP and HTTPS can login (default, beginner-friendly)
- `ICON_URL`: Custom favicon URL for the web interface
  - Supports any image format (ICO, PNG, SVG, etc.)
  - Supports any size; common sizes are 16x16, 32x32, 48x48 (ICO/PNG) or vector (SVG)
  - Example: `https://example.com/favicon.ico`
  - If not set, no favicon will be displayed

### 🧠 Model Configuration

Edit `configs/models.json` to customize available models and their settings.

## 📄 License

This project is a fork of [**ais2api**](https://github.com/Ellinav/ais2api) by [**Ellinav**](https://github.com/Ellinav), and fully adopts the CC BY-NC 4.0 license used by the upstream project. All usage, distribution, and modification activities must comply with all terms of the original license. See the full license text in [LICENSE](LICENSE).

### Copyright / Attribution

- Original work Copyright © [Ellinav](https://github.com/Ellinav)
- Modifications and additions Copyright © 2024 [iBenzene](https://github.com/iBenzene) and contributors
