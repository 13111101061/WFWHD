# 测试脚本目录

本目录包含所有的测试和调试脚本，按功能分类存放。

## 目录结构

```
tests/
├── debug/                     # 调试脚本
│   ├── debug-service-chain.js   # 调试服务管理器调用链
│   ├── debug-tts.js            # TTS服务调试
│   └── debug-unified-api.js    # 统一API调试
├── test-all-services.js       # 测试所有TTS服务
├── test-unified-api.js        # 测试统一API端点
├── test-cosyvoice-only.js     # 测试CosyVoice服务
├── test-minimax-only.js       # 测试MiniMax服务
├── test-volcengine-only.js    # 测试火山引擎服务
├── test-long-text.js          # 测试长文本音频生成
├── test-audio-storage.js      # 测试音频存储系统
├── test-new-auth.js           # 测试新的认证系统
├── test-tts-api.js            # 测试TTS API接口
├── test-new-tts-framework.js  # 测试新的TTS框架
├── test-providers.js          # 测试服务提供商
├── test-unified-monitoring.js # 测试统一监控系统
├── quick-test-tts.js          # 快速TTS测试
├── minimax-tts.test.js        # MiniMax TTS测试用例
└── README.md                  # 本文件
```

## 使用方式

### 运行所有服务测试
```bash
node tests/test-all-services.js
```

### 运行统一API测试
```bash
node tests/test-unified-api.js
```

### 运行调试脚本
```bash
node tests/debug/debug-service-chain.js
node tests/debug/debug-unified-api.js
```

### 单个服务测试
```bash
node tests/test-cosyvoice-only.js     # CosyVoice
node tests/test-minimax-only.js       # MiniMax
node tests/test-volcengine-only.js    # 火山引擎
```

### 快速测试
```bash
node tests/quick-test-tts.js
```

## 注意事项

1. **服务器状态**: 确保TTS服务器正在运行 (`node index.js`)
2. **API密钥**: 确保在`.env`文件中配置了正确的API密钥
3. **网络连接**: 确保可以访问各个TTS服务商的API端点
4. **权限**: 某些脚本可能需要管理员权限

## 脚本分类

### 核心测试
- `test-unified-api.js` - 统一API完整测试（推荐）
- `test-all-services.js` - 所有服务直接测试
- `test-new-tts-framework.js` - 新框架测试

### 单服务测试
- `test-cosyvoice-only.js` - 阿里云CosyVoice
- `test-minimax-only.js` - MiniMax TTS
- `test-volcengine-only.js` - 火山引擎TTS

### 调试工具
- `debug/service-chain.js` - 服务调用链调试
- `debug/unified-api.js` - 统一API调试
- `debug/tts.js` - TTS服务调试

### 功能测试
- `test-long-text.js` - 长文本处理
- `test-audio-storage.js` - 音频文件存储
- `test-new-auth.js` - 认证系统

## 故障排除

如果测试失败，请检查：
1. 服务器是否正常启动
2. API密钥是否配置正确
3. 网络连接是否正常
4. 服务商配额是否充足

更多详细信息请参考各脚本文件中的注释。