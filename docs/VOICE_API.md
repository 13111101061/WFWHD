# TTS 音色查询 API 文档

## 概述

| 项目 | 说明 |
|------|------|
| **Base URL** | `http://localhost:3000/api/tts/voices` |
| **认证方式** | 无需认证（公开接口） |
| **响应格式** | JSON |

> **注意**：只有 `POST /reload` 接口需要管理员权限认证。

---

## 接口列表

### 1. 获取所有音色

```
GET /api/tts/voices/models
```

**请求头：** 无需认证

**响应示例：**
```json
{
  "success": true,
  "data": [
    {
      "id": "aliyun-qwen_http-zhichu",
      "provider": "aliyun",
      "service": "qwen_http",
      "name": "知楚",
      "gender": "female",
      "tags": ["温柔", "知性"],
      "languages": ["zh-CN"],
      "description": "温柔知性的女声"
    }
  ],
  "count": 156,
  "timestamp": "2026-03-09T10:00:00.000Z"
}
```

---

### 2. 按提供商获取音色

```
GET /api/tts/voices/providers/:provider
```

**路径参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| provider | string | ✅ | 提供商名称（aliyun/tencent/volcengine/minimax） |

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| service | string | ❌ | 服务类型（如 qwen_http, cosyvoice） |

**示例：**
```bash
# 获取阿里云所有音色
curl -H "X-API-Key: your-key" http://localhost:3000/api/tts/voices/providers/aliyun

# 获取阿里云 qwen_http 服务的音色
curl -H "X-API-Key: your-key" "http://localhost:3000/api/tts/voices/providers/aliyun?service=qwen_http"
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "provider": "aliyun",
    "models": [...],
    "count": 45
  },
  "timestamp": "2026-03-09T10:00:00.000Z"
}
```

---

### 3. 按标签获取音色

```
GET /api/tts/voices/tags/:tag
```

**路径参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tag | string | ✅ | 标签名称（需URL编码） |

**示例：**
```bash
curl -H "X-API-Key: your-key" http://localhost:3000/api/tts/voices/tags/%E6%B8%A9%E6%9F%94
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "tag": "温柔",
    "models": [...],
    "count": 23
  },
  "timestamp": "2026-03-09T10:00:00.000Z"
}
```

---

### 4. 搜索音色

```
GET /api/tts/voices/search?q=keyword
```

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| q | string | ✅ | 搜索关键词 |
| provider | string | ❌ | 限定提供商 |
| limit | number | ❌ | 返回数量（默认50） |

**示例：**
```bash
# 搜索包含"温柔"的音色
curl -H "X-API-Key: your-key" "http://localhost:3000/api/tts/voices/search?q=温柔"

# 在阿里云中搜索，限制10条
curl -H "X-API-Key: your-key" "http://localhost:3000/api/tts/voices/search?q=温柔&provider=aliyun&limit=10"
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "query": "温柔",
    "models": [...],
    "count": 15
  },
  "timestamp": "2026-03-09T10:00:00.000Z"
}
```

---

### 5. 获取所有提供商列表

```
GET /api/tts/voices/providers
```

**响应示例：**
```json
{
  "success": true,
  "data": ["aliyun", "tencent", "volcengine", "minimax"],
  "stats": {
    "aliyun": { "count": 45 },
    "tencent": { "count": 38 },
    "volcengine": { "count": 25 },
    "minimax": { "count": 48 }
  },
  "count": 4,
  "timestamp": "2026-03-09T10:00:00.000Z"
}
```

---

### 6. 获取所有标签列表

```
GET /api/tts/voices/tags
```

**响应示例：**
```json
{
  "success": true,
  "data": ["温柔", "知性", "活泼", "磁性"],
  "stats": {
    "温柔": 23,
    "知性": 18,
    "活泼": 12,
    "磁性": 8
  },
  "timestamp": "2026-03-09T10:00:00.000Z"
}
```

---

### 7. 获取单个音色详情

```
GET /api/tts/voices/models/:id
```

**路径参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | ✅ | 音色ID |

