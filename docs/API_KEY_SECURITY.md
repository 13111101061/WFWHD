# API密钥安全使用指南

## ⚠️ 重要安全警告

**禁止通过查询参数传递API密钥！**

出于安全考虑，本系统已禁用通过URL查询参数传递API密钥的功能。

## 🚫 错误示例（已禁用）

```bash
# ❌ 这些方式已被禁用，会导致认证失败
GET /api/tts/synthesize?apiKey=your_api_key_here
POST /api/audio/upload?apiKey=your_api_key_here
```

## ✅ 正确的API密钥使用方式

### 1. 通过请求头传递（推荐）

```bash
# 使用 X-API-Key 头部
curl -X POST http://localhost:3000/api/tts/synthesize \
  -H "X-API-Key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world"}'
```

```javascript
// JavaScript/Node.js 示例
const axios = require('axios');

const response = await axios.post('http://localhost:3000/api/tts/synthesize', {
  text: 'Hello world'
}, {
  headers: {
    'X-API-Key': 'your_api_key_here',
    'Content-Type': 'application/json'
  }
});
```

### 2. 通过Authorization Bearer（标准方式）

```bash
# 使用 Authorization Bearer
curl -X POST http://localhost:3000/api/tts/synthesize \
  -H "Authorization: Bearer your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world"}'
```

```javascript
// JavaScript/Node.js 示例
const response = await axios.post('http://localhost:3000/api/tts/synthesize', {
  text: 'Hello world'
}, {
  headers: {
    'Authorization': 'Bearer your_api_key_here',
    'Content-Type': 'application/json'
  }
});
```

### 3. 通过自定义头部（兼容方式）

```bash
# 使用 X-Service-Key 头部
curl -X POST http://localhost:3000/api/tts/synthesize \
  -H "X-Service-Key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world"}'
```

## 🔒 安全最佳实践

### 1. API密钥存储
- 将API密钥存储在环境变量中，不要硬编码在代码里
- 使用密钥管理服务（如AWS Secrets Manager、Azure Key Vault等）
- 定期轮换API密钥

### 2. 传输安全
- 始终使用HTTPS协议传输API密钥
- 在生产环境中确保SSL/TLS配置正确
- 避免在不安全的网络环境中传输密钥

### 3. 客户端安全
- 不要在前端JavaScript中暴露API密钥
- 使用代理服务器来保护API密钥
- 实施适当的访问控制和权限管理

### 4. 日志和监控
- 系统会自动记录API密钥使用情况
- 监控异常的API调用模式
- 定期审查API访问日志

## 🛠️ 开发环境配置

在 `.env` 文件中配置API密钥：

```bash
# API密钥配置
API_KEYS=key1:key2:key3
SECRET_KEY=your_secret_key_here

# 开发环境设置
NODE_ENV=development
```

## 📞 技术支持

如果在使用过程中遇到问题，请：

1. 检查API密钥是否正确传递
2. 确认使用的是正确的认证方式
3. 查看服务器日志获取详细错误信息
4. 联系系统管理员获取帮助

---

**更新时间**: 2024年
**版本**: 1.0.1