# ADR-002: 提取基础设施组件

## 状态
已通过 (Accepted)

## 背景

`BaseTtsService` 和 `TtsServiceManager` 承担了过多的基础设施职责：

**BaseTtsService (361行) 包含：**
- 验证逻辑
- 重试逻辑
- 错误处理
- 音频存储
- 日志记录
- 响应格式化

**TtsServiceManager (350行) 包含：**
- 服务协调
- 熔断器逻辑
- 限流器逻辑
- 指标收集

这违反了单一职责原则(SRP)，导致：
1. 难以独立测试各组件
2. 修改一个功能可能影响其他功能
3. 代码认知负载高

## 决策

提取独立的基础设施组件：

### 1. 弹性组件 (`src/infrastructure/resilience/`)

```javascript
// CircuitBreaker - 熔断器
class CircuitBreaker {
  constructor(options) { /* ... */ }
  async execute(fn) { /* ... */ }
  isOpen() { /* ... */ }
  getStats() { /* ... */ }
}

// RetryExecutor - 重试执行器
class RetryExecutor {
  constructor(options) { /* ... */ }
  async execute(fn, operation) { /* ... */ }
}

// RateLimiter - 限流器
class RateLimiter {
  constructor(options) { /* ... */ }
  check(key) { /* ... */ }
  checkAndThrow(key) { /* ... */ }
}
```

### 2. 监控组件 (`src/infrastructure/`)

```javascript
// MetricsCollector - 指标收集器
class MetricsCollector {
  increment(name, value, labels) { /* ... */ }
  observe(name, value, labels) { /* ... */ }
  startTimer(name, labels) { /* ... */ }
  getSummary() { /* ... */ }
}
```

## 后果

### 正面
- 各组件可独立测试和复用
- 职责清晰，易于维护
- 可以灵活配置各组件参数
- 降低单个类的复杂度

### 负面
- 增加了类的数量
- 需要在服务层组装这些组件
- 可能增加少量的性能开销

## 示例用法

```javascript
const breaker = new CircuitBreaker({ failureThreshold: 5 });
const retry = new RetryExecutor({ maxRetries: 3 });

const result = await breaker.execute(async () => {
  return retry.execute(() => ttsService.synthesize(text, options));
});
```

## 参与者

- 决策者: Claude (Evolutionary Architecture Refactorer)
- 日期: 2026-03-10