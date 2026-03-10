# ADR-004: 认证模块规范化重构

## 状态
已通过 (Accepted)

## 背景

原有 `UnifiedAuthMiddleware` (450行) 存在严重的架构问题：

```javascript
// 问题：上帝类，混合多种职责
class UnifiedAuthMiddleware {
  constructor() {
    this.apiKeyService = new ApiKeyService();  // 内部创建依赖
    this.monitor = new AuthMonitor();           // 内部创建依赖
    this.rateLimitStore = new Map();            // 重复实现限流
  }

  // 450行代码包含：
  // - 认证逻辑
  // - 限流逻辑（与 infrastructure/RateLimiter 重复）
  // - 监控逻辑
  // - HTTP响应格式化
  // - 清理定时器管理
}
```

### 具体问题

1. **上帝类反模式**：单一类承担6+职责
2. **重复实现**：内置限流器与 `src/infrastructure/resilience/RateLimiter` 重复
3. **构造函数内创建依赖**：无法注入mock进行测试
4. **Express紧耦合**：直接操作 `req/res` 对象
5. **缺少接口抽象**：没有端口定义

## 决策

采用六边形架构重构认证模块：

### 1. 定义端口接口

```javascript
// IApiKeyRepository - 密钥仓储接口
class IApiKeyRepository {
  async verifyKey(apiKey, service) { }
  generateKey(options) { }
  revokeKey(apiKey, reason) { }
}

// IAuthMonitor - 监控接口
class IAuthMonitor {
  recordAuthSuccess(data) { }
  recordAuthFailure(data, reason, code) { }
  getRecentEvents(limit) { }
}
```

### 2. 创建领域服务

```javascript
// AuthenticationService - 纯业务逻辑
class AuthenticationService {
  constructor({ keyRepository, monitor, rateLimiter }) {
    // 依赖注入
    this.keyRepository = keyRepository;
    this.monitor = monitor;
    this.rateLimiter = rateLimiter;
  }

  async authenticate(request) {
    // 纯认证逻辑，不涉及HTTP
  }
}
```

### 3. 创建适配器

```javascript
// ApiKeyRepository - 密钥存储实现
// AuthMonitorAdapter - 监控实现
// AuthHttpAdapter - Express中间件适配器

class AuthHttpAdapter {
  createMiddleware(options) {
    return async (req, res, next) => {
      const result = await this.authService.authenticate(...);
      if (!result.success) {
        return this._sendError(res, result);
      }
      req.auth = result.auth;
      next();
    };
  }
}
```

### 4. 服务容器管理依赖

```javascript
const authContainer = new AuthContainer();
authContainer.initialize({
  enableRateLimit: true,
  rateLimit: { requests: 100, window: 60000 }
});

// 创建中间件
app.use(authContainer.createMiddleware({ service: 'tts' }));
```

## 文件结构

```
src/
├── ports/
│   ├── IApiKeyRepository.js      # 密钥仓储接口
│   └── IAuthMonitor.js           # 监控接口
├── domain/auth/
│   ├── AuthenticationService.js  # 领域服务
│   └── index.js
└── adapters/auth/
    ├── ApiKeyRepository.js       # 仓储实现
    ├── AuthMonitorAdapter.js     # 监控实现
    ├── AuthHttpAdapter.js        # HTTP适配器
    ├── AuthContainer.js          # 服务容器
    └── index.js
```

## 后果

### 正面
- 职责分离：认证、限流、监控各自独立
- 可测试：依赖可注入mock
- 复用基础设施：使用已有的 `RateLimiter`
- 框架无关：领域逻辑不依赖Express

### 负面
- 增加了抽象层
- 需要学习新的使用方式

## 迁移指南

### 旧用法（仍兼容）

```javascript
const { unifiedAuth } = require('./apiKeyMiddleware');
app.use(unifiedAuth.createMiddleware({ service: 'tts' }));
```

### 新用法（推荐）

```javascript
const { authContainer } = require('./authMiddleware.v2');
app.use(authContainer.createMiddleware({ service: 'tts' }));
```

## 参与者

- 决策者: Claude (Evolutionary Architecture Refactorer)
- 日期: 2026-03-10