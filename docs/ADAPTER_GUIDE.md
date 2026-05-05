# TTS 服务商适配指南

面向需要在 TTS 微服务中接入新服务商的开发者。

---

## 一、接入流程概览

新增一个服务商 = **改 4 个文件**，无需碰任何旧 JSON。

```
1. Adapter  (src/modules/tts/adapters/providers/XxxTtsAdapter.js)
   -> 实现 synthesize()，调用外部 API，返回 Buffer

2. Manifest (src/modules/tts/providers/manifests/<provider>/manifest.json)
   -> 声明参数能力、默认值、映射规则、锁定参数

3. Register (src/modules/tts/adapters/providers/index.js)
   -> 注册 Adapter 类

4. Voices   (src/data/voices.json 或 voice-manager)
   -> 添加音色数据，让前端能选择
```

**不需要改（已删除）：**
- service-field-overrides.json
- provider-field-mappings.json
- ProviderConfig.json
- CapabilitySchema.js 中的 services 硬编码

---

## Step 1: 写 Adapter

文件：`src/modules/tts/adapters/providers/<PascalName>TtsAdapter.js`

### 必须实现的方法

| 方法 | 返回值 | 说明 |
|---|---|---|
| synthesize(text, providerParams) | { audio: Buffer, format: string } | **唯一必须实现** |
| getFallbackVoices() | Array | 可选，兜底音色 |
| getStatus() | Object | 可选，健康检查 |

### 模板

```javascript
const BaseTtsAdapter = require('./BaseTtsAdapter');

class ExampleTtsAdapter extends BaseTtsAdapter {
  constructor(config = {}) {
    super({ provider: 'example', serviceType: 'tts', ...config });
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint || 'https://api.example.com/tts';
  }

  async synthesize(text, providerParams) {
    // 1. 校验文本
    this.validateText(text);

    // 2. 取凭证（支持多账号池化）
    const creds = this._getCredentials();
    const apiKey = creds?.apiKey || this.apiKey;
    if (!apiKey) {
      throw this._error('CONFIG_ERROR', 'Example API Key not configured');
    }

    // 3. 调用外部 API
    // providerParams 里的字段名 = manifest 中 mapTo 的目标名
    const body = {
      text,
      voice_id: providerParams.voice_id,
      format: providerParams.format || 'mp3',
      sample_rate: providerParams.sample_rate || 24000
    };

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.text();
      throw this._error('API_ERROR', `Example API error: ${err}`);
    }

    const result = await response.json();

    // 4. 返回标准格式
    return {
      audio: Buffer.from(result.audio_base64, 'base64'),
      format: result.format || 'mp3',
      duration: result.duration_sec,
      usage: result.usage
    };
  }

  getFallbackVoices() {
    return [
      { id: 'default', name: 'Default Voice', gender: 'female', language: 'zh-CN' }
    ];
  }
}

module.exports = ExampleTtsAdapter;
```

### 重要：Adapter 不再处理参数映射

你的 `synthesize(text, providerParams)` 接收到的 `providerParams` 已经是 **映射后的服务商参数**：

```
用户请求 { speed: 1.5, format: 'wav' }
    | ParameterMapper (按 manifest.mapTo)
providerParams { sample_rate: 24000, format: 'wav' }
    | 传入 Adapter.synthesize()
```

Adapter 里看到的字段名 = manifest 里的 `mapTo` 值（如 `voice_id`、`sample_rate`）。

---

## Step 2: 写 Manifest

文件：`src/modules/tts/providers/manifests/<provider>/manifest.json`

### 规范示例

