# TTS 服务商管理系统重构方案

## 🎯 重构目标

将混乱的服务商管理改为**插件化、配置驱动、职责清晰**的架构。

---

## 📊 当前问题分析

### 1. 职责混乱
```
TtsFactory (工厂)
  ├─ 创建服务 ✓
  ├─ 加载配置 ✗ (应该在 ConfigLoader)
  ├─ 硬编码 switch-case ✗ (应该注册制)
  └─ 健康检查 ✗ (应该在 HealthChecker)

TtsServiceManager (管理器)
  ├─ 熔断器 ✓
  ├─ 限流 ✓
  ├─ 统计 ✓
  └─ 调用 Factory ✗ (职责重叠)
```

### 2. 配置分散
```
.env                                    → 环境变量
src/shared/config/config.js           → 全局配置
TtsFactory.loadConfigs()               → 服务配置
ProviderConfig.json                   → 参数映射
voiceIdMapping.json                   → 音色配置
```

### 3. 硬编码严重
```javascript
// TtsFactory.js - 大量硬编码
switch (provider) {
  case 'aliyun': ...
  case 'tencent': ...
  case 'volcengine': ...
  case 'minimax': ...
  default: throw new Error(...)
}
```

---

## 🏗️ 优化后架构

### **核心设计原则**
1. **插件化** - 服务商自动注册，无需修改核心代码
2. **配置驱动** - 所有配置统一管理
3. **职责分离** - 每个类只负责一件事
4. **易扩展** - 添加新服务商只需 3 步

### **新的目录结构**
```
src/modules/tts/
├── core/
│   ├── BaseService.js          # 基础服务类
│   ├── ServiceRegistry.js      # 服务注册中心 (新增)
│   ├── ConfigManager.js        # 配置管理器 (新增)
│   ├── ServiceFactory.js       # 简化后的工厂 (重构)
│   ├── CircuitBreaker.js       # 熔断器 (独立)
│   ├── RateLimiter.js          # 限流器 (独立)
│   └── ServiceManager.js       # 服务管理器 (重构)
│
├── providers/                  # 服务商插件 (重构)
│   ├── aliyun/
│   │   ├── AliyunProvider.js    # 阿里云提供商
│   │   ├── CosyVoiceService.js  # CosyVoice 服务
│   │   └── QwenService.js       # Qwen 服务
│   ├── tencent/
│   │   └── TencentProvider.js
│   ├── volcengine/
│   │   └── VolcengineProvider.js
│   └── minimax/
│       └── MiniMaxProvider.js
│
└── config/
    ├── provider-registry.json  # 提供商注册表 (新增)
    ├── service-config.json     # 服务配置 (新增)
    └── provider-config.json    # ProviderConfig.json (重命名)
```

---

## 🔧 核心组件设计

### **1. ServiceRegistry (服务注册中心)**

```javascript
/**
 * 服务注册中心 - 插件化的核心
 */
class ServiceRegistry {
  constructor() {
    this.providers = new Map();      // provider → ProviderClass
    this.services = new Map();        // serviceKey → ServiceClass
    this.instances = new Map();       // serviceKey → instance
  }

  /**
   * 注册提供商
   * @param {string} providerId - 提供商ID (如 'aliyun')
   * @param {Object} providerConfig - 提供商配置
   */
  registerProvider(providerId, providerConfig) {
    this.providers.set(providerId, {
      id: providerId,
      name: providerConfig.name,
      class: providerConfig.class,
      services: new Map()
    });

    // 自动注册该提供商的所有服务
    if (providerConfig.services) {
      providerConfig.services.forEach(serviceConfig => {
        this.registerService(providerId, serviceConfig);
      });
    }
  }

  /**
   * 注册服务
   * @param {string} providerId - 提供商ID
   * @param {Object} serviceConfig - 服务配置
   */
  registerService(providerId, serviceConfig) {
    const serviceKey = `${providerId}:${serviceConfig.type}`;
    const provider = this.providers.get(providerId);

    if (!provider) {
      throw new Error(`Provider ${providerId} not registered`);
    }

    provider.services.set(serviceConfig.type, {
      type: serviceConfig.type,
      class: serviceConfig.class,
      config: serviceConfig.config || {}
    });

    this.services.set(serviceKey, {
      provider: providerId,
      type: serviceConfig.type,
      class: serviceConfig.class,
      config: serviceConfig.config || {}
    });
  }

  /**
   * 获取服务实例
   * @param {string} providerId - 提供商ID
   * @param {string} serviceType - 服务类型
   * @returns {Object} 服务实例
   */
  getService(providerId, serviceType) {
    const serviceKey = `${providerId}:${serviceType}`;

    // 检查缓存
    if (this.instances.has(serviceKey)) {
      return this.instances.get(serviceKey);
    }

    // 获取服务配置
    const serviceConfig = this.services.get(serviceKey);
    if (!serviceConfig) {
      throw new Error(`Service ${serviceKey} not found`);
    }

    // 创建实例
    const ServiceClass = serviceConfig.class;
    const instance = new ServiceClass(serviceConfig.config);

    // 缓存实例
    this.instances.set(serviceKey, instance);
    return instance;
  }

  /**
   * 扫描并自动注册提供商
   */
  async autoRegister() {
    const providerRegistry = require('../config/provider-registry.json');

    for (const [providerId, config] of Object.entries(providerRegistry.providers)) {
      // 动态加载提供商类
      const ProviderClass = require(`../providers/${providerId}/${config.classFile}`);

      // 注册提供商
      this.registerProvider(providerId, {
        name: config.name,
        class: ProviderClass,
        services: config.services || []
      });
    }

    console.log(`✅ 已注册 ${this.providers.size} 个提供商`);
    console.log(`✅ 已注册 ${this.services.size} 个服务`);
  }
}
```

