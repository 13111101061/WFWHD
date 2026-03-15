# TTS 音色 DTO 文档

## 概述

音色数据采用 **Profile/Runtime 分层架构**，将展示信息与运行时配置分离：

| 层级 | 用途 | 暴露接口 |
|------|------|----------|
| **Profile 层** | 展示信息（面向用户） | 列表页、卡片展示 |
| **Runtime 层** | 运行时配置（面向执行） | 合成接口、详情页 |

---

## DTO 类型

### 1. Display DTO（展示用）

**用途**：列表页、搜索结果、卡片展示

**特点**：
- 仅包含 `profile` 层字段
- **不暴露** `runtime` 配置（安全考量）
- **不暴露** `_raw` 原始数据

**字段定义**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 全局唯一ID，格式：`${provider}-${service}-${voiceId}` |
| `provider` | string | ✅ | 服务商标识（aliyun/tencent/volcengine/minimax/moss） |
| `service` | string | ✅ | 服务标识（qwen_http/cosyvoice/tts/http/ws/tts） |
| `displayName` | string | ✅ | 展示名称（中文，面向用户） |
| `name` | string | ✅ | 音色名称（英文标识） |
| `gender` | string | ❌ | 性别：`female` / `male` |
| `languages` | string[] | ✅ | 支持语言列表，默认 `["zh-CN"]` |
| `description` | string | ❌ | 音色描述 |
| `tags` | string[] | ❌ | 标签列表（如：温柔、知性、活泼） |
| `preview` | string | ❌ | 预览音频URL |
| `status` | string | ✅ | 状态：`active` / `inactive` / `deprecated` |

**示例**：

```json
{
  "id": "aliyun-qwen_http-cherry",
  "provider": "aliyun",
  "service": "qwen_http",
  "displayName": "樱桃",
  "name": "Cherry",
  "gender": "female",
  "languages": ["zh-CN", "en-US"],
  "description": "温柔甜美的女声",
  "tags": ["温柔", "甜美", "自然"],
  "preview": "https://example.com/preview/cherry.mp3",
  "status": "active"
}
```

**获取接口**：

```
GET /api/tts/voices                    # 返回 Display DTO 列表
GET /api/tts/voices?provider=aliyun    # 按服务商过滤
GET /api/tts/voices?gender=female      # 按性别过滤
```

---

### 2. Detail DTO（详情用）

**用途**：详情页、管理接口、调试场景

**特点**：
- 包含 `profile` 和 `runtime` 完整分层
- 包含 `metadata` 元数据
- 包含时间戳字段

**字段定义**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `profile` | Object | 展示信息（同 Display DTO 字段） |
| `runtime` | Object | 运行时配置 |
| `metadata` | Object | 元数据（扩展字段） |
| `createdAt` | string \| null | 创建时间（ISO 8601） |
| `updatedAt` | string \| null | 更新时间（ISO 8601） |

**runtime 字段定义**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `voice` | string | 实际传给 TTS API 的音色标识 |
| `model` | string | 模型标识（如 qwen3-tts-flash） |
| `sampleRate` | number | 采样率（如 24000） |
| `cluster` | string | 集群标识（部分服务商需要） |
| `voiceType` | string | 音色类型（部分服务商需要） |

**示例**：

```json
{
  "profile": {
    "id": "aliyun-qwen_http-cherry",
    "provider": "aliyun",
    "service": "qwen_http",
    "displayName": "樱桃",
    "name": "Cherry",
    "gender": "female",
    "languages": ["zh-CN", "en-US"],
    "description": "温柔甜美的女声",
    "tags": ["温柔", "甜美", "自然"],
    "preview": "https://example.com/preview/cherry.mp3",
    "status": "active"
  },
  "runtime": {
    "voice": "Cherry",
    "model": "qwen3-tts-flash",
    "sampleRate": 24000
  },
  "metadata": {
    "registeredAt": "2024-01-15T00:00:00Z",
    "source": "qwen-official"
  },
  "createdAt": "2024-01-15T00:00:00Z",
  "updatedAt": "2024-06-01T00:00:00Z"
}
```

**获取接口**：

```
GET /api/tts/voices/:id    # 返回 Detail DTO
```

---

## API 接口对照

### 查询接口

| 接口 | 返回类型 | 说明 |
|------|----------|------|
| `GET /api/tts/voices` | Display DTO[] | 音色列表 |
| `GET /api/tts/voices?provider=aliyun&gender=female` | Display DTO[] | 带过滤条件的列表 |
| `GET /api/tts/voices/:id` | Detail DTO | 单个音色详情 |

