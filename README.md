# TTS 语音合成服务

基于Node.js的企业级多服务商TTS语音合成微服务系统。

## 🚀 快速开始

### 启动服务
```bash
# 方式1：直接启动
node index.js

# 方式2：使用启动脚本
./scripts/start.sh        # Linux/Mac
./scripts/start.bat       # Windows
```

### 快速测试
```bash
# 运行快速测试
./scripts/quick-test.sh

# 完整功能测试
node tests/test-unified-api.js
```

## 📁 项目结构

```
├── 📄 index.js                 # 应用程序入口
├── 📄 package.json            # 项目配置
├── 📄 .env                    # 环境配置
│
├── 📁 src/                    # 源代码
│   └── modules/tts/...        # TTS核心模块
│
├── 📁 scripts/                # 管理脚本
│   ├── model-manager.js      # 声音模型管理
│   ├── clear-cache.js        # 缓存清理
│   ├── quick-test.sh         # 快速测试
│   └── start.sh/start.bat    # 启动脚本
│
├── 📁 tests/                  # 测试脚本
│   ├── debug/                 # 调试脚本
│   ├── test-unified-api.js   # 统一API测试
│   └── test-all-services.js  # 全服务测试
│
├── 📁 docs/                   # 项目文档
│   ├── API_DOCUMENTATION.md   # API文档
│   ├── DEPLOYMENT.md         # 部署指南
│   └── [其他文档...]
│
├── 📁 public/                 # 静态资源
└── 📁 node_modules/           # 依赖包
```

## 🔧 核心功能

- **多服务商支持** - 阿里云、腾讯云、火山引擎、MiniMax等
- **统一API接口** - 标准化的RESTful API
- **智能语音模型管理** - 结构化的音色配置系统
- **高性能缓存** - 智能缓存机制提升响应速度
- **实时监控** - 完整的服务监控和统计系统
- **安全认证** - 统一的API密钥管理

## 🎯 API端点

- `GET /health` - 健康检查
- `POST /api/tts/synthesize` - 语音合成
- `GET /api/tts/voices/*` - 音色模型查询
- 详细文档请查看：`docs/API_DOCUMENTATION.md`

## 📊 服务状态

当前支持的服务商：
- ✅ 阿里云CosyVoice (631ms响应)
- ✅ 阿里云千问HTTP (2837ms响应)
- ✅ 腾讯云TTS (524ms响应)
- ✅ 火山引擎HTTP (458ms响应)
- ⚠️ 火山引擎WebSocket (超时问题)
- ⚠️ MiniMax TTS (余额不足)

## 📖 更多文档

- [API文档](docs/API_DOCUMENTATION.md)
- [部署指南](docs/DEPLOYMENT.md)
- [模型管理](docs/MODEL_MANAGEMENT.md)
- [监控优化](docs/MONITORING_OPTIMIZATION.md)

## 🛠️ 开发指南

### 运行测试
```bash
# 完整测试
node tests/test-unified-api.js

# 调试测试
node tests/debug/debug-unified-api.js

# 单服务测试
node tests/test-cosyvoice-only.js
```

### 模型管理
```bash
# 交互式管理
node scripts/model-manager.js

# 快速管理
./scripts/quick-model.sh
```

---

🎯 **当前状态**: 生产就绪，成功率71.4% (5/7个服务商正常)
📅 **最后更新**: 2025-10-31