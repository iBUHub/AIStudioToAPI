# Google AI Studio to API Adapter

[中文文档](README.md) | English

A tool that wraps Google AI Studio web interface to provide OpenAI API, Gemini API, and Anthropic API compatible endpoints. The service acts as a proxy, converting API requests to browser interactions with the AI Studio web interface.

## ✨ Features

- 🔄 **API Compatibility**: Compatible with OpenAI API, Gemini API, and Anthropic API formats
- 🌐 **Web Automation**: Uses browser automation to interact with AI Studio web interface
- 🔐 **Authentication**: Secure API key-based authentication
- 🔧 **Tool Calls Support**: OpenAI, Gemini, and Anthropic APIs all support Tool Calls (Function Calling)
- 📝 **Model Support**: Access to various Gemini models through AI Studio, including image generation and TTS (text-to-speech) models
- 🎨 **Homepage Display Control**: Provides a visual web console with account management, VNC login, and more

## 🚀 Quick Start

### 💻 Run Directly (Windows / macOS / Linux)

1. Clone the repository:

   ```bash
   git clone https://github.com/iBUHub/AIStudioToAPI.git
   cd AIStudioToAPI
   ```

2. Run the setup script:

   ```bash
   npm run setup-auth
   ```

   This script will:
   - Automatically download the Camoufox browser (a privacy-focused Firefox fork)
   - Launch the browser and navigate to AI Studio automatically
   - Save your authentication credentials locally

   > 💡 **Tip:** If downloading the Camoufox browser fails or takes too long, you can manually download it from [here](https://github.com/daijro/camoufox/releases/tag/v135.0.1-beta.24), and set the environment variable `CAMOUFOX_EXECUTABLE_PATH` to the path of the browser executable (both absolute and relative paths are supported).

3. Configure Environment Variables (Optional):

   Copy `.env.example` in the root directory to `.env`, and modify settings in `.env` as needed (e.g., port, API Key).

4. Start the service:

   ```bash
   npm start
   ```

   The API server will be available at `http://localhost:7860`

   After the service starts, you can access `http://localhost:7860` in your browser to open the web console homepage, where you can view account status and service status.

> ⚠ **Note:** Running directly does not support adding accounts via VNC online. You need to use the `npm run setup-auth` script to add accounts. VNC login is only available in Docker deployments.

### 🐋 Docker Deployment

Deploy using Docker without pre-extracting authentication credentials.

#### 🚢 Step 1: Deploy Container

##### 🎮️ Option 1: Docker Command

```bash
docker run -d \
  --name aistudio-to-api \
  -p 7860:7860 \
  -v /path/to/auth:/app/configs/auth \
  -e API_KEYS=your-api-key-1,your-api-key-2 \
  -e TZ=Asia/Shanghai \
  --restart unless-stopped \
  ghcr.io/ibuhub/aistudio-to-api:latest
```

> 💡 **Tip:** If `ghcr.io` is slow or unavailable, you can use the Docker Hub image: `ibuhub/aistudio-to-api:latest`.

Parameters:

- `-p 7860:7860`: API server port (if using a reverse proxy, strongly consider `127.0.0.1:7860`)
- `-v /path/to/auth:/app/configs/auth`: Mount directory containing auth files
- `-e API_KEYS`: Comma-separated list of API keys for authentication
- `-e TZ=Asia/Shanghai`: Timezone for logs (optional, defaults to system timezone)

##### 📦 Option 2: Docker Compose

Create a `docker-compose.yml` file:

```yaml
name: aistudio-to-api

services:
  app:
    image: ghcr.io/ibuhub/aistudio-to-api:latest
    container_name: aistudio-to-api
    ports:
      - 7860:7860
    restart: unless-stopped
    volumes:
      - ./auth:/app/configs/auth
    environment:
      API_KEYS: your-api-key-1,your-api-key-2
      TZ: Asia/Shanghai # Timezone for logs (optional)
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

##### 🛠️ Option 3: Build from Source

If you prefer to build the Docker image yourself, you can use the following commands:

1. Build the image:

   ```bash
   docker build -t aistudio-to-api .
   ```

2. Run the container:

   ```bash
   docker run -d \
     --name aistudio-to-api \
     -p 7860:7860 \
     -v /path/to/auth:/app/configs/auth \
     -e API_KEYS=your-api-key-1,your-api-key-2 \
     -e TZ=Asia/Shanghai \
     --restart unless-stopped \
     aistudio-to-api
   ```

#### 🔑 Step 2: Account Management

After deployment, you need to add Google accounts using one of these methods:

**Method 1: VNC-Based Login (Recommended)**

- Access the deployed service address in your browser (e.g., `http://your-server:7860`) and click the "Add User" button
- You'll be redirected to a VNC page with a browser instance
- Log in to your Google account, then click the "Save" button after login is complete
- The account will be automatically saved as `auth-N.json` (N starts from 0)

**Method 2: Upload Auth Files**

- Run `npm run setup-auth` on your local machine to generate auth files (refer to steps 1 and 2 of [Run Directly](#-run-directly-windows--macos--linux)), the auth files are in `/configs/auth`
- In the web console, click "Upload Auth" to upload the auth JSON file, or manually upload to the mounted `/path/to/auth` directory

> 💡 **Tip**: You can also download auth files from an existing container and upload them to a new container. Click the "Download Auth" button for the corresponding account in the web console to download the auth file.

> ⚠ Environment variable-based auth injection is no longer supported.

#### 🌐 Step 3 (Optional): Nginx Reverse Proxy

If you need to access via a domain name or want unified management at the reverse proxy layer (e.g., configure HTTPS, load balancing, etc.), you can use Nginx.

> 📖 For detailed Nginx configuration instructions, see: [Nginx Reverse Proxy Configuration](docs/en/nginx-setup.md)

### 🐾 Claw Cloud Run Deployment

Deploy directly on Claw Cloud Run, a fully managed container platform.

> 📖 For detailed deployment instructions, see: [Deploy on Claw Cloud Run](docs/en/claw-cloud-run.md)

### 🦓 Zeabur Deployment

Deploy on the Zeabur container platform.

> ⚠ **Note:** Zeabur's free tier provides only $5 credits per month, which is not enough to run 24/7. Please pause the service when not in use!

> 📖 For detailed deployment instructions, see: [Deploy on Zeabur](docs/en/zeabur.md)

## 📡 API Usage

### 🤖 OpenAI-Compatible API

This endpoint is processed and then forwarded to the official Gemini API format endpoint.

- `GET /v1/models`: List models.
- `POST /v1/chat/completions`: Chat completion and image generation, supports non-streaming, real streaming, and fake streaming.

### ♊ Gemini Native API Format

This endpoint is forwarded to the official Gemini API format endpoint.

- `GET /v1beta/models`: List available Gemini models.
- `POST /v1beta/models/{model_name}:generateContent`: Generate content, images, and speech.
- `POST /v1beta/models/{model_name}:streamGenerateContent`: Stream content, image, and speech generation, supports real and fake streaming.
- `POST /v1beta/models/{model_name}:batchEmbedContents`: Batch generate text embedding vectors.
- `POST /v1beta/models/{model_name}:predict`: Imagen series models image generation.

### 👤 Anthropic Compatible API

This endpoint forwards requests to the official Gemini API format endpoint.

- `GET /v1/models`: List models.
- `POST /v1/messages`: Chat message completions, supports non-streaming, real streaming, and fake streaming.
- `POST /v1/messages/count_tokens`: Count tokens in the messages.

> 📖 For detailed API usage examples, see: [API Usage Examples](docs/en/api-examples.md)

## 🧰 Configuration

### 🔧 Environment Variables

#### 📱 Application Configuration

| Variable                    | Description                                                                    | Default              |
| :-------------------------- | :----------------------------------------------------------------------------- | :------------------- |
| `API_KEYS`                  | Comma-separated list of valid API keys for authentication.                     | `123456`             |
| `PORT`                      | API server port.                                                               | `7860`               |
| `HOST`                      | Server listening host address.                                                 | `0.0.0.0`            |
| `ICON_URL`                  | Custom favicon URL for the console. Supports ICO, PNG, SVG, etc.               | `/AIStudio_logo.svg` |
| `SECURE_COOKIES`            | Enable secure cookies. `true` for HTTPS only, `false` for both HTTP and HTTPS. | `false`              |
| `RATE_LIMIT_MAX_ATTEMPTS`   | Maximum failed login attempts allowed within the time window (`0` to disable). | `5`                  |
| `RATE_LIMIT_WINDOW_MINUTES` | Time window for rate limiting in minutes.                                      | `15`                 |
| `CHECK_UPDATE`              | Enable version update check on page load (`false` to disable).                 | `true`               |
| `LOG_LEVEL`                 | Logging output level. Set to `DEBUG` for detailed debug logs.                  | `INFO`               |

#### 🌐 Proxy Configuration

| Variable                        | Description                                                                                                                                                                                                 | Default   |
| :------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------- |
| `INITIAL_AUTH_INDEX`            | Initial authentication index to use on startup.                                                                                                                                                             | `0`       |
| `ENABLE_AUTH_UPDATE`            | Whether to enable automatic auth credential updates. Defaults to enabled. The auth file will be automatically updated upon successful login/account switch and every 24 hours. Set to `false` to disable.   | `true`    |
| `MAX_RETRIES`                   | Maximum number of retries for failed requests (only effective for fake streaming and non-streaming).                                                                                                        | `3`       |
| `RETRY_DELAY`                   | Delay between retries in milliseconds.                                                                                                                                                                      | `2000`    |
| `SWITCH_ON_USES`                | Number of requests before automatically switching accounts (`0` to disable).                                                                                                                                | `40`      |
| `FAILURE_THRESHOLD`             | Number of consecutive failures before switching accounts (`0` to disable).                                                                                                                                  | `3`       |
| `IMMEDIATE_SWITCH_STATUS_CODES` | HTTP status codes that trigger immediate account switching (comma-separated, set to empty to disable).                                                                                                      | `429,503` |
| `HTTP_PROXY`                    | HTTP proxy address for accessing Google services.                                                                                                                                                           | None      |
| `HTTPS_PROXY`                   | HTTPS proxy address for accessing Google services.                                                                                                                                                          | None      |
| `NO_PROXY`                      | Comma-separated list of addresses to bypass the proxy. The project automatically bypasses local addresses (localhost, 127.0.0.1 and 0.0.0.0), so manual local bypass configuration is usually not required. | None      |

#### 🗒️ Other Configuration

| Variable                   | Description                                                                                                                | Default       |
| :------------------------- | :------------------------------------------------------------------------------------------------------------------------- | :------------ |
| `STREAMING_MODE`           | Streaming mode. `real` for real streaming, `fake` for fake streaming.                                                      | `real`        |
| `FORCE_THINKING`           | Force enable thinking mode for all requests.                                                                               | `false`       |
| `FORCE_WEB_SEARCH`         | Force enable web search for all requests.                                                                                  | `false`       |
| `FORCE_URL_CONTEXT`        | Force enable URL context for all requests.                                                                                 | `false`       |
| `CAMOUFOX_EXECUTABLE_PATH` | Path to the Camoufox browser executable (supports both absolute and relative paths). Only required if manually downloaded. | Auto-detected |

### 🧠 Model List Configuration

Edit `configs/models.json` to customize available models and their settings.

## 📄 License

This project is a fork of [**ais2api**](https://github.com/Ellinav/ais2api) by [**Ellinav**](https://github.com/Ellinav), and fully adopts the CC BY-NC 4.0 license used by the upstream project. All usage, distribution, and modification activities must comply with all terms of the original license. See the full license text in [LICENSE](LICENSE).

## 🤝 Contributors

[![Contributors](https://contrib.rocks/image?repo=iBUHub/AIStudioToAPI)](https://github.com/iBUHub/AIStudioToAPI/graphs/contributors)

We would like to thank all developers who have contributed their time, effort, and wisdom to this project.
