# API_ENDPOINTS_INDEX

version: 1
updated_at: 2026-04-02
audience: AI_AGENT_FIRST
scope: ALL_TTS_API_ENDPOINTS

## PURPOSE
- 列出所有TTS相关API端点及其调用链锚点
- 区分"服务调用类"与"音色/音频数据类"
- 为AI快速定位问题归属提供索引

## ROUTE_FILES_LOCATION
- ttsRoutes.js: apps/api/routes/ttsRoutes.js
- voiceManageRoutes.js: src/modules/tts/routes/voiceManageRoutes.js
- audioRoutes.js: apps/api/routes/audioRoutes.js
- ttsRoutes.v2.js: apps/api/routes/ttsRoutes.v2.js (未激活)

---

## 一、服务调用类（核心业务）

### 1.1 语音合成接口

| 端点 | 方法 | 调用链锚点 | 功能 |
|------|------|-----------|------|
| `/api/tts/synthesize` | POST | apps/api/routes/ttsRoutes.js:21 | 统一TTS合成入口 |
| `/api/tts` | POST | apps/api/routes/ttsRoutes.js:32 | Legacy兼容端点 |

**完整调用链路：**
```
POST /api/tts/synthesize
  │
  ├─► TtsSynthesisService.synthesize(req.body)
  │     anchor: src/modules/tts/application/TtsSynthesisService.js:37
  │
  ├─► VoiceResolver.normalizeRequest()
  │     anchor: src/modules/tts/application/VoiceResolver.js:33
  │
  ├─► VoiceResolver.validateText()
  │     anchor: src/modules/tts/application/VoiceResolver.js:156
  │
  ├─► VoiceResolver.resolve()
  │     anchor: src/modules/tts/application/VoiceResolver.js:59
  │     ├─► ProviderCatalog.resolveCanonicalKey()
  │     │     anchor: src/modules/tts/catalog/ProviderCatalog.js:52
  │     ├─► VoiceCatalog.getRuntime()
  │     │     anchor: src/modules/tts/catalog/VoiceCatalog.js:89
  │     └─► ttsDefaults.getDefaultVoiceId()
  │           anchor: src/modules/tts/config/ttsDefaults.js:31
  │
  ├─► credentials.isConfigured(providerKey)
  │     anchor: src/modules/credentials/core/CredentialsRegistry.js:319
  │
  ├─► createProvider(adapterKey)
  │     anchor: src/modules/tts/adapters/providers/index.js
  │     └─► 具体适配器实例化
  │           - AliyunQwenAdapter
  │           - AliyunCosyVoiceAdapter
  │           - TencentTtsAdapter
  │           - VolcengineTtsAdapter
  │           - MinimaxTtsAdapter
  │           - MossTtsAdapter
  │
  ├─► adapter.synthesizeAndSave(text, runtimeOptions)
  │     anchor: src/modules/tts/adapters/providers/BaseTtsAdapter.js:65
  │     ├─► _getCredentials() → credentials.selectCredentials()
  │     │     anchor: src/modules/credentials/core/CredentialsRegistry.js:450
  │     ├─► 调用外部服务商API (HTTP/WebSocket)
  │     ├─► audioStorageManager.save()
  │     │     anchor: src/shared/utils/audioStorage.js
  │     └─► reportSuccess/Failure() → health feedback
  │           anchor: src/modules/credentials/core/CredentialsRegistry.js:474
  │
  └─► buildSynthesisSuccessResponse()
        anchor: src/modules/tts/catalog/dto/synthesisResultDto.js
```

**请求契约：**
```json
{
  "text": "要合成的文本内容",           // 必填
  "service": "aliyun_cosyvoice",        // 可选，服务标识
  "voice": "longxiaochun_v2",           // 可选，音色ID
  "voiceId": "longxiaochun_v2",         // 可选，voice别名
  "options": {                          // 可选，合成参数
    "speed": 1.0,
    "pitch": 1.0,
    "volume": 50,
    "format": "mp3"
  }
}
```

**响应契约：**
```json
{
  "success": true,
  "audioUrl": "http://...",
  "format": "mp3",
  "size": 12345,
  "isRemote": false,
  "provider": "aliyun_cosyvoice",
  "voice": "longxiaochun_v2",
  "metadata": { ... }
}
```

---

## 二、音色查询类（数据读取，无副作用）

### 2.1 音色列表与详情

