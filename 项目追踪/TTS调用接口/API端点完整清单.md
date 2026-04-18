# API_ENDPOINTS_INDEX

version: 2
updated_at: 2026-04-14
audience: AI_AGENT_FIRST
scope: ALL_TTS_API_ENDPOINTS

## PURPOSE
- 列出所有TTS相关API端点及其调用链锚点
- 区分"服务调用类"与"音色/音频数据类"
- 为AI快速定位问题归属提供索引

## ROUTE_FILES_LOCATION
- ttsRoutes.js: apps/api/routes/ttsRoutes.js (合并版 v3.0)
- voiceManageRoutes.js: src/modules/tts/routes/voiceManageRoutes.js
- audioRoutes.js: apps/api/routes/audioRoutes.js

## DELETED_ROUTE_FILES
- ttsRoutes.v2.js (已合并)
- index.v2.js (未使用的备用入口)

---

## 一、服务调用类（核心业务）

### 1.1 语音合成接口

| 端点 | 方法 | 认证 | 调用链锚点 | 功能 |
|------|------|------|-----------|------|
| `/api/tts/synthesize` | POST | ✅ | apps/api/routes/ttsRoutes.js:44 | 统一TTS合成入口 |
| `/api/tts` | POST | ✅ | apps/api/routes/ttsRoutes.js:60 | Legacy兼容端点 |
| `/api/tts/batch` | POST | ✅ | apps/api/routes/ttsRoutes.js:76 | 批量合成（最多10条） |

**完整调用链路 (v3.0)：**
```
POST /api/tts/synthesize
  │
  ├─► 中间件链: unifiedAuth → securityLogger → validateTtsParams → createUnifiedTtsMiddleware
  │
  ├─► TtsHttpAdapter.synthesize(req, res)
  │     anchor: src/modules/tts/adapters/http/TtsHttpAdapter.js:32
  │     └─► SynthesisRequest.fromJSON(req.body)
  │
  ├─► TtsSynthesisService.synthesize(request)
  │     anchor: src/modules/tts/domain/TtsSynthesisService.js:106
  │     │
  │     ├─► _validateRequest()
  │     │     ├─► SynthesisRequest.validate()
  │     │     └─► TtsValidationService.validateText()
  │     │
  │     ├─► _resolveServiceIdentifier()
  │     │     └─► parse service string -> provider + serviceType
  │     │         OR lookup by systemId in voiceCatalog
  │     │
  │     ├─► _checkRateLimit() → per-service 100 req/min
  │     │
  │     ├─► circuitBreaker.execute(() => _synthesizeWithRetry())
  │     │     anchor: src/modules/tts/domain/TtsSynthesisService.js:122
  │     │     │
  │     │     ├─► timeout: 60s (env: TTS_SYNTH_TIMEOUT_MS)
  │     │     │
  │     │     └─► retry: 1 attempt, backoff 120ms*attempt
  │     │           retryable: API_ERROR, PROVIDER_ERROR, TIMEOUT_ERROR, network
  │     │           │
  │     │           └─► ttsProvider.synthesize(provider, serviceType, text, options)
  │     │                 anchor: src/modules/tts/adapters/TtsProviderAdapter.js:27
  │     │                 │
  │     │                 └─► adapter.synthesizeAndSave(text, runtimeOptions)
  │     │                       anchor: src/modules/tts/adapters/providers/BaseTtsAdapter.js:73
  │     │                       │
  │     │                       ├─► _getCredentials() → pool select + health check
  │     │                       ├─► call external provider API
  │     │                       ├─► _reportSuccess/Failure() → health tracking
  │     │                       └─► audioStorageManager.saveAudioFile()
  │     │
  │     └─► AudioResult.fromServiceResult() → DTO
  │
  └─► HTTP response: standardized JSON
```

**请求契约：**
```json
{
  "text": "要合成的文本内容",
  "service": "moss_tts",
  "voice": "moss-tts-ashui",
  "speed": 1.0,
  "pitch": 1.0,
  "volume": 5
}
```

**voice ID 转译规则（重要）：**
```
前端传入: voice = "moss-tts-ashui"  (系统音色ID)
         或 voice = "ashui"         (短名称)
         或 voice = "2001257729754140672" (直接使用服务商ID)

VoiceResolver 转译:
  1. voiceRegistry.get("moss-tts-ashui") -> 原始音色数据
  2. 提取 runtime.voiceId = "2001257729754140672" (服务商真实ID)
  3. runtime.voiceId 优先级最高，不被用户参数覆盖
  4. 传递给 Provider adapter 的 voice = runtime.voiceId

服务商收到: voice_id = "2001257729754140672" (正确)
```

---

### 1.2 服务商快捷路由

| 端点 | 方法 | 认证 | 功能 |
|------|------|------|------|
| `/api/tts/aliyun/cosyvoice` | POST | ✅ | 阿里云CosyVoice快捷调用 |
| `/api/tts/aliyun/qwen` | POST | ✅ | 阿里云Qwen快捷调用 |
| `/api/tts/tencent` | POST | ✅ | 腾讯云快捷调用 |
| `/api/tts/volcengine/http` | POST | ✅ | 火山引擎HTTP快捷调用 |
| `/api/tts/volcengine/websocket` | POST | ✅ | 火山引擎WS快捷调用 |
| `/api/tts/minimax` | POST | ✅ | MiniMax快捷调用 |
| `/api/tts/moss` | POST | ✅ | MOSS-TTS快捷调用 |

---

## 二、音色查询类（数据读取）

### 2.1 音色列表与详情

