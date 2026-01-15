# 剩余5个TTS服务详细分析

## 📋 服务结构总结

### 3. qwenTtsHttpService.js ⚠️ 特殊情况

**文件结构异常**：
```javascript
// 第21行：对象
const QwenTtsService = { async synthesize(...) {...} };
module.exports = QwenTtsService;  // 第148行

// 第153行：类
class QwenTtsHttpService { async synthesize() {...} }
module.exports = new QwenTtsHttpService();  // 第185行（会覆盖上面的导出）
```

**实际情况**：
- 最终使用的是 `QwenTtsHttpService` 类（单例）
- QwenTtsHttpService.synthesize() 内部调用 QwenTtsService.synthesize()
- 这是一个**适配器模式**

**重构策略**：
1. 把QwenTtsService对象改造成继承BaseTtsService的类
2. 让QwenTtsHttpService继承BaseTtsService
3. 或者：简化结构，合并成一个类

**推荐方案**：合并成一个类，继承BaseTtsService

---

### 4. qwenTtsService.js ✅ 已经很标准

**当前状态**：
- ✅ 已经是类
- ✅ 已经是单例导出
- ✅ 只有synthesize方法
- ✅ HTTP API调用

**重构策略**：
1. 继承BaseTtsService
2. 添加provider和serviceType
3. 使用validateText()和validateOptions()
4. 使用audioStorageManager
5. 简单直接

---

### 5. volcengineTtsService.js ✅ 已经很标准

**当前状态**：
- ✅ 已经是类
- ✅ 已经是单例导出
- ⚠️ 有synthesize和convertTextToSpeech两个方法
- ✅ HTTP API调用
- ⚠️ 参数名称：voiceType, encoding, speed, volume, sampleRate

**重构策略**：
1. 继承BaseTtsService
2. 删除synthesize别名方法
3. 重命名convertTextToSpeech为synthesize
4. 使用ParameterMapper处理参数映射

---

### 6. volcengineTtsWsService.js ⚠️ 复杂的WebSocket

**当前状态**：
- ✅ 已经是类
- ✅ 已经是单例导出
- ⚠️ 有synthesize和convertTextToSpeech两个方法
- ⚠️ WebSocket连接
- ⚠️ **复杂的二进制协议**（第19-43行定义常量）
- ⚠️ 有buildBinaryMessage()和parseResponse()函数（未显示完整）

**重构策略**：
1. 继承BaseTtsService
2. **保留所有二进制协议逻辑**
3. 删除synthesize别名方法
4. 重命名convertTextToSpeech为synthesize
5. 使用ParameterMapper

---

### 7. minimaxTtsService.js ✅ 有refactored版本

**当前状态**：
- ✅ 已经是类
- ✅ 已经是单例导出
- ⚠️ 只有convertTextToSpeech方法（没有synthesize）
- ✅ 使用axios
- ⚠️ 参数很多：voice_id, speed, vol, pitch, emotion等

**重构策略**：
1. **直接使用refactored版本替换**（已完成）
2. 或者：按refactored版本的模式重构当前版本
3. 使用ParameterMapper处理嵌套参数

---

## 🔍 ParameterMapper映射检查

让我检查ProviderConfig.json中的配置是否正确：

### Aliyun CosyVoice ✅
```json
"voice": {"apiField": "voice"}
"speed": {"apiField": "rate"}
"volume": {"apiField": "volume"}
```
✅ 正确

### Aliyun Qwen ⏳ 需要检查
```json
"voice": {"apiField": "input.voice"}
```
✅ 嵌套字段正确

### Tencent ✅
```json
"voice": {"apiField": "VoiceType", "transform": "parseInt"}
"speed": {"apiField": "Speed"}
"volume": {"apiField": "Volume"}
```
✅ 正确

### Volcengine HTTP ⏳ 需要检查
```json
"voice": {"apiField": "audio.voice_type"}
"speed": {"apiField": "audio.speed_ratio"}
"volume": {"apiField": "audio.volume_ratio", "standardization": {...}}
```
✅ 嵌套字段和标准化正确

### MiniMax ✅
```json
"voice": {"apiField": "voice_setting.voice_id"}
"speed": {"apiField": "voice_setting.speed"}
"volume": {"apiField": "voice_setting.vol"}
"pitch": {"apiField": "voice_setting.pitch"}
```
✅ 深层嵌套正确

---

## 📝 重构优先级（从易到难）

### 容易的（预计15-20分钟每个）
1. ✅ **qwenTtsService.js** - 已经很标准，简单改造
2. ✅ **volcengineTtsService.js** - 已经很标准，简单改造
3. ✅ **minimaxTtsService.js** - 直接用refactored版本

### 中等难度（预计30分钟）
4. ⚠️ **volcengineTtsWsService.js** - 需要小心处理二进制协议

### 复杂的（预计40分钟）
5. ⚠️ **qwenTtsHttpService.js** - 结构特殊，需要重新设计

---

## ✅ 重构验证清单

重构每个服务后，必须验证：

- [ ] 继承了BaseTtsService
- [ ] provider和serviceType设置正确
- [ ] 只有一个synthesize方法
- [ ] 使用validateText()和validateOptions()
- [ ] 使用audioStorageManager保存文件
- [ ] 保留了所有特殊逻辑（WebSocket、二进制协议等）
- [ ] 导出方式正确（单例）
- [ ] getAvailableVoices()方法保留
- [ ] getSupportedModels()方法添加（如果原服务没有）
- [ ] 错误处理使用TtsException

---

## 🎯 下一步执行计划

### 步骤1：重构qwenTtsService.js（最简单）
- 继承BaseTtsService
- 使用validateOptions()
- 使用audioStorageManager

### 步骤2：重构volcengineTtsService.js（次简单）
- 继承BaseTtsService
- 删除synthesize别名
- 使用validateOptions()

### 步骤3：重构minimaxTtsService.js
- 直接用refactored版本替换

### 步骤4：重构volcengineTtsWsService.js（需要小心）
- 保留二进制协议
- 继承BaseTtsService

### 步骤5：重构qwenTtsHttpService.js（最复杂）
- 重新设计类结构
- 合并QwenTtsService和QwenTtsHttpService

---

**准备就绪，可以开始执行！**