| 端点 | 方法 | 调用链锚点 | 功能 |
|------|------|-----------|------|
| `/api/tts/voices` | GET | apps/api/routes/ttsRoutes.js:45 | 音色列表（支持筛选） |
| `/api/tts/voices/:id` | GET | apps/api/routes/ttsRoutes.js:58 | 单个音色详情 |
| `/api/tts/catalog` | GET | apps/api/routes/ttsRoutes.js:105 | 前端完整目录 |
| `/api/tts/frontend` | GET | apps/api/routes/ttsRoutes.js:111 | 前端精简数据（7字段） |
| `/api/tts/filters` | GET | apps/api/routes/ttsRoutes.js:101 | 筛选选项列表 |

**TtsQueryService 调用链：**
```
GET /api/tts/voices
  │
  └─► TtsQueryService.queryVoices(filters)
        anchor: src/modules/tts/application/TtsQueryService.js:13
        │
        ├─► VoiceCatalog.query(filters)
        │     anchor: src/modules/tts/catalog/VoiceCatalog.js:45
        │     数据源: voices/dist/voices.json (构建产物)
        │
        ├─► _filterVisibleVoices()
        │     anchor: src/modules/tts/application/TtsQueryService.js:38
        │     └─► voiceRegistry.isProviderEnabled()
        │           anchor: src/modules/tts/core/VoiceRegistry.js:215
        │
        └─► _buildFiltersMeta() / _buildCounts()
              anchor: src/modules/tts/application/TtsQueryService.js:52
```

### 2.2 服务商与能力查询

| 端点 | 方法 | 调用链锚点 | 功能 |
|------|------|-----------|------|
| `/api/tts/providers` | GET | apps/api/routes/ttsRoutes.js:70 | 服务商列表+配置状态 |
| `/api/tts/capabilities/:service` | GET | apps/api/routes/ttsRoutes.js:79 | 服务能力配置 |
| `/api/tts/stats` | GET | apps/api/routes/ttsRoutes.js:96 | 音色统计信息 |

**服务商查询调用链：**
```
GET /api/tts/providers
  │
  └─► TtsQueryService.getProviders()
        anchor: src/modules/tts/application/TtsQueryService.js:105
        │
        ├─► ProviderCatalog.getAll()
        │     anchor: src/modules/tts/catalog/ProviderCatalog.js:63
        │
        └─► credentials.isConfigured(provider)
              anchor: src/modules/credentials/core/CredentialsRegistry.js:319
```

---

## 三、音色管理类（配置增删改，需认证）

### 3.1 管理端路由（挂载于 /api/voices）

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

**VoiceRegistry 调用链：**
```
GET /api/voices
  │
  └─► voiceRegistry.getAll()
        anchor: src/modules/tts/core/VoiceRegistry.js:85

POST /api/voices
  │
  └─► voiceRegistry.add(voice)
        anchor: src/modules/tts/core/VoiceRegistry.js:93
        │
        ├─► this.voices.set(id, voice)     // 内存索引
        ├─► _updateIndexes(voice)          // 更新索引
        │     anchor: src/modules/tts/core/VoiceRegistry.js:229
        └─► (可选) _saveToRedis()          // Redis持久化
              anchor: src/modules/tts/core/VoiceRegistry.js:276
```

**认证要求：**
```javascript
// voiceManageRoutes.js 第21行
router.use(unifiedAuth.createMiddleware({
  required: true,
  permissions: ['admin.access'],
  rateLimitTier: 'admin'
}));
```

---

## 四、音频存储管理类

### 4.1 文件管理路由（挂载于 /api/audio）

| 端点 | 方法 | 调用链锚点 | 功能 |
|------|------|-----------|------|
| `/api/audio/stats` | GET | apps/api/routes/audioRoutes.js:22 | 存储统计 |
| `/api/audio/cleanup` | POST | apps/api/routes/audioRoutes.js:45 | 清理过期文件 |
| `/api/audio/exists/:filename` | GET | apps/api/routes/audioRoutes.js:68 | 检查文件存在 |
| `/api/audio/info/:filename` | GET | apps/api/routes/audioRoutes.js:91 | 文件信息 |
| `/api/audio/:filename` | DELETE | apps/api/routes/audioRoutes.js:119 | 删除音频 |
| `/api/audio/generate-filename` | POST | apps/api/routes/audioRoutes.js:146 | 生成安全文件名 |
| `/api/audio/config` | GET | apps/api/routes/audioRoutes.js:171 | 存储配置 |