| 端点 | 方法 | 认证 | 调用链锚点 | 功能 |
|------|------|------|-----------|------|
| `/api/tts/voices` | GET | ❌ | apps/api/routes/ttsRoutes.js:99 | 音色列表（按服务商分组） |
| `/api/tts/voices/:id` | GET | ❌ | apps/api/routes/ttsRoutes.js:115 | 单个音色详情 |
| `/api/tts/voices/:id/detail` | GET | ❌ | apps/api/routes/ttsRoutes.js:127 | 音色完整详情（含runtime） |
| `/api/tts/catalog` | GET | ❌ | apps/api/routes/ttsRoutes.js:175 | 前端完整目录 |
| `/api/tts/frontend` | GET | ❌ | apps/api/routes/ttsRoutes.js:187 | 前端精简数据（7字段） |
| `/api/tts/filters` | GET | ❌ | apps/api/routes/ttsRoutes.js:165 | 筛选选项列表 |

### 2.2 服务商与能力查询

| 端点 | 方法 | 认证 | 调用链锚点 | 功能 |
|------|------|------|-----------|------|
| `/api/tts/providers` | GET | ✅ | apps/api/routes/ttsRoutes.js:139 | 服务商列表+配置状态 |
| `/api/tts/capabilities/:service` | GET | ❌ | apps/api/routes/ttsRoutes.js:153 | 服务能力配置 |

---

## 三、运维管理类

| 端点 | 方法 | 认证 | 功能 |
|------|------|------|------|
| `/api/tts/health` | GET | ✅ | TTS模块健康检查（含熔断器状态） |
| `/api/tts/stats` | GET | ✅ | 统计信息（请求量/成功率/延迟/熔断器） |
| `/api/tts/reset-stats` | POST | ✅ | 重置统计信息+熔断器 |
| `/api/tts/clear-cache` | POST | ✅ | 清理音频缓存 |

---

## 四、音色管理类（后台配置，需admin权限）

### 4.1 管理端路由（挂载于 /api/voices）

| 端点 | 方法 | 调用链锚点 | 功能 |
|------|------|-----------|------|
| `/api/voices` | GET | src/modules/tts/routes/voiceManageRoutes.js:31 | 管理端音色列表 |
| `/api/voices/:id` | GET | src/modules/tts/routes/voiceManageRoutes.js:63 | 精确查询 |
| `/api/voices/stats/overview` | GET | src/modules/tts/routes/voiceManageRoutes.js:77 | 统计概览 |
| `/api/voices/providers/status` | GET | src/modules/tts/routes/voiceManageRoutes.js:86 | 服务商启用状态 |
| `/api/voices` | POST | src/modules/tts/routes/voiceManageRoutes.js:107 | 添加音色 |
| `/api/voices/batch` | POST | src/modules/tts/routes/voiceManageRoutes.js:137 | 批量添加 |
| `/api/voices/:id` | PUT | src/modules/tts/routes/voiceManageRoutes.js:159 | 更新音色 |
| `/api/voices/:id` | DELETE | src/modules/tts/routes/voiceManageRoutes.js:181 | 删除音色 |
| `/api/voices/save` | POST | src/modules/tts/routes/voiceManageRoutes.js:196 | 保存到文件/Redis |
| `/api/voices/reload` | POST | src/modules/tts/routes/voiceManageRoutes.js:213 | 重新加载配置 |

---

## 五、音频存储类

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/audio/stats` | GET | 存储统计 |
| `/api/audio/cleanup` | POST | 清理过期文件 |
| `/api/audio/exists/:filename` | GET | 检查文件存在 |
| `/api/audio/info/:filename` | GET | 文件信息 |
| `/api/audio/:filename` | DELETE | 删除音频 |

---

## 六、全局端点

| 端点 | 方法 | 认证 | 功能 |
|------|------|------|------|
| `/health` | GET | ❌ | 全局健康检查 |
| `/api/public/info` | GET | ❌ | 公开服务信息 |

---

## 七、认证边界

| 端点类别 | 认证 | 说明 |
|---------|------|------|
| 合成接口 | ✅ | 业务接口需认证 |
| 音色查询 | ❌ | 公开接口 |
| 服务商查询 | ✅ | 含配置状态信息 |
| 运维管理 | ✅ | 统计/重置/清理 |
| 音色管理 | ✅ admin.access | 后台配置 |
| 健康检查 | ❌ | 监控接口 |

---

## FAILURE_TRIAGE_BY_ENDPOINT

| 错误现象 | 首查端点归属 | 首查锚点 |
|---------|-------------|---------|
| HTTP 404 from provider | POST /api/tts/synthesize | MossTtsAdapter._callApi - voice_id wrong |
| CONFIG_ERROR | POST /api/tts/synthesize | credentials.isConfigured() failed |
| KEY_NOT_FOUND | 所有认证端点 | apiKeyMiddleware - API_KEYS not loaded |
| 音色找不到 | GET /api/tts/voices | VoiceCatalog.query |
| 服务商未配置 | GET /api/tts/providers | credentials.isConfigured |

---

## QUICK_REFERENCE

```bash
# 合成测试
curl -X POST -H "X-API-Key: key1" \
  -H "Content-Type: application/json" \
  -d '{"text":"你好测试","service":"moss_tts","voice":"moss-tts-ashui"}' \
  http://localhost:6678/api/tts/synthesize

# 快捷调用
curl -X POST -H "X-API-Key: key1" \
  -H "Content-Type: application/json" \
  -d '{"text":"你好测试"}' \
  http://localhost:6678/api/tts/moss

# 音色列表
curl http://localhost:6678/api/tts/voices

# 前端精简数据
curl http://localhost:6678/api/tts/frontend

# 服务商状态
curl http://localhost:6678/api/tts/providers

# 健康检查
curl http://localhost:6678/health
```
