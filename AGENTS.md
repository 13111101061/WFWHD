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

## Manifest 配置体系（唯一事实源）

新增或修改服务商，只需改 **一个文件**：`src/modules/tts/providers/manifests/<provider>/manifest.json`

已删除的旧配置文件（不再读取，不可恢复）：
- `src/modules/tts/config/service-field-overrides.json`
- `src/modules/tts/config/provider-field-mappings.json`
- `src/modules/tts/config/ProviderConfig.json`

**如果这些文件被重新创建，启动审计会直接报错停止。**

### 新增服务商三步流程
1. 写 Adapter：`src/modules/tts/adapters/providers/<NewAdapter>.js`
2. 写 Manifest：`src/modules/tts/providers/manifests/<provider>/manifest.json`
3. 注册 Adapter：`src/modules/tts/adapters/providers/index.js` 加一行

### Manifest 填写规范
| 字段 | 要求 |
|------|------|
| `voiceCode.serviceKey` | 短后缀（如 `tts`、`http`），**不是**完整 canonical key |
| 一个服务商多个接口 | 应声明为 **独立的 service**（`services.xxx` 下多条），**不得用 alias 伪装成不同服务** |
| `parameters.<p>.status` | `supported` / `unsupported` / `locked` / `hidden` |
| unsupported 参数 | 必须加 `"onUserInput": "warn"` 和 `"reason": "xxx"` |
| `mapTo` | 所有 supported/locked 参数必须有，映射到 Adapter 实际请求字段名 |
| `lockedValue` 或 `source` | locked 参数必须填写至少一个 |

### 启动审计
启动时自动运行 `ConfigConsistencyChecker`，检查：
- L1：旧配置文件是否残留 → 直接报错
- L2a：服务 key 是否重复 / alias 是否冲突
- L2b：voiceCode 映射是否正确
- L2c：locked 参数是否有值来源
- L2d：mapTo 路径是否完整
- L3：defaultVoiceId 是否在音色库中存在 / 每个服务是否有音色

`CONFIG_MODE=strict`（默认）：任一级别发现 error → 启动失败
`CONFIG_MODE=migration`：仅 warn，不阻止启动

### ParameterMapper 降级策略
`CONFIG_MODE=strict`（默认）：映射失败 → **直接抛错**，不降级透传
`CONFIG_MODE=migration` / `TTS_STRICT_MAPPER=false`：映射失败 → 强 WARNING + 原样透传

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