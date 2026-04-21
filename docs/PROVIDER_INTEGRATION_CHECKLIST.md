# 新增服务商接入清单

本文档定义了新增 TTS 服务商时需要修改的固定位置。遵循此清单可确保扩展的一致性和完整性。

## 必须修改的 5 个位置

### 1. ProviderDescriptorRegistry.js

**路径**: `src/modules/tts/provider-management/ProviderDescriptorRegistry.js`

**职责**: 定义服务商标识、显示名称、别名、状态等静态信息

**添加内容**:

```javascript
new_provider_tts: {
  key: 'new_provider_tts',
  provider: 'new_provider',
  service: 'tts',
  displayName: '新服务商 TTS',
  description: '新服务商语音合成服务',
  status: 'stable',
  aliases: ['new_provider'],
  protocol: 'http',
  category: 'tts',
  supportsStreaming: false,
  supportsAsync: false
}
```

---

### 2. CapabilitySchema.js

**路径**: `src/modules/tts/schema/CapabilitySchema.js`

**职责**: 定义服务能力、参数支持、默认值、锁定规则

**添加内容**:

```javascript
'new_provider_tts': {
  displayName: '新服务商 TTS',
  provider: 'new_provider',
  service: 'tts',

  // 服务级能力
  capabilities: {
    streaming: false,
    realtime: false,
    emotion: false,
    style: false,
    speedAdjustable: true,   // 是否支持语速调整
    pitchAdjustable: true,   // 是否支持音调调整
    volumeAdjustable: true   // 是否支持音量调整
  },

  // 服务级默认值（只有真正的参数，不含元数据）
  defaults: {
    format: 'wav',
    sampleRate: 24000,
    speed: 1.0,
    pitch: 1.0,
    volume: 50
  },

  // 参数支持声明（前端能力查询 + 后端校验共用）
  parameters: {
    speed: {
      supported: true,
      type: 'number',
      range: { min: 0.5, max: 2.0 },
      default: 1.0
    },
    pitch: {
      supported: true,
      type: 'number',
      range: { min: 0.5, max: 1.5 },
      default: 1.0
    },
    volume: {
      supported: true,
      type: 'number',
      range: { min: 0, max: 100 },
      default: 50
    },
    format: {
      supported: true,
      type: 'enum',
      values: ['wav', 'mp3'],
      default: 'wav'
    }
  },

  // 锁定参数（不允许用户覆盖）
  lockedParams: ['voice', 'model'],

  // 默认音色（元数据，不进入执行参数）
  defaultVoiceId: 'new-provider-default-voice',

  status: 'stable'
}
```

---

### 2. ProviderAdapter

**路径**: `src/modules/tts/adapters/providers/NewProviderTtsAdapter.js`

**职责**: 实现 API 调用逻辑

**要求**:
- 继承 `BaseTtsAdapter`
- 实现 `synthesize(text, providerParams)` 方法
- **不包含**硬编码的默认值（由 CapabilitySchema 提供）
- 只接收已映射的服务商参数

**模板**:

```javascript
const BaseTtsAdapter = require('./BaseTtsAdapter');

class NewProviderTtsAdapter extends BaseTtsAdapter {
  constructor(config = {}) {
    super({
      provider: 'new_provider',
      serviceType: 'tts',
      ...config
    });
    // 初始化配置
  }

  /**
   * 执行 TTS 合成
   * @param {string} text - 要合成的文本
   * @param {Object} providerParams - 已映射的服务商参数
   */
  async synthesize(text, providerParams = {}) {
    this.validateText(text);

    // 调用服务商 API
    const response = await this._callApi(text, providerParams);

    // 返回标准格式
    return {
      audio: response.audio,
      format: 'wav',
      provider: this.provider,
      serviceType: this.serviceType
    };
  }

  async _callApi(text, params) {
    // 实现 API 调用逻辑
  }
}

module.exports = NewProviderTtsAdapter;
```

---

### 3. providers/index.js

**路径**: `src/modules/tts/adapters/providers/index.js`

**职责**: 注册 adapter 映射

**添加内容**:

```javascript
const NewProviderTtsAdapter = require('./NewProviderTtsAdapter');

// 在 adapters 对象中添加
const adapters = {
  // ... 现有 adapters
  'new_provider_tts': new NewProviderTtsAdapter()
};
```

