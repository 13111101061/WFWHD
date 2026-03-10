# ADR-001: 采用六边形架构 (Hexagonal Architecture)

## 状态
已通过 (Accepted)

## 背景

当前 `UnifiedTtsController` 直接接收 Express 的 `req` 和 `res` 对象，导致：
1. 业务逻辑与HTTP框架紧耦合
2. 无法进行纯单元测试（必须mock Express）
3. 无法切换HTTP框架
4. 违反Clean Architecture原则

```javascript
// 问题代码
async synthesize(req, res) {
  const { service, text } = req.body;  // Express耦合
  res.json({ success: true });          // Express耦合
}
```

## 决策

采用六边形架构（端口与适配器模式），将系统分为三层：

1. **领域层 (Domain)**：纯业务逻辑，无框架依赖
   - `SynthesisRequest` - 值对象
   - `AudioResult` - 实体
   - `TtsSynthesisService` - 领域服务

2. **端口层 (Ports)**：接口定义
   - `TtsProviderPort` - TTS提供者接口
   - `VoiceCatalogPort` - 音色目录接口

3. **适配器层 (Adapters)**：框架特定实现
   - `TtsHttpAdapter` - Express适配器
   - `TtsProviderAdapter` - TTS服务适配器
   - `VoiceCatalogAdapter` - 音色目录适配器

## 后果

### 正面
- 业务逻辑可独立测试
- 框架可替换（如从Express迁移到Fastify）
- 清晰的依赖方向（外层依赖内层）
- 更好的代码组织和可维护性

### 负面
- 初期需要更多的抽象层
- 增加了一定的代码量
- 需要团队学习新的架构模式

## 迁移策略

采用"绞杀者模式"：
1. 在旧代码旁创建新的六边形架构实现
2. 新功能使用新架构
3. 逐步迁移现有功能
4. 最终删除旧代码

## 参与者

- 决策者: Claude (Evolutionary Architecture Refactorer)
- 日期: 2026-03-10