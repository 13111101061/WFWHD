# TTS服务重构策略

## 📋 重构原则

### ✅ 必须遵守
1. **保持功能不变** - 重构后所有API调用必须正常工作
2. **保留特殊逻辑** - 每个服务的特殊处理（签名、WebSocket等）必须保留
3. **参数映射正确** - 使用ParameterMapper后，参数要正确映射到API字段
4. **错误处理统一** - 使用TtsException统一错误处理
5. **存储管理统一** - 使用audioStorageManager统一文件保存

### ⚠️ 特别注意
- **qwenTtsHttpService** - 是对象不是类，需要改造成类
- **WebSocket服务** - cosyVoice、volcengineTtsWs、qwenTts (WebSocket)
- **签名算法** - tencent需要TC3-HMAC-SHA256签名，volcengine也需要签名
- **参数映射** - 每个服务的参数名不同，ParameterMapper要正确配置

---

## 🔍 每个服务的特殊点

### 1. cosyVoiceService.js ✅ 已完成
- **特殊点**: WebSocket连接，有智能超时机制
- **参数**: voice, rate, volume, pitch, format, sample_rate
- **映射**: rate → rate (直接), volume → volume (直接)
- **状态**: ✅ 已重构完成

### 2. tencentTtsService.js ✅ 已完成
- **特殊点**: TC3-HMAC-SHA256签名算法，复杂加密逻辑
- **参数**: voiceType, Speed, Volume, SampleRate, Codec
- **映射**: voice → VoiceType (parseInt), speed → Speed, volume → Volume
- **状态**: ✅ 已重构完成

### 3. qwenTtsHttpService.js ⏳ 待重构
- **特殊点**:
  - ❌ **是对象不是类** - `const QwenTtsService = { ... }`
  - HTTP API调用（不是WebSocket）
  - 下载音频URL
- **参数**: voice, model, text
- **映射**: voice → input.voice, model → model
- **需要改动**:
  1. 改为class
  2. 继承BaseTtsService
  3. 改造为单例导出

### 4. qwenTtsService.js ⏳ 待重构
- **特殊点**: WebSocket版本的Qwen
- **参数**: 类似qwenTtsHttpService
- **状态**: 需要先读取文件确认结构

### 5. volcengineTtsService.js ⏳ 待重构
- **特殊点**:
  - HTTP API调用
  - 可能需要签名算法
- **参数**: 需要读取文件确认
- **状态**: 需要先读取文件确认结构

### 6. volcengineTtsWsService.js ⏳ 待重构
- **特殊点**: WebSocket版本
- **状态**: 需要先读取文件确认结构

### 7. minimaxTtsService.js ⏳ 待重构
- **特殊点**:
  - 已经有refactored版本
  - 需要替换旧版本
- **参数**: voice_id, speed, vol, pitch, emotion
- **映射**: voice → voice_setting.voice_id, speed → voice_setting.speed
- **策略**: 直接用refactored版本替换

---

## 📝 重构检查清单

对于每个服务，重构前必须确认：

- [ ] 读取完整文件，理解所有逻辑
- [ ] 识别特殊处理（签名、WebSocket、下载等）
- [ ] 确认参数名称和API字段映射
- [ ] 确认导出方式（类/对象、单例/直接导出）
- [ ] 规划重构后的代码结构
- [ ] 确认ParameterMapper配置是否正确

对于每个服务，重构后必须验证：

- [ ] 继承了BaseTtsService
- [ ] 只有一个synthesize方法
- [ ] 使用validateText()和validateOptions()
- [ ] 使用audioStorageManager保存文件
- [ ] 使用TtsException统一错误处理
- [ ] 保留了所有特殊逻辑（签名、WebSocket等）
- [ ] 导出方式正确（单例）
- [ ] getAvailableVoices()方法保留
- [ ] getSupportedModels()方法添加

---

## 🎯 下一步行动

### 立即执行
1. **暂停重构** - 先把剩余5个服务都仔细读一遍
2. **记录特殊点** - 把每个服务的特殊逻辑都记录下来
3. **验证ParameterMapper配置** - 确保所有服务的参数映射都正确
4. **制定详细计划** - 每个服务怎么改，改哪里

### 然后执行
5. 按计划逐个重构
6. 每个重构后立即验证
7. 发现问题及时调整

---

## ⚠️ 风险点

1. **qwenTtsHttpService** - 对象改类，可能有隐式依赖
2. **WebSocket服务** - 异步复杂，容易出错
3. **签名算法** - tencent和volcengine，不能改错
4. **参数映射** - 如果ParameterMapper配置错误，会导致API调用失败

---

## ✅ 质量保证

重构不追求数量，只追求质量：
- **宁可慢，不要错**
- **宁可多检查，不要返工**
- **功能完全一致是底线**

---

**当前状态**: 已完成2/7，暂停重新规划
**下一步**: 仔细阅读剩余5个服务的完整代码