### 过滤参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `provider` | string | 服务商过滤（aliyun/tencent/volcengine/minimax/moss） |
| `service` | string | 服务过滤（qwen_http/cosyvoice/tts/http/ws/tts） |
| `gender` | string | 性别过滤（female/male） |
| `tags` | string | 标签过滤，逗号分隔（如：温柔,自然） |
| `language` | string | 语言过滤（zh-CN/en-US） |

### 响应格式

**列表响应**：

```json
{
  "success": true,
  "data": {
    "items": [/* Display DTO 数组 */],
    "filters": {
      "providers": ["aliyun", "tencent", "volcengine", "minimax", "moss"],
      "services": ["qwen_http", "cosyvoice", "tts", "http", "ws", "tts"],
      "genders": ["female", "male"],
      "languages": ["zh-CN", "en-US"],
      "tags": ["温柔", "知性", "活泼", "磁性", "甜美"]
    },
    "counts": {
      "total": 72,
      "byProvider": { "aliyun": 28, "tencent": 12, "volcengine": 15, "minimax": 10, "moss": 7 },
      "byService": { "qwen_http": 18, "cosyvoice": 10, "tts": 12, "http": 15, "tts": 17 },
      "byGender": { "female": 45, "male": 27 }
    }
  },
  "timestamp": "2026-03-15T10:00:00.000Z"
}
```

**详情响应**：

```json
{
  "success": true,
  "data": { /* Detail DTO */ },
  "timestamp": "2026-03-15T10:00:00.000Z"
}
```

**404 响应**：

```json
{
  "success": false,
  "error": "Voice not found: xxx",
  "timestamp": "2026-03-15T10:00:00.000Z"
}
```

---

## 内部转换函数

VoiceCatalog 模块提供三个核心转换函数：

### toCatalogVoice(rawVoice)

将 Registry 原始数据转换为内部目录对象（profile + runtime 分离）。

```javascript
const catalogVoice = toCatalogVoice(rawVoice);
// {
//   profile: { id, provider, service, displayName, ... },
//   runtime: { voice, model, sampleRate, ... },
//   _raw: { ttsConfig, metadata }
// }
```

### toDisplayDto(catalogVoice)

将目录对象转换为展示用 DTO（隐藏 runtime）。

```javascript
const displayDto = toDisplayDto(catalogVoice);
// { id, provider, service, displayName, name, gender, languages, ... }
```

### toDetailDto(catalogVoice)

将目录对象转换为详情 DTO（包含完整分层）。

```javascript
const detailDto = toDetailDto(catalogVoice);
// { profile: {...}, runtime: {...}, metadata: {...}, createdAt, updatedAt }
```

---

## 设计原则

### 1. 关注点分离

| 场景 | 使用 DTO | 原因 |
|------|----------|------|
| 前端列表页 | Display DTO | 无需 runtime，减少数据传输 |
| 前端详情页 | Detail DTO | 需要完整信息展示 |
| TTS 合成 | runtime 字段 | 执行层需要实际配置 |
| 管理/调试 | Detail DTO | 完整信息便于排查 |

### 2. 安全性

- Display DTO 不暴露 `runtime` 配置，避免敏感信息泄露
- `_raw` 字段仅在内部使用，不对外暴露

### 3. 向后兼容

- `runtime` 字段优先从 `rawVoice.runtime` 读取
- 回退兼容旧的 `ttsConfig` 结构

```javascript
// 优先级: runtime > ttsConfig
const voice = rawVoice.runtime?.voice ||
              rawVoice.ttsConfig?.voiceId ||
              rawVoice.sourceId;
```

---

## 使用示例

### 前端列表页

```javascript
// 获取女性音色列表
const response = await fetch('/api/tts/voices?gender=female');
const { data } = await response.json();

// data.items 是 Display DTO 数组
data.items.forEach(voice => {
  console.log(voice.displayName, voice.tags);
});
```

### 前端详情页

```javascript
// 获取音色详情
const response = await fetch('/api/tts/voices/aliyun-qwen_http-cherry');
const { data } = await response.json();

// data 是 Detail DTO
console.log(data.profile.displayName);  // 展示信息
console.log(data.runtime.voice);        // 运行时配置
console.log(data.createdAt);            // 创建时间
```

### 合成接口调用

```javascript
// 使用音色ID调用合成
const response = await fetch('/api/tts/synthesize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: '你好，这是测试',
    service: 'aliyun_qwen_http',
    voiceId: 'aliyun-qwen_http-cherry'  // 使用系统ID
  })
});
```

---

## 相关文档

- [VOICE_API.md](./VOICE_API.md) - 完整 API 文档
- [音色库快速参考指南](./音色库快速参考指南.md)
- [TTS 模块架构](./architecture/TTS_MODULE_ARCHITECTURE.md)