### **2. ConfigManager (配置管理器)**

```javascript
/**
 * 统一配置管理器
 */
class ConfigManager {
  constructor() {
    this.envConfig = null;
    this.serviceConfig = null;
    this.providerConfig = null;
    this.voiceConfig = null;
  }

  /**
   * 加载所有配置
   */
  async loadAll() {
    // 1. 加载环境变量
    this.loadEnvConfig();

    // 2. 加载服务配置
    this.serviceConfig = await this.loadJson('config/service-config.json');

    // 3. 加载提供商配置
    this.providerConfig = await this.loadJson('config/provider-config.json');

    // 4. 加载音色配置
    this.voiceConfig = await this.loadJson('config/voiceIdMapping.json');

    console.log('✅ 所有配置加载完成');
  }

  /**
   * 获取提供商配置
   * @param {string} providerId - 提供商ID
   * @returns {Object} 配置对象
   */
  getProviderConfig(providerId) {
    const provider = this.providerConfig.providers[providerId];

    if (!provider) {
      throw new Error(`Provider ${providerId} not found in config`);
    }

    // 合并环境变量
    return {
      ...provider,
      credentials: this.getCredentials(providerId)
    };
  }

  /**
   * 获取凭证信息
   * @param {string} providerId - 提供商ID
   * @returns {Object} 凭证对象
   */
  getCredentials(providerId) {
    const envKeys = this.serviceConfig.credentials[providerId];

    if (!envKeys) {
      return {};
    }

    const credentials = {};
    for (const [key, envVar] of Object.entries(envKeys)) {
      credentials[key] = process.env[envVar];
    }

    return credentials;
  }
}
```

### **3. 简化后的 ServiceFactory**

```javascript
/**
 * 简化后的服务工厂 - 只负责创建
 */
class ServiceFactory {
  constructor() {
    this.registry = serviceRegistry;
    this.configManager = configManager;
  }

  /**
   * 创建服务 (简化版)
   * @param {string} providerId - 提供商ID
   * @param {string} serviceType - 服务类型
   * @returns {Object} 服务实例
   */
  createService(providerId, serviceType) {
    return this.registry.getService(providerId, serviceType);
  }
}
```

### **4. Provider 插件示例**

```javascript
/**
 * 阿里云提供商插件
 */
class AliyunProvider {
  static id = 'aliyun';
  static name = '阿里云';

  constructor(config) {
    this.config = config;
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint;
  }

  /**
   * 获取支持的服务
   */
  static getServices() {
    return [
      {
        type: 'cosyvoice',
        class: require('./CosyVoiceService'),
        config: { model: 'cosyvoice-v2' }
      },
      {
        type: 'qwen',
        class: require('./QwenService'),
        config: { model: 'qwen-tts' }
      },
      {
        type: 'qwen_http',
        class: require('./QwenService'),
        config: { model: 'qwen3-tts-flash' }
      }
    ];
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.endpoint}/health`);
      return { status: 'healthy', latency: response.headers.get('x-latency') };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }
}

