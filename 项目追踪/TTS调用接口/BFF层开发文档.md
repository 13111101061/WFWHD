# WFWHD TTS 微服务 - BFF 层开发文档

> 版本：v1.0.27
> 更新日期：2026-05-13
> 服务地址：`http://localhost:6678`
> 目标读者：BFF 层（Backend-for-Frontend）开发人员

---

## 目录

1. [服务概述](#1-服务概述)
2. [快速开始](#2-快速开始)
3. [认证机制](#3-认证机制)
4. [核心 API 接口](#4-核心-api-接口)
5. [音色管理 API](#5-音色管理-api)
6. [凭证管理 API](#6-凭证管理-api)
7. [监控 API](#7-监控-api)
8. [管理员 API](#8-管理员-api)
9. [音频存储 API](#9-音频存储-api)
10. [SNPan 文件存储 API](#10-snpan-文件存储-api)
11. [数据模型](#11-数据模型)
12. [错误处理](#12-错误处理)
13. [最佳实践](#13-最佳实践)
14. [常见问题](#14-常见问题)

---

## 1. 服务概述

### 1.1 服务定位

WFWHD TTS 微服务是一个**多服务商统一语音合成平台**，支持：
- 阿里云（CosyVoice + Qwen）
- 腾讯云
- 火山引擎
- MiniMax
- MOSS-TTS（内部自研）

### 1.2 核心能力

| 能力 | 说明 |
|------|------|
| 统一合成 | 一个接口调用任意服务商 |
| 音色翻译 | 前端用友好 ID，自动转服务商真实 ID |
| 智能路由 | 自动选择健康账号，支持故障转移 |
| 批量合成 | 一次请求最多合成 10 段音频 |
| 音色管理 | 增删改查音色，支持批量操作 |
| 凭证池化 | 多账号自动切换，熔断保护 |
| 监控指标 | 实时统计 + 每日趋势 + 服务级指标 |

### 1.3 技术栈

| 项目 | 技术 |
|------|------|
| 运行时 | Node.js 20+ |
| 框架 | Express.js |
| 架构 | 六边形架构（Ports & Adapters） |
| 依赖注入 | ServiceContainer |
| 数据存储 | 文件系统 + Redis（可选） |

---

## 2. 快速开始

### 2.1 基础配置

```javascript
// BFF 层配置文件
const TTS_SERVICE = {
  baseURL: 'http://localhost:6678',
  apiKey: process.env.TTS_API_KEY, // 必填
  timeout: 30000
};
```

### 2.2 最小可用示例

```javascript
// 调用语音合成
const response = await fetch(`${TTS_SERVICE.baseURL}/api/tts/synthesize`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': TTS_SERVICE.apiKey
  },
  body: JSON.stringify({
    text: '你好，世界',
    service: 'moss_tts',
    voice: 'moss-tts-ashui'
  })
});

const result = await response.json();
// result.data.audioUrl -> "http://localhost:6678/api/audio/moss_tts_abc123.mp3"
```

### 2.3 前端音色选择流程

```
1. BFF 调用 GET /api/tts/frontend -> 获取精简音色列表
2. 前端渲染音色选择器（按服务商分组）
3. 用户选择音色 -> 获取 systemId
4. BFF 调用 POST /api/tts/synthesize -> 传入 systemId
5. 返回 audioUrl -> 前端播放
```

---

## 3. 认证机制

### 3.1 认证方式

所有业务接口使用 **API Key** 认证，通过请求头传递：

```
X-API-Key: <your-api-key>
```

### 3.2 权限级别

| 权限 | 说明 | 适用接口 |
|------|------|---------|
| 无认证 | 公开接口 | 音色列表、健康检查 |
| 业务认证 | 标准 API Key | 合成、查询、监控 |
| admin.access | 管理员权限 | 音色管理、凭证管理、管理员接口 |
| storage.access | 存储权限 | SNPan 文件存储 |

### 3.3 API Key 申请

调用管理员接口生成：

```bash
curl -X POST http://localhost:6678/api/auth/keys \
  -H "X-API-Key: <admin-key>" \
  -H "Content-Type: application/json" \
  -d '{"permission":"business","expiresIn":365}'
```

---

## 4. 核心 API 接口

### 4.1 语音合成（主接口）

**`POST /api/tts/synthesize`**

#### 请求参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| text | string | ✅ | - | 要合成的文本（支持 SSML） |
| service | string | ✅ | - | 服务标识，如 `moss_tts`、`aliyun_cosyvoice` |
| voice | string | ❌ | - | 音色 ID（systemId），如 `moss-tts-ashui` |
| voiceCode | string | ❌ | - | 15 位标准音色编码（优先于 voice） |
| systemId | string | ❌ | - | 系统音色 ID（与 voice 等价） |
| speed | number | ❌ | 1.0 | 语速（0.5-2.0） |
| pitch | number | ❌ | 1.0 | 音调（0.5-2.0） |
| volume | number | ❌ | 5 | 音量（0-10） |
| format | string | ❌ | mp3 | 输出格式（mp3/wav/ogg/flac） |
| sampleRate | number | ❌ | 22050 | 采样率（8000/16000/22050/24000/44100/48000） |
| emotion | string | ❌ | - | 情感风格 |
| style | string | ❌ | - | 语音风格 |
| textType | string | ❌ | text | 文本类型（text/ssml） |

#### 响应示例

```json
{
  "success": true,
  "message": "合成成功",
  "data": {
    "audioUrl": "http://localhost:6678/api/audio/moss_tts_abc123.mp3",
    "filename": "moss_tts_abc123.mp3",
    "format": "mp3",
    "sampleRate": 22050,
    "duration": 2.5,
    "textLength": 4,
    "service": "moss_tts",
    "voice": "moss-tts-ashui",
    "voiceCode": "001000030000000",
    "requestId": "req-abc123"
  }
}
```

#### 错误响应

```json
{
  "success": false,
  "error": "ValidationError",
  "message": "文本不能为空",
  "details": {
    "field": "text",
    "code": "EMPTY_TEXT"
  }
}
```

#### cURL 示例

```bash
curl -X POST http://localhost:6678/api/tts/synthesize \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "你好世界",
    "service": "moss_tts",
    "voice": "moss-tts-ashui",
    "speed": 1.2
  }'
```

---

### 4.2 批量合成

**`POST /api/tts/batch`**

#### 请求参数

```json
{
  "items": [
    {
      "text": "第一段文本",
      "service": "moss_tts",
      "voice": "moss-tts-ashui"
    },
    {
      "text": "第二段文本",
      "service": "moss_tts",
      "voice": "moss-tts-ali",
      "speed": 1.5
    }
  ],
  "options": {
    "parallel": true
  }
}
```

**限制**：最多 10 个 items

#### 响应示例

```json
{
  "success": true,
  "message": "批量合成完成",
  "data": {
    "results": [
      { "audioUrl": "...", "success": true, "filename": "..." },
      { "audioUrl": "...", "success": true, "filename": "..." }
    ],
    "totalDuration": 5.2
  }
}
```

---

### 4.3 服务商快捷路由

当 BFF 确定使用特定服务商时，可使用快捷路由（参数与主接口相同，无需传 service）：

| 端点 | 服务商 |
|------|--------|
| `POST /api/tts/moss` | MOSS-TTS |
| `POST /api/tts/aliyun/cosyvoice` | 阿里云 CosyVoice |
| `POST /api/tts/aliyun/qwen` | 阿里云 Qwen |
| `POST /api/tts/tencent` | 腾讯云 |
| `POST /api/tts/volcengine/http` | 火山引擎 HTTP |
| `POST /api/tts/volcengine/ws` | 火山引擎 WebSocket |
| `POST /api/tts/minimax` | MiniMax |

```bash
curl -X POST http://localhost:6678/api/tts/moss \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text":"你好","voice":"moss-tts-ashui"}'
```

---

### 4.4 音色查询

#### 4.4.1 音色列表

**`GET /api/tts/voices`**

| 参数 | 说明 |
|------|------|
| service | 按服务商筛选 |

```json
{
  "success": true,
  "data": {
    "moss": [
      { "id": "moss-tts-ashui", "name": "阿水", "gender": "male", ... },
      ...
    ],
    "aliyun": [ ... ]
  }
}
```

#### 4.4.2 单个音色详情

**`GET /api/tts/voices/:id`**

```bash
curl http://localhost:6678/api/tts/voices/moss-tts-ashui
```

#### 4.4.3 音色完整详情（含 runtime）

**`GET /api/tts/voices/:id/detail`**

返回包含 runtime.voiceId（服务商真实 ID）等内部字段。

#### 4.4.4 前端精简数据（推荐）

**`GET /api/tts/frontend`**

> **BFF 层推荐使用此接口**，返回 7 个核心字段，数据量最小。

```json
{
  "success": true,
  "data": {
    "moss": {
      "tts": {
        "displayName": "MOSS-TTS",
        "voices": [
          {
            "id": "moss-tts-ashui",
            "name": "阿水",
            "gender": "male",
            "ageGroup": "adult",
            "tags": ["对话"],
            "previewText": "你好，我是阿水",
            "description": "自然男声，适合对话场景"
          },
          ...
        ]
      }
    },
    "aliyun": { ... }
  }
}
```

#### 4.4.5 服务商列表

**`GET /api/tts/providers`**

```json
{
  "success": true,
  "data": [
    {
      "providerKey": "moss",
      "displayName": "MOSS-TTS",
      "serviceKey": "moss_tts",
      "voiceCount": 8,
      "available": true
    },
    ...
  ]
}
```

#### 4.4.6 服务能力配置

**`GET /api/tts/capabilities/:service`**

返回该服务的参数支持情况（哪些参数 supported/locked/unsupported）。

#### 4.4.7 筛选选项

**`GET /api/tts/filters`**

返回性别、年龄组、语言、风格、情感等可用的筛选选项。

#### 4.4.8 前端完整目录

**`GET /api/tts/catalog`**

返回完整的前端展示目录，包含所有服务商、服务、音色及能力信息。

---

### 4.5 运维接口

#### 健康检查

**`GET /api/tts/health`**

```json
{
  "success": true,
  "message": "健康检查通过",
  "data": {
    "status": "ok",
    "providers": {
      "moss": "ok",
      "aliyun_cosyvoice": "ok",
      ...
    },
    "circuitBreakers": { ... }
  }
}
```

#### 统计信息

**`GET /api/tts/stats`**

```json
{
  "success": true,
  "message": "统计信息",
  "data": {
    "totalRequests": 1234,
    "successRate": 99.5,
    "avgResponseTime": 1250,
    "circuitBreakers": { ... }
  }
}
```

---

## 5. 音色管理 API

> 需要 `admin.access` 权限

### 5.1 音色列表

**`GET /api/voices`**

| 参数 | 说明 |
|------|------|
| provider | 按服务商筛选 |
| service | 按服务筛选 |
| gender | 按性别筛选 |
| tags | 按标签筛选（逗号分隔） |

### 5.2 添加音色

**`POST /api/voices`**

```json
{
  "provider": "moss",
  "service": "moss_tts",
  "providerVoiceId": "2001257729754140672",
  "displayName": "阿水",
  "gender": "male",
  "ageGroup": "adult",
  "language": "zh",
  "tags": ["对话", "自然"],
  "description": "自然男声，适合对话场景",
  "previewText": "你好，我是阿水"
}
```

### 5.3 批量添加音色

**`POST /api/voices/batch`**

```json
{
  "provider": "moss",
  "service": "moss_tts",
  "voices": [
    { "providerVoiceId": "123", "displayName": "音色A", ... },
    { "providerVoiceId": "456", "displayName": "音色B", ... }
  ]
}
```

### 5.4 更新音色

**`PUT /api/voices/:id`**

```json
{
  "displayName": "新名称",
  "description": "新描述",
  "tags": ["新标签"]
}
```

### 5.5 删除音色

**`DELETE /api/voices/:id`**

### 5.6 保存/重载

**`POST /api/voices/save`** - 持久化音色数据到文件/Redis

**`POST /api/voices/reload`** - 从文件/Redis 重新加载

### 5.7 统计概览

**`GET /api/voices/stats/overview`**

```json
{
  "success": true,
  "data": {
    "totalVoices": 50,
    "byProvider": { "moss": 8, "aliyun": 15, ... },
    "byGender": { "male": 20, "female": 25, "other": 5 }
  }
}
```

### 5.8 服务商启用状态

**`GET /api/voices/providers/status`**

```json
{
  "success": true,
  "data": {
    "moss": true,
    "aliyun_cosyvoice": true,
    "tencent": false,
    ...
  }
}
```

**`GET /api/voices/providers/:provider/enabled`**

```json
{
  "success": true,
  "data": { "enabled": true }
}
```

---

## 6. 凭证管理 API

> 查询类需业务认证，修改类需 `admin.access` 权限

### 6.1 凭证状态

**`GET /api/credentials/status`**

```json
{
  "success": true,
  "data": {
    "moss": {
      "configured": true,
      "accounts": 2,
      "healthy": true,
      "activeAccountId": "primary"
    },
    ...
  }
}
```

### 6.2 已配置服务商列表

**`GET /api/credentials/providers`**

### 6.3 验证凭证

**`GET /api/credentials/validate`** - 验证所有凭证

**`GET /api/credentials/validate/:provider`** - 验证指定服务商

### 6.4 账号列表

**`GET /api/credentials/providers/:provider/accounts`**

### 6.5 账号详情

**`GET /api/credentials/providers/:provider/accounts/:accountId`**

> 凭据字段已脱敏（apiKey 显示为 `sk...xyz`）

### 6.6 服务商健康状态

**`GET /api/credentials/providers/:provider/health`**

### 6.7 启用/禁用账号

**`PATCH /api/credentials/providers/:provider/accounts/:accountId`**

```json
{ "enabled": false }
```

### 6.8 重置账号熔断

**`POST /api/credentials/providers/:provider/accounts/:accountId/reset`**

---

## 7. 监控 API

> 需业务认证

### 7.1 实时指标

**`GET /api/monitoring/realtime`**

```json
{
  "success": true,
  "data": {
    "totalRequests": 1234,
    "successRate": 99.5,
    "avgResponseTime": 1250,
    "p95ResponseTime": 2100,
    ...
  }
}
```

### 7.2 每日指标

**`GET /api/monitoring/daily?days=7`**

| 参数 | 说明 | 默认值 |
|------|------|--------|
| days | 查询天数 | 7 |

### 7.3 服务指标

**`GET /api/monitoring/services`**

返回每个服务商的详细指标。

### 7.4 汇总指标

**`GET /api/monitoring/summary`**

### 7.5 完整监控报告

**`GET /api/monitoring/report`**

包含 realtime + daily + services + config 的完整报告。

### 7.6 记录手动事件

**`POST /api/monitoring/events`**

```json
{
  "type": "custom_event",
  "category": "tts",
  "data": { "key": "value" }
}
```

### 7.7 重置指标

**`POST /api/monitoring/reset`**

### 7.8 监控配置

**`GET /api/monitoring/config`**

### 7.9 健康检查（无需认证）

**`GET /api/monitoring/health`**

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": 3600,
    "metricsAvailable": true,
    "collectorStatus": "active"
  }
}
```

---

## 8. 管理员 API

> 需要 `admin.access` 权限

### 8.1 系统信息

**`GET /api/admin/system/info`**

```json
{
  "success": true,
  "data": {
    "version": "1.0.27",
    "nodeVersion": "v20.x.x",
    "platform": "linux",
    "uptime": 3600
  }
}
```

### 8.2 系统健康

**`GET /api/admin/system/health`**

### 8.3 配置信息

**`GET /api/admin/config`**

### 8.4 认证日志

**`GET /api/admin/logs`**

### 8.5 生成 API Key

**`POST /api/admin/api-keys`**

```json
{
  "permission": "business",
  "expiresIn": 365
}
```

### 8.6 API Key 列表

**`GET /api/admin/api-keys`**

### 8.7 认证指标

**`GET /api/admin/metrics`**

### 8.8 测试 API Key

**`POST /api/admin/test-api-key`**

---

## 9. 音频存储 API

> 需业务认证

### 9.1 存储统计

**`GET /api/audio/stats`**

### 9.2 清理过期文件

**`POST /api/audio/cleanup`**

### 9.3 检查文件存在

**`GET /api/audio/exists/:filename`**

### 9.4 文件信息

**`GET /api/audio/info/:filename`**

### 9.5 删除音频

**`DELETE /api/audio/:filename`**

### 9.6 生成安全文件名

**`POST /api/audio/generate-filename`**

```json
{
  "service": "moss_tts",
  "voice": "moss-tts-ashui",
  "text": "你好世界"
}
```

### 9.7 存储配置信息

**`GET /api/audio/config`**

---

## 10. SNPan 文件存储 API

> 需要 `storage.access` 权限

### 10.1 SDK 测试

**`GET /api/snpan/test`**

### 10.2 获取上传地址

**`GET /api/snpan/upload-url`**

| 参数 | 说明 |
|------|------|
| fileName | 文件名 |
| fileType | 文件类型 |
| fileSize | 文件大小 |
| folderId | 文件夹 ID（可选） |

### 10.3 文件列表

**`GET /api/snpan/files`**

| 参数 | 说明 |
|------|------|
| folderId | 文件夹 ID（可选） |
| page | 页码 |
| size | 每页数量 |
| keyword | 搜索关键词 |

### 10.4 新增文件夹

**`POST /api/snpan/folder`**

```json
{
  "folderName": "新文件夹",
  "parentFolderId": "0"
}
```

### 10.5 编辑文件

**`PUT /api/snpan/file/:id`**

```json
{
  "fileName": "新文件名",
  "description": "新描述"
}
```

### 10.6 转移文件

**`POST /api/snpan/transfer/:id`**

```json
{
  "targetFolderId": "123"
}
```

### 10.7 删除文件

**`DELETE /api/snpan/file/:id`**

### 10.8 获取鉴权链接

**`GET /api/snpan/sign`**

| 参数 | 说明 |
|------|------|
| fileId | 文件 ID |
| expireTime | 过期时间（秒） |
| download | 是否下载（0/1） |

---

## 11. 数据模型

### 11.1 合成请求（SynthesisRequest）

```typescript
interface SynthesisRequest {
  text: string;              // 合成文本
  service: string;           // 服务标识
  voice?: string;            // 音色 systemId
  voiceCode?: string;        // 15 位标准音色编码
  systemId?: string;         // 系统音色 ID
  speed?: number;            // 语速 0.5-2.0
  pitch?: number;            // 音调 0.5-2.0
  volume?: number;           // 音量 0-10
  format?: string;           // mp3/wav/ogg/flac
  sampleRate?: number;       // 采样率
  emotion?: string;          // 情感风格
  style?: string;            // 语音风格
  textType?: string;         // text/ssml
}
```

### 11.2 合成结果（AudioResult）

```typescript
interface AudioResult {
  audioUrl: string;          // 音频 URL
  filename: string;          // 文件名
  format: string;            // 格式
  sampleRate: number;        // 采样率
  duration: number;          // 时长（秒）
  textLength: number;        // 文本长度
  service: string;           // 服务标识
  voice: string;             // 音色 ID
  voiceCode: string;         // 15 位标准音色编码
  requestId: string;         // 请求 ID
}
```

### 11.3 音色模型

```typescript
interface Voice {
  id: string;                // 系统音色 ID（如 moss-tts-ashui）
  voiceCode: string;         // 15 位标准音色编码
  provider: string;          // 服务商 key
  service: string;           // 服务 key
  providerVoiceId: string;   // 服务商真实音色 ID
  displayName: string;       // 显示名称
  gender: string;            // male/female/other
  ageGroup: string;          // child/teen/adult/elder
  language: string;          // zh/en/ja/...
  tags: string[];            // 标签列表
  description: string;       // 描述
  previewText: string;       // 试听文本
  enabled: boolean;          // 是否启用
  metadata: Record<string, any>; // 扩展元数据
}
```

### 11.4 服务商模型

```typescript
interface Provider {
  providerKey: string;       // 服务商 key（如 moss, aliyun）
  displayName: string;       // 显示名称
  serviceKey: string;        // 服务 key
  voiceCount: number;        // 音色数量
  available: boolean;        // 是否可用
}
```

### 11.5 统一响应格式

```typescript
interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  details?: Record<string, any>;
  timestamp?: string;
}
```

### 11.6 VoiceCode 编码规则

15 位数字编码，格式：`PPP VVVVV RRRRRR C`

| 段 | 长度 | 说明 |
|----|------|------|
| PPP | 3 | 服务商编码（001=moss, 002=aliyun, 003=tencent, 004=volcengine, 005=minimax） |
| VVVVV | 5 | 音色业务编号（00001-99999） |
| RRRRRR | 6 | 预留位（固定 000000） |
| C | 1 | Luhn 校验位 |

**优先级**：voiceCode > systemId > voice

---

## 12. 错误处理

### 12.1 错误码列表

| 错误码 | HTTP 状态 | 说明 | 处理建议 |
|--------|-----------|------|---------|
| ValidationError | 400 | 参数校验失败 | 检查请求参数 |
| AuthenticationError | 401 | 认证失败 | 检查 API Key |
| AuthorizationError | 403 | 权限不足 | 检查权限级别 |
| NotFoundError | 404 | 资源不存在 | 检查 ID 是否正确 |
| RateLimitError | 429 | 请求过于频繁 | 等待后重试 |
| CircuitBreakerOpen | 503 | 服务熔断 | 切换服务商或等待恢复 |
| SynthesisError | 500 | 合成失败 | 检查文本/音色/服务商状态 |
| ProviderError | 502 | 服务商错误 | 检查服务商配置和健康状态 |

### 12.2 错误响应示例

```json
{
  "success": false,
  "error": "ValidationError",
  "message": "文本长度超过限制",
  "details": {
    "field": "text",
    "code": "TEXT_TOO_LONG",
    "max": 5000
  }
}
```

### 12.3 错误处理建议

```javascript
try {
  const result = await synthesize(request);
  return result;
} catch (error) {
  if (error.code === 'CircuitBreakerOpen') {
    // 切换备用服务商
    return synthesize({ ...request, service: 'fallback_service' });
  }
  if (error.code === 'RateLimitError') {
    // 等待后重试
    await sleep(1000);
    return synthesize(request);
  }
  throw error;
}
```

---

## 13. 最佳实践

### 13.1 音色选择

1. **优先使用 `/api/tts/frontend` 接口**，数据量最小，字段最精简
2. **音色分组展示**：按服务商 → 服务 → 音色层级组织
3. **缓存音色列表**：音色数据变化不频繁，可缓存 5-10 分钟
4. **提供试听功能**：使用音色的 `previewText` 调用合成接口生成试听音频

### 13.2 合成调用

1. **使用 voice 参数传 systemId**，无需关心服务商真实 ID
2. **合理设置超时**：建议 30 秒，长文本可适当增加
3. **错误重试**：对网络错误和 5xx 错误进行重试（最多 2 次）
4. **批量合成**：多段文本使用 `/api/tts/batch` 接口
5. **缓存音频**：相同文本+音色可缓存音频 URL，避免重复合成

### 13.3 性能优化

1. **连接池**：BFF 层复用 HTTP 连接
2. **并发控制**：批量合成时控制并发数（建议 5）
3. **监控集成**：定期调用 `/api/monitoring/realtime` 获取指标，用于告警
4. **健康检查**：启动时调用 `/api/tts/health` 确认服务可用

### 13.4 安全建议

1. **API Key 保护**：不要在前端暴露 API Key，应在 BFF 层保管
2. **请求限流**：BFF 层对前端请求进行限流，避免触发后端 Rate Limit
3. **输入校验**：BFF 层对前端传入的文本进行基本校验（非空、长度）
4. **错误脱敏**：不要将后端详细错误直接返回给前端

---

## 14. 常见问题

### Q1：如何选择服务商？

通过 `GET /api/tts/providers` 获取可用服务商列表，根据 `available` 字段判断。

### Q2：voice 和 voiceCode 有什么区别？

- `voice`：人类友好的音色 ID（如 `moss-tts-ashui`）
- `voiceCode`：15 位标准编码（如 `001000030000000`），系统内部使用
- 优先使用 `voice`，BFF 层无需处理 voiceCode

### Q3：如何处理服务商故障？

1. 调用 `GET /api/tts/health` 检查服务商状态
2. 如某服务商熔断，切换到其他可用服务商
3. 调用 `GET /api/credentials/status` 查看凭证健康状态

### Q4：合成失败如何排查？

1. 检查响应中的 `error` 和 `details` 字段
2. 调用 `GET /api/tts/stats` 查看统计信息
3. 调用 `GET /api/credentials/validate/:provider` 验证凭证
4. 查看 `/api/monitoring/report` 获取完整监控报告

### Q5：如何获取服务商真实音色 ID？

调用 `GET /api/tts/voices/:id/detail`，响应中的 `runtime.voiceId` 即为服务商真实 ID。

### Q6：支持哪些音频格式？

mp3（默认）、wav、ogg、flac。通过 `format` 参数指定。

### Q7：文本长度限制？

默认 5000 字符。超长文本建议分段后使用批量合成接口。

### Q8：如何测试服务是否可用？

```bash
curl http://localhost:6678/health
curl http://localhost:6678/api/tts/health
```

---

## 附录

### A. 服务商编码对照表

| 编码 | 服务商 | 服务标识 |
|------|--------|---------|
| 001 | MOSS-TTS | moss_tts |
| 002 | 阿里云 | aliyun_cosyvoice, aliyun_qwen_http |
| 003 | 腾讯云 | tencent |
| 004 | 火山引擎 | volcengine_http, volcengine_ws |
| 005 | MiniMax | minimax |

### B. 参数范围参考

| 参数 | 范围 | 默认值 |
|------|------|--------|
| speed | 0.5 - 2.0 | 1.0 |
| pitch | 0.5 - 2.0 | 1.0 |
| volume | 0 - 10 | 5 |
| sampleRate | 8000/16000/22050/24000/44100/48000 | 22050 |

### C. 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| TTS_SYNTH_TIMEOUT_MS | 合成超时 | 60000 |
| TTS_MAX_RETRIES | 最大重试次数 | 1 |
| TTS_RATE_LIMIT | 每分钟请求限制 | 100 |
| AUDIO_STORAGE_DIR | 音频存储目录 | ./data/audio |

---

> 本文档由 TTS 微服务自动生成，如有疑问请联系后端团队。
