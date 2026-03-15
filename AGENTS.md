# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

This is a Node.js Express-based multi-provider TTS (Text-to-Speech) microservice that provides a unified API for various TTS providers including Aliyun CosyVoice, Qwen, Tencent, Volcano Engine, and MiniMax.

## Common Development Commands

### Starting the Service
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start

# Alternative startup scripts
./scripts/start.sh        # Linux/Mac
./scripts/start.bat       # Windows
```

### Running Tests
```bash
# Run unified API test (tests all TTS providers)
node tests/test-unified-api.js

# Test specific providers
npm run test:tts          # General TTS test
npm run test:qwen-tts     # Qwen TTS specific test
npm run test:snpan        # Snpan functionality test

# Debug tests
node tests/debug/debug-unified-api.js

# Test single providers
node tests/test-cosyvoice-only.js
node tests/test-tencent-only.js
```

### Model Management
```bash
# Interactive voice model management
node scripts/model-manager.js

# Clear cache
node scripts/clear-cache.js
```

## Architecture Overview

### Directory Structure
- `apps/api/` - Express server entry point and API routes
  - `index.js` - Main server file (starts on port 3000 by default)
  - `routes/` - API route definitions
  - `public/` - Static assets and demo pages

- `src/` - Core business logic
  - `modules/tts/` - TTS module implementation
    - `core/` - Base classes, factory pattern, service manager
    - `providers/` - Individual TTS provider implementations
    - `routes/` - TTS-related API routes
  - `core/` - Shared core functionality (auth, monitoring)
  - `shared/` - Common utilities and configurations

### Key Architectural Patterns

1. **Factory Pattern**: `TtsFactory` creates and manages TTS service instances
2. **Provider Pattern**: Each TTS service (Aliyun, Tencent, etc.) extends `BaseTtsService`
3. **Unified API**: All providers expose the same interface through `/api/tts/synthesize`
4. **Middleware-based Auth**: API key authentication via `apiKeyMiddleware`

### API Endpoints

Main endpoints (all require API key except /health):
- `GET /health` - Health check
- `POST /api/tts/synthesize` - Unified TTS synthesis
- `GET /api/tts/voices` - List available voices
- `GET /api/voice-models/models` - Voice model management

### Environment Variables

Required environment variables (create .env file):
- `PORT` - Server port (default: 3000)
- `API_KEYS` - Comma-separated API keys for authentication
- `TTS_API_KEY` - Aliyun TTS API key
- `TENCENTCLOUD_SECRET_ID` - Tencent Cloud secret ID
- `TENCENTCLOUD_SECRET_KEY` - Tencent Cloud secret key
- `TENCENTCLOUD_REGION` - Tencent region (default: ap-guangzhou)
- `VOLCENGINE_ACCESS_KEY` - Volcano Engine access key
- `VOLCENGINE_SECRET_KEY` - Volcano Engine secret key
- `MINIMAX_API_KEY` - MiniMax API key
- `AUDIO_DIR` - Audio file storage directory

### Testing a TTS Request

```bash
# Test with curl
curl -X POST http://localhost:3000/api/tts/synthesize \
  -H "X-API-Key: key2" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, this is a test",
    "service": "aliyun_cosyvoice",
    "voice": "longxiaochun_v2"
  }'
```

### Provider Status
Currently supported providers:
- ✅ Aliyun CosyVoice (stable)
- ✅ Aliyun Qwen HTTP (stable)
- ⚠️ Aliyun Qwen WebSocket (may have timeout issues)
- ✅ Tencent TTS (stable)
- ✅ Volcano Engine HTTP (stable)
- ⚠️ Volcano Engine WebSocket (timeout issues)
- ⚠️ MiniMax TTS (account balance issues)

### Debugging Tips

1. Check provider credentials in environment variables
2. Use debug test scripts in `tests/debug/` directory
3. Monitor logs for specific error messages
4. Test providers individually using provider-specific test files
5. Check audio file permissions in storage directories