module.exports = AliyunProvider;
```

---

## 📝 配置文件设计

### **provider-registry.json (提供商注册表)**

```json
{
  "version": 1,
  "providers": {
    "aliyun": {
      "name": "阿里云",
      "classFile": "AliyunProvider.js",
      "services": [
        { "type": "cosyvoice", "classFile": "CosyVoiceService.js" },
        { "type": "qwen", "classFile": "QwenService.js" },
        { "type": "qwen_http", "classFile": "QwenService.js" }
      ]
    },
    "tencent": {
      "name": "腾讯云",
      "classFile": "TencentProvider.js",
      "services": [
        { "type": "tts", "classFile": "TencentTtsService.js" }
      ]
    },
    "volcengine": {
      "name": "火山引擎",
      "classFile": "VolcengineProvider.js",
      "services": [
        { "type": "http", "classFile": "VolcengineTtsService.js" },
        { "type": "ws", "classFile": "VolcengineTtsWsService.js" }
      ]
    },
    "minimax": {
      "name": "MiniMax",
      "classFile": "MiniMaxProvider.js",
      "services": [
        { "type": "tts", "classFile": "MiniMaxTtsService.js" }
      ]
    }
  }
}
```

### **service-config.json (服务配置)**

```json
{
  "version": 1,
  "credentials": {
    "aliyun": {
      "apiKey": "QWEN_API_KEY"
    },
    "tencent": {
      "secretId": "TENCENTCLOUD_SECRET_ID",
      "secretKey": "TENCENTCLOUD_SECRET_KEY"
    },
    "volcengine": {
      "appId": "VOLCENGINE_APP_ID",
      "token": "VOLCENGINE_TOKEN"
    },
    "minimax": {
      "apiKey": "MINIMAX_API_KEY"
    }
  },
  "defaults": {
    "timeout": 30000,
    "maxRetries": 3
  }
}
```

---

## 🚀 添加新服务商的步骤

### **之前 (需要修改多处代码)**
1. 修改 `TtsFactory.js` 的 switch-case
2. 修改 `TtsFactory.loadConfigs()`
3. 修改 `TtsFactory.getAvailableProviders()`
4. 创建服务文件
5. 更新 `.env` 示例

### **之后 (只需 3 步)**

**步骤 1**: 创建提供商插件
```javascript
// src/modules/tts/providers/newprovider/NewProvider.js
class NewProvider {
  static id = 'newprovider';
  static name = '新服务商';

  static getServices() {
    return [
      { type: 'tts', class: NewTtsService }
    ];
  }
}
module.exports = NewProvider;
```

**步骤 2**: 注册提供商
```json
// config/provider-registry.json
{
  "providers": {
    "newprovider": {
      "name": "新服务商",
      "classFile": "NewProvider.js",
      "services": [
        { "type": "tts", "classFile": "NewTtsService.js" }
      ]
    }
  }
}
```

**步骤 3**: 配置环境变量
```bash
# .env
NEWPROVIDER_API_KEY=your-api-key
```

✅ 完成！无需修改任何核心代码。

---

## 📊 对比总结

| 维度 | 当前架构 | 优化后架构 |
|------|---------|-----------|
| 添加新服务商 | 修改 5+ 处代码 | 只需 3 步，零代码修改 |
| 配置管理 | 分散在 4 个地方 | 统一在 ConfigManager |
| 职责分离 | Factory 和 Manager 职责重叠 | 各司其职 |
| 可测试性 | 难以单独测试组件 | 每个组件独立可测 |
| 可维护性 | 大量硬编码 switch-case | 配置驱动，自动注册 |
| 扩展性 | 手动注册服务 | 插件化自动注册 |

---

## 🎯 实施建议

### **阶段 1: 准备工作**
- [ ] 创建新的目录结构
- [ ] 编写 ServiceRegistry
- [ ] 编写 ConfigManager
- [ ] 设计配置文件格式

### **阶段 2: 重构核心**
- [ ] 重构 TtsFactory (简化)
- [ ] 重构 TtsServiceManager (职责分离)
- [ ] 提取 CircuitBreaker 和 RateLimiter

### **阶段 3: 迁移服务商**
- [ ] 迁移 Aliyun
- [ ] 迁移 Tencent
- [ ] 迁移 Volcengine
- [ ] 迁移 MiniMax

### **阶段 4: 测试和优化**
- [ ] 单元测试
- [ ] 集成测试
- [ ] 性能测试
- [ ] 文档更新

---

## 💬 结论

这个重构方案将**大幅简化**服务商管理，使系统更加：
- **模块化** - 每个组件职责单一
- **可扩展** - 添加新服务商无需改核心代码
- **可维护** - 配置统一，结构清晰
- **可测试** - 每个组件独立可测

建议分阶段实施，先搭建新架构，再逐步迁移现有服务商。