```json
{
  "$schema": "ProviderManifest/v2",
  "providerKey": "example",
  "provider": {
    "displayName": "Example Cloud",
    "description": "Example TTS service",
    "status": "beta",
    "protocolTypes": ["http"],
    "credentialMode": "apiKey"
  },
  "services": {
    "example_tts": {
      "displayName": "Example TTS",
      "status": "beta",
      "aliases": ["example"],
      "protocol": "http",
      "supportsStreaming": false,
      "supportsAsync": false,
      "apiStructure": "flat",
      "capabilities": {
        "streaming": false,
        "realtime": false,
        "emotion": false,
        "speedAdjustable": true,
        "pitchAdjustable": false,
        "volumeAdjustable": true
      },
      "defaults": {
        "format": "mp3",
        "sampleRate": 24000,
        "speed": 1.0
      },
      "defaultVoiceId": "example-tts-default",
      "lockedParams": ["voice"],
      "parameters": {
        "voice": {
          "status": "locked",
          "source": "providerVoiceId",
          "mapTo": "voice_id"
        },
        "text": {
          "status": "required",
          "mapTo": "text"
        },
        "speed": {
          "status": "supported",
          "default": 1.0,
          "range": [0.5, 2.0],
          "mapTo": "speed"
        },
        "pitch": {
          "status": "unsupported",
          "reason": "Pitch not supported",
          "onUserInput": "warn"
        },
        "volume": {
          "status": "supported",
          "default": 50,
          "range": [0, 100],
          "mapTo": "volume"
        },
        "format": {
          "status": "supported",
          "default": "mp3",
          "values": ["mp3", "wav"],
          "mapTo": "format"
        },
        "sampleRate": {
          "status": "supported",
          "default": 24000,
          "values": [16000, 24000],
          "mapTo": "sample_rate"
        }
      }
    }
  },
  "voiceCode": {
    "providerCode": "006",
    "serviceKey": "tts"
  }
}
```

### 关键规则

| 规则 | 说明 | 违反后果 |
|---|---|---|
| voiceCode.serviceKey 用短后缀 | 如 `tts`、`http`，不要 `example_tts` | voiceCode 路由失败 |
| 多个接口 = 独立 service | 不要建 alias 假装成不同服务 | 审计 L2a 报错 |
| unsupported 必须有 reason + onUserInput: warn | 前端需要提示文案 | 审计 L2d 警告 |
| supported/locked 必须有 mapTo | 否则 Adapter 收不到值 | 审计 L2d 警告 |
| locked 必须有 source 或 lockedValue | 否则不知道锁什么值 | 审计 L2c 报错 |
| defaultVoiceId 必须在音色库中存在 | 前端无法默认选中 | 审计 L3 警告 |

---

## Step 3: 注册

文件：`src/modules/tts/adapters/providers/index.js`

```javascript
const ExampleTtsAdapter = require('./ExampleTtsAdapter');

const adapters = {
  // ... existing ...

  example_tts: {
    Adapter: ExampleTtsAdapter,
    provider: 'example',
    service: 'tts',
    displayName: 'Example TTS',
    description: 'Example speech synthesis',
    status: 'beta',
    aliases: ['example'],
    protocol: 'http',
    supportsStreaming: false,
    supportsAsync: false
  }
};

module.exports = {
  // ... existing ...
  ExampleTtsAdapter,
  // ...
};
```

不需要改路由。统一入口 `POST /api/tts/synthesize` 已支持所有 service。

---

## Step 4: 加音色数据

### 方式 A：直接改 voices.json（适合批量）

文件：`src/data/voices.json`

```json
{
  "identity": {
    "id": "example-tts-default",
    "voiceCode": "006000010000001",
    "sourceId": "default",
    "provider": "example",
    "service": "tts"
  },
  "profile": {
    "displayName": "Default Female",
    "alias": "Gentle Female",
    "gender": "female",
    "languages": ["Chinese"],
    "description": "Gentle natural standard female voice",
    "tags": ["gentle", "natural"],
    "status": "active",
    "preview": null
  },
  "runtime": {
    "voiceId": "example-voice-001",
    "model": "example-tts-v1"
  }
}
```

### 方式 B：交互式添加

```bash
node scripts/model-manager.js
```

### voiceCode 生成

```bash
node -e "
const { VoiceCodeGenerator } = require('./src/modules/tts/config/VoiceCodeGenerator');
console.log(VoiceCodeGenerator.generate({
  providerCode: '006',
  serviceCode: '001',
  index: 1
}));
"
```