**audioStorageManager 调用链：**
```
GET /api/audio/stats
  │
  └─► audioStorageManager.getStorageStats()
        anchor: src/shared/utils/audioStorage.js
```

---

## 五、健康检查类

| 端点 | 方法 | 调用链锚点 | 功能 |
|------|------|-----------|------|
| `/health` | GET | apps/api/index.js:49 | 全局健康检查 |
| `/api/tts/health` | GET | apps/api/routes/ttsRoutes.js:88 | TTS模块健康检查 |
| `/api/public/info` | GET | apps/api/index.js:57 | 公开服务信息 |

---

## 六、关键模块区分

### 6.1 三个"音色"概念的区别

| 模块 | 文件位置 | 数据性质 | 用途 |
|------|---------|---------|------|
| **VoiceCatalog** | `src/modules/tts/catalog/VoiceCatalog.js` | 静态（构建产物 voices/dist/voices.json） | 前端查询、合成时音色映射 |
| **VoiceRegistry** | `src/modules/tts/core/VoiceRegistry.js` | 动态（内存+Redis/文件持久化） | 后台管理、服务商启用状态控制 |
| **ProviderCatalog** | `src/modules/tts/catalog/ProviderCatalog.js` | 静态（代码内定义） | 服务商元信息、canonical key解析、aliases映射 |

### 6.2 路由挂载点区分

| 路由前缀 | 数据源 | 认证要求 | 用途 |
|---------|--------|---------|------|
| `/api/tts/voices` | VoiceCatalog（静态） | ❌ 无需认证 | 前端展示查询 |
| `/api/voices` | VoiceRegistry（动态） | ✅ 需要 admin.access | 后台配置管理 |

---

## 七、v2备用架构（未激活）

### 7.1 入口文件对比

| 文件 | 启动命令 | 实际使用路由 | 状态 |
|------|---------|-------------|------|
| `apps/api/index.js` | `npm start` | ttsRoutes.js | ✅ 当前生产 |
| `apps/api/index.v2.js` | `npm run start:v2` | ttsRoutes.js（非v2！） | ⚠️ 备用 |

### 7.2 未激活的v2路由特性

`ttsRoutes.v2.js` 包含以下未激活功能：
- 批量合成接口 `/api/tts/batch`
- 服务快捷路由 `/api/tts/aliyun/cosyvoice`、`/api/tts/tencent` 等
- 缓存清理 `/api/tts/clear-cache`
- 统计重置 `/api/tts/reset-stats`
- HttpAdapter模式（通过ServiceContainer）

**注意**：`index.v2.js` 第86行仍然引用 `ttsRoutes.js`，而非 `ttsRoutes.v2.js`。

---

## 八、认证边界说明

| 端点类别 | 认证要求 | 说明 |
|---------|---------|------|
| 合成接口 `/api/tts/synthesize` | ✅ 需要 X-API-Key | 业务接口需认证 |
| 查询接口 `/api/tts/voices` | ❌ 无需认证 | 公开接口，适合CDN缓存 |
| 前端接口 `/api/tts/frontend` | ❌ 无需认证 | 公开接口 |
| 管理接口 `/api/voices` | ✅ 需要 admin.access | 配置管理需权限 |
| 音频管理 `/api/audio` | ✅ 需要 audio.access | 文件操作需认证 |
| 健康检查 `/health` | ❌ 无需认证 | 监控接口公开 |

---

## FAILURE_TRIAGE_BY_ENDPOINT

| 错误现象 | 首查端点归属 | 首查锚点 |
|---------|-------------|---------|
| 合成失败 | POST /api/tts/synthesize | TtsSynthesisService.synthesize |
| 音色找不到 | GET /api/tts/voices | VoiceCatalog.query |
| 服务商未配置 | GET /api/tts/providers | credentials.isConfigured |
| 音色配置保存失败 | POST /api/voices/save | voiceRegistry.save |
| 音频文件丢失 | GET /api/audio/exists | audioStorageManager.fileExists |

---

## QUICK_REFERENCE

```bash
# 合成测试
curl -X POST -H "X-API-Key: key2" \
  -H "Content-Type: application/json" \
  -d '{"text":"测试","service":"aliyun_cosyvoice"}' \
  http://localhost:3000/api/tts/synthesize

# 音色列表
curl http://localhost:3000/api/tts/voices

# 前端精简数据
curl http://localhost:3000/api/tts/frontend

# 服务商状态
curl http://localhost:3000/api/tts/providers

# 健康检查
curl http://localhost:3000/health
```