# Auth Module - 独立认证模块

## 概述

这是一个完全独立的基础设施模块，可被任何微服务复用。不依赖任何业务逻辑，只提供认证、授权、限流、监控等通用能力。

## 目录结构

```
src/modules/auth/
├── index.js                 # 模块入口
├── ports/                   # 端口接口
│   ├── IApiKeyRepository.js # 密钥仓储接口
│   └── IAuthMonitor.js      # 监控接口
├── domain/                  # 领域层
│   └── AuthenticationService.js  # 认证服务
└── adapters/                # 适配器层
    ├── ApiKeyRepository.js  # 密钥存储实现
    ├── AuthMonitorAdapter.js # 监控实现
    ├── AuthHttpAdapter.js   # HTTP中间件适配器
    └── AuthContainer.js     # 服务容器
```

## 使用方式

### 基本用法

```javascript
const authModule = require('./modules/auth');

// 初始化
authModule.initialize({
  rateLimit: { requests: 100, window: 60000 },
  keys: process.env.API_KEYS?.split(',')
});

// 创建中间件
app.use(authModule.createMiddleware({ service: 'my-service' }));
```

### Express集成

```javascript
const express = require('express');
const authModule = require('./modules/auth');

const app = express();

// 初始化认证模块
authModule.initialize();

// 保护路由
app.get('/api/protected',
  authModule.createMiddleware({
    service: 'my-service',
    permissions: ['read']
  }),
  (req, res) => {
    res.json({ message: 'Protected data', user: req.auth });
  }
);
```

### 密钥管理

```javascript
// 生成新密钥
const { key, keyInfo } = authModule.generateKey({
  prefix: 'sk',
  services: ['api', 'admin'],
  permissions: ['read', 'write'],
  expiresIn: 3600000 // 1小时后过期
});

// 撤销密钥
authModule.revokeKey('sk_xxx', 'Security breach');

// 获取所有密钥
const keys = authModule.getAllKeys();
```

### 监控

```javascript
// 获取统计
const stats = authModule.getStats();

// 获取实时指标
const metrics = authModule.getMetrics();

// 获取最近事件
const events = authModule.getRecentEvents(50);
```

## API参考

### initialize(options)

初始化认证模块。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| rateLimit.requests | number | 100 | 请求数限制 |
| rateLimit.window | number | 60000 | 时间窗口(ms) |
| keys | string[] | [] | 预配置的API密钥 |
| maxEvents | number | 5000 | 最大事件记录数 |
| enableMetrics | boolean | true | 启用指标收集 |

### createMiddleware(options)

创建Express认证中间件。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| service | string | null | 服务名称 |
| required | boolean | true | 是否必须认证 |
| permissions | string[] | [] | 所需权限 |
| rateLimitTier | string | 'default' | 限流层级 |

## 扩展

### 自定义密钥存储

```javascript
const IApiKeyRepository = require('./modules/auth').IApiKeyRepository;

class RedisKeyRepository extends IApiKeyRepository {
  async verifyKey(apiKey, service) {
    // 从Redis获取密钥信息
  }
}
```

### 自定义监控

```javascript
const IAuthMonitor = require('./modules/auth').IAuthMonitor;

class PrometheusMonitor extends IAuthMonitor {
  recordAuthSuccess(data) {
    // 发送到Prometheus
  }
}
```

## 架构

```
┌────────────────────────────────────────────┐
│                 应用层                      │
│  app.use(authModule.createMiddleware())    │
└─────────────────────┬──────────────────────┘
                      │
                      ▼
┌────────────────────────────────────────────┐
│              AuthHttpAdapter               │
│         (Express中间件适配器)               │
└─────────────────────┬──────────────────────┘
                      │
                      ▼
┌────────────────────────────────────────────┐
│          AuthenticationService            │
│             (领域服务)                      │
└──────┬──────────────────────┬─────────────┘
       │                      │
       ▼                      ▼
┌──────────────┐      ┌──────────────┐
│IApiKeyRepo   │      │ IAuthMonitor │
│  (Port)      │      │   (Port)     │
└──────┬───────┘      └──────┬───────┘
       │                     │
       ▼                     ▼
┌──────────────┐      ┌──────────────┐
│ApiKeyRepo    │      │AuthMonitor   │
│ (Adapter)    │      │  (Adapter)   │
└──────────────┘      └──────────────┘
```

## 迁移指南

### 从旧版本迁移

```javascript
// 旧版本
const { unifiedAuth } = require('./core/middleware/apiKeyMiddleware');
app.use(unifiedAuth.createMiddleware({ service: 'tts' }));

// 新版本
const authModule = require('./modules/auth');
authModule.initialize();
app.use(authModule.createMiddleware({ service: 'tts' }));
```