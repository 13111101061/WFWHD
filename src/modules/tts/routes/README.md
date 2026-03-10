# TTS路由迁移指南

## 概述

TTS模块已重构为六边形架构，路由已统一到 `index.js`。

## 迁移状态

| 文件 | 状态 | 说明 |
|------|------|------|
| `index.js` | ✅ 活跃 | 主路由，使用TtsHttpAdapter |
| `ttsRoutes.js` | ⚠️ 废弃 | 旧CosyVoice路由 |
| `unifiedTtsRoutes.js` | ⚠️ 废弃 | 旧的"统一"路由 |
| `qwenTtsRoutes.js` | ⚠️ 废弃 | 旧Qwen专用路由 |
| `qwenTtsHttpRoutes.js` | ⚠️ 废弃 | 旧Qwen HTTP路由 |
| `voices.js` | ⚠️ 废弃 | 旧音色路由 |
| `health.js` | ⚠️ 废弃 | 旧健康检查路由 |
| `voiceRoutes.js` | ✅ 保留 | 音色管理路由（单独功能） |

## 使用新路由

```javascript
// apps/api/routes/ttsRoutes.js
const ttsRoutes = require('../../src/modules/tts/routes');
const authModule = require('../../src/modules/auth');

// 使用
app.use('/api/tts', authModule.createMiddleware({ service: 'tts' }), ttsRoutes);
```

## API端点

所有端点都在 `/api/tts` 下：

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | /synthesize | TTS合成 |
| POST | /batch | 批量合成 |
| GET | /voices | 音色列表 |
| GET | /providers | 提供商列表 |
| GET | /health | 健康状态 |
| GET | /stats | 统计信息 |
| POST | /reset-stats | 重置统计 |
| POST | /clear-cache | 清理缓存 |

## 快捷路由

保留服务专用快捷路由：

- POST `/aliyun/cosyvoice` → service=aliyun_cosyvoice
- POST `/aliyun/qwen` → service=aliyun_qwen_http
- POST `/tencent` → service=tencent
- POST `/volcengine/http` → service=volcengine_http
- POST `/minimax` → service=minimax