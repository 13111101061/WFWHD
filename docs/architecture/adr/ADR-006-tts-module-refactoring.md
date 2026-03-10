# ADR-006: TTS模块架构重构

## 状态

**已实施** (Implemented) - 2026-03-11

## 背景

当前TTS模块存在新旧两套架构并存的问题：

### 现状

```
src/modules/tts/
├── domain/          ← 六边形架构（新，部分实现）
├── ports/           ← 六边形架构（新，部分实现）
├── adapters/        ← 六边形架构（新，部分实现）
├── core/            ← 传统分层架构（旧，核心逻辑）
├── services/        ← 传统分层架构（旧，具体实现）
├── routes/          ← 传统分层架构（旧，HTTP路由）
├── config/          ← 配置
├── middlewares/     ← 中间件
├── utils/           ← 工具
└── UnifiedTtsController.js  ← 根目录控制器（旧）
```

### 问题诊断

| 问题 | 描述 | 影响 |
|------|------|------|
| 架构混乱 | 六边形架构与传统分层架构并存 | 维护困难，职责不清 |
| 职责重叠 | `UnifiedTtsController` 与 `TtsHttpAdapter` 功能重复 | 代码冗余 |
| 服务编排重复 | `TtsSynthesisService` 与 `TtsServiceManager` 都做编排 | 调用链混乱 |
| 单例泛滥 | `ttsFactory`, `ttsServiceManager`, `voiceManager` 全局单例 | 测试困难，耦合严重 |
| 路由冗余 | 8个路由文件，部分功能重复 | 难以维护 |

### 当前调用链（混乱）

```
┌─────────────────────────────────────────────────────────────────┐
│  HTTP请求                                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        ▼                                           ▼
┌───────────────────┐                    ┌───────────────────┐
│ 旧路径            │                    │ 新路径            │
│ ttsRoutes.js      │                    │ TtsHttpAdapter    │
└───────────────────┘                    └───────────────────┘
        │                                           │
        ▼                                           ▼
┌───────────────────┐                    ┌───────────────────┐
│ UnifiedTtsController│                   │ TtsSynthesisService│
└───────────────────┘                    └───────────────────┘
        │                                           │
        ▼                                           ▼
┌───────────────────┐                    ┌───────────────────┐
│ TtsServiceManager │◄───────────────────│ TtsProviderAdapter│
│ (熔断器/限流)      │                    └───────────────────┘
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ TtsFactory        │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ cosyVoiceService  │
└───────────────────┘
```

## 决策

采用**纯六边形架构（Hexagonal Architecture）**重构TTS模块，分三个阶段实施。

### 目标架构

```
src/modules/tts/
├── domain/                    # 领域层（核心业务逻辑）
│   ├── SynthesisRequest.js    # 值对象：合成请求
│   ├── AudioResult.js         # 实体：音频结果
│   ├── TtsSynthesisService.js # 领域服务：合成编排（含熔断器/限流）
│   ├── TtsValidationService.js# 领域服务：验证
│   └── index.js
│
├── ports/                     # 端口层（接口定义）
│   ├── ITtsProvider.js        # 端口：TTS提供者接口
│   ├── IVoiceCatalog.js       # 端口：音色目录接口
│   └── index.js
│
├── adapters/                  # 适配器层（具体实现）
│   ├── providers/             # 提供者适配器
│   │   ├── AliyunTtsAdapter.js
│   │   ├── TencentTtsAdapter.js
│   │   ├── VolcengineTtsAdapter.js
│   │   └── MinimaxTtsAdapter.js
│   ├── VoiceCatalogAdapter.js # 音色目录适配器
│   ├── http/                  # HTTP适配器
│   │   └── TtsHttpAdapter.js
│   └── index.js
│
├── config/                    # 配置
│   └── VoiceConfig.js
│
└── index.js                   # 模块入口
```

### 清晰的调用链（重构后）

```
┌─────────────────────────────────────────────────────────────────┐
│  HTTP请求                                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │ TtsHttpAdapter    │  ← 唯一HTTP入口
                    │ (adapters/http/)  │
                    └───────────────────┘
                              │
                              ▼
                ┌─────────────────────────┐
                │ TtsSynthesisService     │  ← 领域服务（编排+熔断+限流）
                │ (domain/)               │
                └─────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
          ┌─────────────────┐  ┌─────────────────┐
          │ ITtsProvider    │  │ IVoiceCatalog   │
          │ (ports/)        │  │ (ports/)        │
          └─────────────────┘  └─────────────────┘
                    │                   │
                    ▼                   ▼
          ┌─────────────────┐  ┌─────────────────┐
          │ AliyunTtsAdapter│  │ VoiceCatalogAdapter│
          │ (adapters/)     │  │ (adapters/)     │
          └─────────────────┘  └─────────────────┘
```

## 实施阶段

### 阶段一：架构定义（当前）

**目标**：明确架构边界，建立清晰文档

**产出**：
- 本ADR文档
- 目录结构规范
- 接口定义文档

### 阶段二：核心层整合

**目标**：整合 `core/` 和 `domain/`，消除重复

**任务**：
1. 将 `TtsServiceManager` 的熔断器/限流逻辑迁移到 `TtsSynthesisService`
2. 删除 `UnifiedTtsController`，统一使用 `TtsHttpAdapter`
3. 将 `services/` 重构为 `adapters/providers/`

### 阶段三：路由清理

**目标**：精简路由文件

**任务**：
1. 删除冗余路由文件（qwenTtsRoutes.js, unifiedTtsRoutes.js等）
2. 在 `apps/api/routes/` 中只保留一个入口路由
3. 所有TTS请求通过 `TtsHttpAdapter` 处理

### 阶段四：依赖注入

**目标**：消除全局单例，实现依赖注入

**任务**：
1. 通过 `ServiceContainer` 注入所有依赖
2. 删除 `ttsFactory`, `ttsServiceManager` 单例导出
3. 更新模块入口 `index.js`

## 文件迁移映射

| 旧位置 | 新位置 | 说明 |
|--------|--------|------|
| `core/TtsServiceManager.js` | `domain/TtsSynthesisService.js` | 合并熔断器逻辑 |
| `core/TtsFactory.js` | 删除 | 功能分散到各Adapter |
| `core/BaseTtsService.js` | `adapters/providers/BaseTtsAdapter.js` | 重命名 |
| `services/cosyVoiceService.js` | `adapters/providers/AliyunCosyVoiceAdapter.js` | 迁移 |
| `services/tencentTtsService.js` | `adapters/providers/TencentTtsAdapter.js` | 迁移 |
| `UnifiedTtsController.js` | 删除 | 功能已在TtsHttpAdapter |
| `routes/*.js` | 删除 | 路由移至 `apps/api/routes/` |

## 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| 破坏现有功能 | 分阶段实施，每阶段运行测试 |
| 遗留代码引用 | 保留向后兼容层，标记deprecated |
| 时间成本 | 优先处理高影响问题，低优先级可延后 |

## 参考

- [ADR-001: 六边形架构](./ADR-001-hexagonal-architecture.md)
- [ADR-003: 依赖注入](./ADR-003-dependency-injection.md)