**示例：**
```bash
curl -H "X-API-Key: your-key" http://localhost:3000/api/tts/voices/models/aliyun-qwen_http-zhichu
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "id": "aliyun-qwen_http-zhichu",
    "provider": "aliyun",
    "service": "qwen_http",
    "name": "知楚",
    "gender": "female",
    "tags": ["温柔", "知性"],
    "languages": ["zh-CN"],
    "description": "温柔知性的女声"
  },
  "timestamp": "2026-03-09T10:00:00.000Z"
}
```

**404 响应：**
```json
{
  "success": false,
  "error": "Model not found",
  "message": "Model with ID 'xxx' was not found",
  "timestamp": "2026-03-09T10:00:00.000Z"
}
```

---

### 8. 获取分类数据（前端专用）

```
GET /api/tts/voices/categories
```

**特性：**
- 内存缓存 + ETag 支持
- 5秒内请求返回缓存
- 支持 `If-None-Match` 条件请求（返回 304）

**响应头：**
```
ETag: "abc123..."
Cache-Control: public, max-age=300
X-Cache: HIT | MISS | STALE
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "categories": {
      "female": [...],
      "male": [...]
    }
  },
  "timestamp": "2026-03-09T10:00:00.000Z"
}
```

---

### 9. 获取统计信息

```
GET /api/tts/voices/stats
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "totalVoices": 156,
    "providers": 4,
    "tags": 24,
    "health": {
      "status": "healthy",
      "lastLoad": "2026-03-09T10:00:00.000Z"
    }
  },
  "timestamp": "2026-03-09T10:00:00.000Z"
}
```

---

### 10. 获取健康状态

```
GET /api/tts/voices/health
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "health": {
      "status": "healthy",
      "lastLoad": "2026-03-09T10:00:00.000Z"
    },
    "stats": {
      "totalVoices": 156
    }
  },
  "timestamp": "2026-03-09T10:00:00.000Z"
}
```

---

### 11. 重新加载配置（管理员权限）

```
POST /api/tts/voices/reload
```

**权限要求：** 需要 `admin.access` 权限

**响应示例：**
```json
{
  "success": true,
  "message": "Voice configuration reloaded successfully",
  "stats": {
    "totalVoices": 156
  },
  "timestamp": "2026-03-09T10:00:00.000Z"
}
```

---

## 错误响应

### 401 未授权
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Invalid or missing API key",
  "timestamp": "2026-03-09T10:00:00.000Z"
}
```

### 404 未找到
```json
{
  "success": false,
  "error": "Model not found",
  "message": "Model with ID 'xxx' was not found",
  "timestamp": "2026-03-09T10:00:00.000Z"
}
```

### 400 参数错误
```json
{
  "success": false,
  "error": "Search query is required",
  "message": "Please provide a search query using the \"q\" parameter",
  "timestamp": "2026-03-09T10:00:00.000Z"
}
```

### 503 服务不可用
```json
{
  "success": false,
  "error": "VoiceManager not ready",
  "message": "VoiceManager initialization timeout",
  "timestamp": "2026-03-09T10:00:00.000Z"
}
```

---

## 音色对象结构

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 全局唯一ID，格式：`${provider}-${service}-${voiceId}` |
| provider | string | 提供商（aliyun/tencent/volcengine/minimax） |
| service | string | 服务类型（qwen_http/cosyvoice等） |
| name | string | 音色名称 |
| gender | string | 性别：`female` / `male` |
| tags | string[] | 标签列表 |
| languages | string[] | 支持语言 |
| description | string | 音色描述 |

---

## 前端使用建议

1. **优先使用 `/categories` 接口** - 带缓存和ETag，性能最优
2. **搜索场景用 `/search`** - 支持模糊匹配，可限定提供商
3. **按标签筛选用 `/tags/:tag`** - 获取同类型音色
4. **监控用 `/health` 和 `/stats`** - 便于运维查看服务状态

---

## 相关文档

- [音色库快速参考指南](./音色库快速参考指南.md)
- [音色工厂模块详细说明](./音色工厂模块详细说明.md)
- [FRONTEND_GUIDE.md](./FRONTEND_GUIDE.md)