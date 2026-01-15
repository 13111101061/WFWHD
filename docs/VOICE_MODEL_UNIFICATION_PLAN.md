# 🎯 音色模型统一化方案

## 📊 当前状况

### ✅ 已统一（CosyVoice）
- 存储位置: `voiceModels.json`
- 结构化数据: 完整的模型信息
- 支持: 分类、标签、多语言等

### ❌ 未统一（其他5个服务）
- MiniMax: 硬编码在服务文件中
- 腾讯云: 硬编码在服务文件中
- 火山引擎: 硬编码在服务文件中（2个文件重复）
- 千问TTS: 硬编码在服务文件中

## 🎯 统一化步骤

### 第1步: 扩展 voiceModels.json
```json
{
  "models": [
    // 现有的CosyVoice模型...
    {
      "id": "minimax-female-1",
      "name": "中文女声1",
      "provider": "minimax",
      "service": "tts",
      "voiceId": "moss_audio_ce44fc67-7ce3-11f0-8de5-96e35d26fb85",
      "gender": "female",
      "languages": ["zh-CN"],
      // ... 其他字段
    },
    {
      "id": "tencent-101001",
      "name": "亲亲",
      "provider": "tencent",
      "service": "tts",
      "voiceId": "101001",
      "gender": "female",
      "languages": ["zh-CN"],
      // ... 其他字段
    }
    // ... 其他模型
  ]
}
```

### 第2步: 修改各服务文件
```javascript
// 统一的音色获取方式
async getAvailableVoices() {
  const models = voiceModelRegistry.getModelsByProvider(this.provider);
  return models.map(model => ({
    id: model.voiceId,
    name: model.name,
    gender: model.gender,
    language: model.languages?.[0] || 'zh-CN'
  }));
}
```

### 第3步: 验证和测试
- 确保所有服务音色都能正常加载
- API `/api/tts/voices` 返回完整列表
- 各服务的TTS合成功能正常

## 🎉 预期收益

1. **统一管理**: 所有音色在一个地方管理
2. **维护简单**: 添加新音色只需要修改JSON文件
3. **查询方便**: 支持按提供商、语言、性别等筛选
4. **扩展性强**: 容易添加新的音色属性
5. **一致性**: 所有服务使用相同的数据格式

## 📝 实施注意事项

1. **保留向后兼容**: 确保现有API不破坏
2. **测试覆盖**: 每个服务的音色都要测试
3. **文档更新**: 更新API文档和音色说明
4. **备份**: 实施前备份现有配置