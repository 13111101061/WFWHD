# ADR-003: 依赖注入模式

## 状态
已通过 (Accepted)

## 背景

当前系统使用模块级单例导入，导致隐藏依赖：

```javascript
// 问题：隐藏依赖，难以测试
const { ttsFactory } = require('./TtsFactory');
const { voiceManager } = require('./VoiceManager');

class TtsServiceManager {
  constructor() {
    this.factory = ttsFactory;  // 硬编码依赖
  }
}
```

问题：
1. 无法注入mock进行单元测试
2. 依赖关系不透明
3. 初始化顺序难以控制
4. 无法实现运行时配置

## 决策

采用构造函数注入模式，通过服务容器管理依赖：

### 1. 定义依赖接口

```javascript
class TtsSynthesisService {
  constructor({ ttsProvider, voiceCatalog, validator }) {
    this.ttsProvider = ttsProvider;
    this.voiceCatalog = voiceCatalog;
    this.validator = validator;
  }
}
```

### 2. 创建服务容器

```javascript
// ServiceContainer.js
class ServiceContainer {
  async initialize() {
    const validationService = new TtsValidationService();

    const synthesisService = new TtsSynthesisService({
      ttsProvider: ttsProviderAdapter,
      voiceCatalog: voiceCatalogAdapter,
      validator: validationService
    });

    this._services.set('synthesisService', synthesisService);
  }

  get(name) {
    return this._services.get(name);
  }
}
```

### 3. 使用依赖

```javascript
const container = require('./ServiceContainer');
await container.initialize();

const service = container.get('synthesisService');
```

## 后果

### 正面
- 依赖关系透明
- 易于单元测试（可注入mock）
- 支持运行时配置
- 更好的关注点分离

### 负面
- 需要管理服务容器
- 增加了初始化复杂度
- 需要团队理解DI模式

## 测试示例

```javascript
// 测试时可注入mock
const mockProvider = {
  synthesize: sinon.stub().resolves({ audioUrl: 'test.mp3' })
};

const service = new TtsSynthesisService({
  ttsProvider: mockProvider,
  voiceCatalog: mockCatalog,
  validator: new TtsValidationService()
});

const result = await service.synthesize(request);
expect(mockProvider.synthesize.calledOnce).to.be.true;
```

## 参与者

- 决策者: Claude (Evolutionary Architecture Refactorer)
- 日期: 2026-03-10