# TTS模块架构蓝图

## 一、架构概览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           TTS Module (六边形架构)                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│    ┌─────────────────────────────────────────────────────────────┐     │
│    │                      HTTP Layer (外部)                       │     │
│    │                    apps/api/routes/tts.js                    │     │
│    └─────────────────────────────┬───────────────────────────────┘     │
│                                  │                                     │
│                                  ▼                                     │
│    ┌─────────────────────────────────────────────────────────────┐     │
│    │                   Adapters (适配器层)                        │     │
│    │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐│     │
│    │  │ TtsHttpAdapter  │  │VoiceCatalogAdapter│ │ Provider     ││     │
│    │  │ HTTP→Domain转换  │  │ 音色目录适配器    │ │ Adapters     ││     │
│    │  └────────┬────────┘  └────────┬────────┘  │(Aliyun/Tencent)││   │
│    │           │                    │           └──────────────┘│     │
│    └───────────┼────────────────────┼────────────────────────────┘     │
│                │                    │                                  │
│                ▼                    ▼                                  │
│    ┌─────────────────────────────────────────────────────────────┐     │
│    │                     Ports (端口层)                           │     │
│    │  ┌─────────────────────┐  ┌─────────────────────┐           │     │
│    │  │ ITtsProvider        │  │ IVoiceCatalog       │           │     │
│    │  │ - synthesize()      │  │ - getById()         │           │     │
│    │  │ - getVoices()       │  │ - getByProvider()   │           │     │
│    │  │ - getHealth()       │  │ - getAll()          │           │     │
│    │  └─────────────────────┘  └─────────────────────┘           │     │
│    └─────────────────────────────────────────────────────────────┘     │
│                                  │                                     │
│                                  ▼                                     │
│    ┌─────────────────────────────────────────────────────────────┐     │
│    │                     Domain (领域层)                          │     │
│    │  ┌───────────────────────────────────────────────────────┐  │     │
│    │  │ TtsSynthesisService (核心编排服务)                     │  │     │
│    │  │ - synthesize(request) → AudioResult                   │  │     │
│    │  │ - batchSynthesize(requests)                           │  │     │
│    │  │ - getVoices(provider, service)                        │  │     │
│    │  │ - [熔断器] [限流器] [重试机制]                          │  │     │
│    │  └───────────────────────────────────────────────────────┘  │     │
│    │  ┌─────────────────┐  ┌─────────────────┐                   │     │
│    │  │ SynthesisRequest│  │ AudioResult     │                   │     │
│    │  │ (值对象)         │  │ (实体)          │                   │     │
│    │  └─────────────────┘  └─────────────────┘                   │     │
│    └─────────────────────────────────────────────────────────────┘     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 二、目录结构

```
src/modules/tts/
│
├── domain/                          # 领域层（纯业务逻辑，无框架依赖）
│   ├── SynthesisRequest.js          # 值对象：合成请求
│   ├── AudioResult.js               # 实体：音频结果
│   ├── TtsSynthesisService.js       # 领域服务：核心编排
│   ├── TtsValidationService.js      # 领域服务：验证
│   └── index.js
│
├── ports/                           # 端口层（接口定义）
│   ├── ITtsProvider.js              # TTS提供者接口
│   ├── IVoiceCatalog.js             # 音色目录接口
│   └── index.js
│
├── adapters/                        # 适配器层（具体实现）
│   ├── providers/                   # 提供者适配器
│   │   ├── BaseTtsAdapter.js        # 基类
│   │   ├── AliyunCosyVoiceAdapter.js
│   │   ├── AliyunQwenAdapter.js
│   │   ├── TencentTtsAdapter.js
│   │   ├── VolcengineTtsAdapter.js
│   │   └── MinimaxTtsAdapter.js
│   ├── VoiceCatalogAdapter.js       # 音色目录适配器
│   ├── http/
│   │   └── TtsHttpAdapter.js        # HTTP适配器（唯一入口）
│   └── index.js
│
├── config/                          # 配置
│   ├── VoiceConfig.js               # 音色配置
│   └── ParameterMapper.js           # 参数映射
│
└── index.js                         # 模块入口
```

## 三、依赖注入

```javascript
// ServiceContainer.js
const ttsModule = require('./modules/tts');

// 初始化时注入依赖
await ttsModule.initialize({
  providers: {
    aliyun: { apiKey: process.env.TTS_API_KEY },
    tencent: { secretId, secretKey },
    volcengine: { appId, token },
    minimax: { apiKey }
  },
  voiceCatalog: {
    configPath: './config/voices.json'
  }
});

// 使用
const httpAdapter = ttsModule.getHttpAdapter();
```

## 四、请求处理流程

```
POST /api/tts/synthesize
        │
        ▼
┌───────────────────┐
│ TtsHttpAdapter    │
│ synthesize(req,res)│
└─────────┬─────────┘
          │ 1. 解析HTTP请求 → SynthesisRequest
          ▼
┌───────────────────┐
│ SynthesisRequest  │
│ (值对象)           │
└─────────┬─────────┘
          │ 2. 调用领域服务
          ▼
┌───────────────────┐
│TtsSynthesisService│
│ synthesize()      │
└─────────┬─────────┘
          │ 3. 验证 + 熔断检查 + 限流
          │ 4. 调用TTS提供者
          ▼
┌───────────────────┐
│ ITtsProvider      │
│ (端口接口)         │
└─────────┬─────────┘
          │ 5. 具体实现
          ▼
┌───────────────────┐
│ AliyunTtsAdapter  │
│ synthesize()      │
└─────────┬─────────┘
          │ 6. 返回结果
          ▼
┌───────────────────┐
│ AudioResult       │
│ (实体)             │
└─────────┬─────────┘
          │ 7. 转换为HTTP响应
          ▼
    HTTP 200 JSON
```

## 五、与旧架构对比

| 维度 | 旧架构 | 新架构 |
|------|--------|--------|
| HTTP入口 | `UnifiedTtsController` + 多个路由 | `TtsHttpAdapter`（唯一） |
| 服务编排 | `TtsServiceManager`（core/） | `TtsSynthesisService`（domain/） |
| 提供者实现 | `services/*.js` | `adapters/providers/*.js` |
| 依赖管理 | 全局单例 | 依赖注入 |
| 测试性 | 难以Mock | 易于替换适配器 |

## 六、迁移状态

| 组件 | 状态 | 说明 |
|------|------|------|
| `domain/` | ✅ 已创建 | TtsSynthesisService需要增强熔断器 |
| `ports/` | ✅ 已创建 | 接口已定义 |
| `adapters/` | ⚠️ 部分完成 | TtsHttpAdapter已完成，Provider适配器待迁移 |
| `core/` | 🔄 待迁移 | TtsServiceManager熔断器逻辑待迁移 |
| `services/` | 🔄 待迁移 | 迁移到adapters/providers/ |
| `routes/` | 🔄 待清理 | 删除冗余路由 |