---

### 4. 音色数据

**路径**: `voices/data/new_provider/`

**职责**: 定义可用音色

**文件格式**: YAML

**示例** (`voices/data/new_provider/default.yaml`):

```yaml
meta:
  provider: new_provider
  service: tts
  lastUpdated: '2026-01-01'

voices:
  - id: new-provider-default-voice
    displayName: 默认音色
    gender: female
    languages: [zh-CN]
    description: 新服务商默认音色
    ttsConfig:
      model: default-model
      # 其他配置
```

构建音色数据:

```bash
npm run voices:build
```

---

## 可选修改

### ProviderConfig.json

**路径**: `src/modules/tts/config/ProviderConfig.json`

**职责**: 参数映射规则（如果服务商参数名与平台标准不同）

**添加内容**:

```json
{
  "providers": {
    "new_provider": {
      "services": {
        "tts": {
          "parameterMapping": {
            "speed": {
              "apiField": "speech_rate",
              "range": { "min": 0.5, "max": 2.0 }
            },
            "volume": {
              "apiField": "volume_level",
              "range": { "min": 0, "max": 100 }
            }
          }
        }
      }
    }
  }
}
```

---

## 凭证配置

**路径**: `credentials/sources/providers/new_provider.yaml`

**示例**:

```yaml
meta:
  provider: new_provider
  selector: priority

accounts:
  - id: primary
    credentials:
      apiKey: ${NEW_PROVIDER_API_KEY}
    services: [tts]
    priority: 1
    enabled: true
```

---

## 验证清单

完成以上修改后，运行以下验证：

```bash
# 1. 运行接入验证脚本
node scripts/verify-provider-integration.js new_provider_tts

# 2. 运行单元测试
npm test

# 3. 启动服务并测试
npm run dev
curl http://localhost:3000/api/tts/capabilities/new_provider_tts

# 4. 测试合成
curl -X POST http://localhost:3000/api/tts/synthesize \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"text":"测试","service":"new_provider_tts"}'
```

---

## 常见问题

### Q: 为什么不在 Adapter 中设置默认值？

A: 默认值由 `CapabilitySchema` 统一管理，通过 `ParameterResolutionService` 合并。Adapter 只负责 API 调用，不处理参数默认值。这样确保规则源唯一，便于维护。

### Q: 参数映射规则必须配置吗？

A: 如果服务商参数名与平台标准参数相同（如 `speed`、`volume`），可以不配置 `ProviderConfig.json`。`ParameterMapper` 会直接透传。

### Q: 如何添加服务商特有参数？

A: 在 `CapabilitySchema.parameters` 中定义参数，然后在 `ProviderConfig.json` 中配置映射规则。特殊参数会通过 `providerOptions` 统一出口。

---

## 扩展性设计原则

1. **规则源唯一**: 能力定义和默认值只在 `CapabilitySchema` 中维护，服务描述在 `ProviderDescriptorRegistry` 中维护
2. **前后端一致**: 前端能力查询和后端执行校验使用相同的 `CapabilityResolver`，服务商信息查询使用 `ProviderManagementService`
3. **参数/元数据分离**: `resolvedDefaults` 只包含可执行参数，`metadata` 包含展示字段
4. **特殊参数统一出口**: 非标准参数通过 `providerOptions` 统一传递
5. **服务商管理统一门面**: `ProviderManagementService` 提供查询侧和执行侧共用的服务商信息入口

---

## 架构模块关系

```
ProviderManagementService（统一门面）
  ├── ProviderDescriptorRegistry（静态描述）
  │     └── 服务标识、显示名称、别名、状态
  ├── ProviderRuntimeRegistry（运行时实例）
  │     └── Adapter 注册、实例缓存
  └── credentials 模块（凭证状态）
        └── 账号池、健康状态

CapabilityResolver（能力解析）
  └── CapabilitySchema（能力规则）
        └── 参数支持、默认值、锁定规则

ParameterResolutionService（参数合并）
  └── 按优先级合并参数

ParameterMapper（参数映射）
  └── 平台参数 → 服务商参数

ProviderAdapter（外部调用）
  └── 只接收已映射的 provider-ready 参数
```