---

## Step 5: 启动验证

```bash
npm start
```

启动时自动运行三级审计：

```
========== [CONFIG AUDIT] ==========
Mode: Strict
--- L1: Legacy file check ---
  [OK] No legacy files
--- L2a: Key uniqueness ---
  [OK] No conflicts
--- L2b: VoiceCode mappings ---
  [OK] Mappings valid
--- L2c: Locked params ---
  [OK] 0 missing values
--- L2d: mapTo paths ---
  [OK] 0 missing mappings
--- L3: Voice coverage ---
  [OK] defaultVoiceId exists
Summary: 0 error(s), 0 warning(s)
======================================
```

0 errors = 启动成功。strict 模式下有任何 error 服务直接退出。

---

## 接口契约速查

### HTTP API

| Endpoint | Description |
|---|---|
| POST /api/tts/synthesize | Unified synthesis: { text, service, options } |
| POST /api/tts/batch | Batch: { service, texts, options } |
| GET /api/tts/voices?service=xxx | Voice list |
| GET /api/tts/capabilities/:service | Capability query (for frontend controls) |
| GET /api/tts/catalog | Full frontend catalog |

### Adapter Return Contract

```javascript
{
  audio: Buffer,      // Required
  format: 'mp3',      // Required
  duration: 5.2,      // Optional
  usage: { ... }      // Optional
}
```

### Error Codes

| Code | Scenario |
|---|---|
| CONFIG_ERROR | API Key not configured |
| VALIDATION_ERROR | Invalid request parameters |
| API_ERROR | Provider API returned 4xx/5xx |
| PROVIDER_ERROR | Provider internal error |
| TIMEOUT_ERROR | Request timeout |
| RATE_LIMIT_EXCEEDED | Rate limit hit |
| PARAMETER_MAPPING_ERROR | Mapping failed (strict mode) |

Use `this._error(code, message)` in Adapter.

---

## 常见坑

### Pitfall 1: Using platform field names in Adapter

Wrong:
```javascript
const speed = providerParams.speed;
```

Correct:
```javascript
// manifest.mapTo="rate" -> providerParams.rate
const rate = providerParams.rate;
```

### Pitfall 2: Disguising different services as aliases

Wrong:
```json
"aliases": ["example_ws", "example_http"]
```

Correct:
```json
"services": {
  "example_http": { "aliases": ["example"] },
  "example_ws":   { "aliases": ["example_ws"] }
}
```

### Pitfall 3: Missing onUserInput: warn

Wrong:
```json
"pitch": { "status": "unsupported" }
```

Correct:
```json
"pitch": {
  "status": "unsupported",
  "reason": "Pitch not supported",
  "onUserInput": "warn"
}
```

### Pitfall 4: Full canonical key in voiceCode.serviceKey

Wrong:
```json
"voiceCode": { "serviceKey": "example_tts" }
```

Correct:
```json
"voiceCode": { "serviceKey": "tts" }
```

### Pitfall 5: Modifying deleted legacy JSON files

```
src/modules/tts/config/service-field-overrides.json  <- DELETED
src/modules/tts/config/provider-field-mappings.json  <- DELETED
```

All config lives in manifest.json only.

---

## Extension Points

| Need | File | Notes |
|---|---|---|
| New provider | This guide | 4 files to change |
| New voice | voices.json or model-manager | No code change |
| Change parameter capabilities | manifest.json | Edit mapTo/status/range/values |
| Add shortcut route | apps/api/routes/ttsRoutes.js | Optional |
| Change auth policy | apps/api/routes/ttsRoutes.js | Edit unifiedAuth middleware |
| Change response format | src/modules/tts/domain/AudioResult.js | Edit toJSON/toApiResponse |
| Add audit rules | src/modules/tts/config/ConfigConsistencyChecker.js | Add L1/L2/L3 checks |

---

Last updated: 2026-04-30
