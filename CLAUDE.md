# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AIStudioToAPI is a proxy server that wraps Google AI Studio's web interface and exposes it as API endpoints compatible with OpenAI, Gemini, and Anthropic API formats. The system uses browser automation (Playwright with Camoufox/Firefox) to interact with AI Studio's web interface and translates API requests into browser interactions.

## Common Commands

### Development

```bash
npm run dev              # Start dev server with hot reload (server + UI)
npm run dev:server       # Start only the server in dev mode
npm run dev:ui           # Build UI in watch mode
```

### Production

```bash
npm start                # Build UI and start production server
```

### Authentication Setup

```bash
npm run setup-auth       # Interactive auth setup (launches browser)
npm run save-auth        # Save authentication credentials
```

### Code Quality

```bash
npm run lint             # Lint JavaScript and CSS
npm run lint:fix         # Auto-fix linting issues
npm run lint:js          # Lint only JavaScript files
npm run lint:css         # Lint only CSS/Less files
npm run format           # Format all files with Prettier
npm run format:check     # Check formatting without changes
```

### UI Development

```bash
npm run build:ui         # Build Vue.js UI for production
npm run preview:ui       # Preview built UI
```

## Architecture

### Core System Components

The system follows a modular architecture with clear separation of concerns:

**ProxyServerSystem** (`src/core/ProxyServerSystem.js`)

- Main orchestrator that integrates all modules
- Manages HTTP/WebSocket servers
- Coordinates between authentication, browser management, and request handling
- Entry point: `main.js` instantiates and starts this system

**BrowserManager** (`src/core/BrowserManager.js`)

- Manages headless Firefox/Camoufox browser instances
- Implements multi-context architecture: maintains a pool of browser contexts (Map: authIndex -> {context, page, healthMonitorInterval})
- Handles context switching between different Google accounts
- Injects and manages the client-side script (`build.js`) that communicates with AI Studio
- Supports background context initialization and rebalancing

**ConnectionRegistry** (`src/core/ConnectionRegistry.js`)

- Manages WebSocket connections from browser contexts
- Routes messages to appropriate MessageQueue instances
- Implements grace period for reconnection attempts
- Supports multiple concurrent connections (one per auth context)

**RequestHandler** (`src/core/RequestHandler.js`)

- Processes incoming API requests
- Coordinates retry logic and account switching
- Delegates to AuthSwitcher for account management
- Delegates to FormatConverter for API format translation

**AuthSwitcher** (`src/auth/AuthSwitcher.js`)

- Handles automatic account switching based on:
  - Usage count (SWITCH_ON_USES)
  - Failure threshold (FAILURE_THRESHOLD)
  - Immediate status codes (IMMEDIATE_SWITCH_STATUS_CODES: 429, 503)
- Manages system busy state during switches

**FormatConverter** (`src/core/FormatConverter.js`)

- Converts between API formats (OpenAI ↔ Gemini ↔ Anthropic)
- Handles streaming and non-streaming responses

**AuthSource** (`src/auth/AuthSource.js`)

- Loads authentication data from `configs/auth/auth-N.json` files
- Validates and deduplicates accounts by email
- Maintains rotation indices for account switching

### Request Flow

1. Client sends API request (OpenAI/Gemini/Anthropic format) → Express routes
2. RequestHandler receives request → FormatConverter normalizes to Gemini format
3. RequestHandler checks ConnectionRegistry for active WebSocket
4. If no connection: BrowserManager initializes/switches browser context
5. Request sent via WebSocket to browser context → injected script interacts with AI Studio
6. Response streams back via WebSocket → FormatConverter translates to requested format
7. On failure: AuthSwitcher may trigger account switch based on configured thresholds

### Multi-Context Architecture

The system maintains multiple browser contexts simultaneously:

- Each Google account gets its own browser context and page
- Contexts are initialized on-demand or in background
- Current account tracked via `browserManager.currentAuthIndex`
- Background initialization prevents request delays when switching accounts
- Context pool rebalancing ensures optimal resource usage

### UI Structure

- **Frontend**: Vue.js 3 + Element Plus + Vite
- **Location**: `ui/` directory
- **Build output**: `ui/dist/` (served by Express)
- **Features**: Account management, VNC login, status monitoring, auth file upload/download

## Configuration

### Environment Variables

Key variables (see `.env.example` for full list):

- `PORT`: API server port (default: 7860)
- `WS_PORT`: WebSocket port for browser communication (default: 9998)
- `API_KEYS`: Comma-separated API keys for client authentication
- `INITIAL_AUTH_INDEX`: Starting account index (default: 0)
- `STREAMING_MODE`: "real" or "fake" streaming
- `SWITCH_ON_USES`: Auto-switch after N requests (default: 40)
- `FAILURE_THRESHOLD`: Switch after N consecutive failures (default: 3)
- `IMMEDIATE_SWITCH_STATUS_CODES`: Status codes triggering immediate switch (default: 429,503)
- `HTTP_PROXY`/`HTTPS_PROXY`: Proxy configuration for Google services
- `CAMOUFOX_EXECUTABLE_PATH`: Custom browser executable path
- `LOG_LEVEL`: Set to "DEBUG" for verbose logging

### Model Configuration

Edit `configs/models.json` to customize available models and their settings.

### Authentication Files

- Location: `configs/auth/auth-N.json` (N = 0, 1, 2, ...)
- Format: Playwright browser context state (cookies, localStorage, etc.)
- Generated by: `npm run setup-auth` or VNC login in Docker

## Key Technical Details

### Browser Automation

- Uses Playwright with Camoufox (privacy-focused Firefox fork)
- Injects `build.js` script into AI Studio page for WebSocket communication
- Script location: `public/build.js` (built from `ui/app/`)
- Health monitoring via periodic checks and reconnection logic

### WebSocket Communication

- Browser contexts connect to WebSocket server on WS_PORT
- Each connection identified by authIndex
- MessageQueue pattern for request/response correlation
- Grace period (60s) for reconnection before triggering callback

### Account Switching

- Automatic switching based on usage/failures
- Supports immediate switching on specific HTTP status codes
- System busy flag prevents concurrent switches
- Lightweight reconnect attempts before full context switch

### Streaming Modes

- **Real streaming**: True SSE streaming from AI Studio
- **Fake streaming**: Buffer complete response, then stream to client

## Development Notes

### Testing

- Test files in `test/` directory
- Client test scripts in `scripts/client/`
- Auth test scripts in `scripts/auth/`

### Linting & Formatting

- ESLint for JavaScript (includes Vue plugin)
- Stylelint for CSS/Less
- Prettier for code formatting
- Pre-commit hooks via Husky + lint-staged

### Docker

- Dockerfile supports VNC for browser interaction
- Auth files mounted via volume: `/app/configs/auth`
- Environment variables for configuration

### Git Workflow

- Main branch: `main`
