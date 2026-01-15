# TTS音色工厂 SDK

> 🎙️ 为TTS应用提供前端音色库管理能力的完整SDK套件

## 📦 包列表

### JavaScript SDK

| 包名 | 说明 | 状态 |
|------|------|------|
| `VoiceLibraryClient` | 前端音色库管理SDK | ✅ 已完成 |

## 🚀 快速开始

### 安装

```html
<!-- 引入SDK -->
<script src="/sdk/javascript/voices/VoiceLibraryClient.js"></script>
```

### 基础使用

```javascript
// 创建客户端实例
const client = new VoiceLibraryClient({
  apiBaseUrl: '/api',
  apiKey: 'your-api-key'
});

// 获取所有音色
const voices = await client.getVoices();

// 搜索音色
const results = await client.searchVoices('Kai');

// 按标签筛选
const cuteVoices = await client.getVoicesByTag('可爱');
```

## 📚 文档

### [VoiceLibraryClient 文档](./javascript/voices/README.md)

完整的前端音色库SDK，支持：
- ✅ 音色查询和搜索
- ✅ 多维度筛选（服务商、性别、语言、标签）
- ✅ 缓存机制
- ✅ 事件监听
- ✅ TypeScript类型支持

### [示例页面](./javascript/voices/example.html)

完整的交互式示例，展示：
- 音色列表展示
- 实时搜索
- 多条件筛选
- 统计信息
- 音色详情查看

## 🎯 功能特性

### 音色库管理
- 🔍 **智能搜索** - 支持按名称、标签、描述搜索
- 🎯 **多维筛选** - 按服务商、性别、语言、标签筛选
- 📊 **统计分析** - 音色数量、分布统计
- 💾 **智能缓存** - 5分钟本地缓存，提升性能
- 🎨 **类型安全** - 完整的TypeScript类型定义

### 开发友好
- 📖 **详细文档** - 完整的API文档和使用示例
- 🌐 **跨平台** - 支持浏览器和Node.js环境
- 🔧 **易集成** - 简单的API设计，快速上手
- 🎭 **事件驱动** - 支持事件监听和回调

## 📁 目录结构

```
sdk/
├── javascript/
│   └── voices/
│       ├── VoiceLibraryClient.js       # SDK主文件
│       ├── VoiceLibraryClient.d.ts     # TypeScript类型定义
│       ├── README.md                    # API文档
│       └── example.html                 # 示例页面
└── README.md                            # 本文件
```

## 💡 使用场景

### 1. 音色选择器组件

```javascript
const selector = new VoiceSelector('voice-selector', client);
await selector.init();
```

### 2. 智能搜索

```javascript
const search = new VoiceSearch(client);
search.on('results', (voices) => {
  console.log(`找到 ${voices.length} 个音色`);
});
```

### 3. 数据可视化

```javascript
const stats = await client.getStatistics();
renderChart(stats);
```

## 🔗 API端点

SDK依赖以下后端API端点：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/voice-models/models` | GET | 获取所有音色列表 |

## 🛠️ 开发指南

### 本地开发

1. 克隆项目
```bash
git clone <repository-url>
cd 1.0.1
```

2. 启动开发服务器
```bash
npm run dev
```

3. 访问示例页面
```
http://localhost:3000/sdk/javascript/voices/example.html
```

### 测试

```bash
# 运行测试
npm test

# 运行示例
node tests/test-multi-voices.js
```

## 📊 性能优化

### 缓存策略

SDK内置智能缓存机制：
- 默认缓存时间：5分钟
- 自动更新过期数据
- 支持手动清除缓存

```javascript
// 清除缓存
client.clearCache();

// 强制刷新
const voices = await client.getVoices({ forceRefresh: true });
```

### 请求优化

- 自动请求去重
- 请求超时控制（默认10秒）
- 错误自动重试

## 🌐 浏览器兼容性

| 浏览器 | 最低版本 | 支持状态 |
|--------|----------|----------|
| Chrome | 60+ | ✅ 完全支持 |
| Firefox | 55+ | ✅ 完全支持 |
| Safari | 12+ | ✅ 完全支持 |
| Edge | 79+ | ✅ 完全支持 |
| IE | 11 | ❌ 不支持 |

## 📝 更新日志

### v1.0.0 (2026-01-11)
- ✅ 初始版本发布
- ✅ VoiceLibraryClient SDK
- ✅ 完整的API文档
- ✅ 交互式示例页面
- ✅ TypeScript类型定义

## 🤝 贡献指南

欢迎贡献代码！

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

MIT License - 详见 [LICENSE](../../LICENSE)

## 🆘 获取帮助

- 📖 查看文档：[SDK文档](./javascript/voices/README.md)
- 💬 提交Issue：[GitHub Issues](https://github.com/your-repo/issues)
- 📧 联系邮箱：support@tts-factory.com

## 🔗 相关链接

- [主项目文档](../../CLAUDE.md)
- [API文档](../../README.md)
- [示例代码](./javascript/voices/example.html)

---

Made with ❤️ by TTS Factory Team
