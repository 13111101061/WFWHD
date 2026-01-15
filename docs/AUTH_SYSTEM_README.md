# 🛡️ 新认证系统说明

## 📋 概述

原有的认证系统存在多套认证机制混合使用的问题，现已重写为**统一的微服务认证系统**，专为微服务节点设计。

## ✨ 主要特性

- 🎯 **专为微服务设计** - 去除复杂用户系统，专注服务认证
- 🔑 **统一的API密钥管理** - 支持动态生成、权限控制、速率限制
- 📊 **实时监控和审计** - 完整的认证事件追踪
- 🚀 **高性能** - 内存存储 + 缓存机制
- 🔧 **易于扩展** - 模块化设计，支持水平扩展

## 🏗️ 架构组成

### 核心组件

1. **ApiKeyService** (`src/core/auth/ApiKeyService.js`)
   - API密钥的生成、验证、管理
   - 支持静态和动态密钥
   - 服务级别权限控制

2. **UnifiedAuthMiddleware** (`src/core/middleware/apiKeyMiddleware.js`)
   - 统一的认证中间件
   - 速率限制保护
   - 请求追踪和审计

3. **AuthMonitor** (`src/core/monitoring/AuthMonitor.js`)
   - 实时监控认证事件
   - 异常检测
   - 性能指标收集

## 🔑 API密钥使用

### 1. 环境变量配置

在 `.env` 文件中配置默认API密钥：

```env
API_KEYS=sk_admin_key_123,sk_service_key_456
```

### 2. 请求方式

支持多种方式传递API密钥：

```bash
# 方式1: 请求头 (推荐)
curl -H "X-API-Key: your-api-key" http://localhost:3000/api/tts

# 方式2: Authorization Bearer
curl -H "Authorization: Bearer your-api-key" http://localhost:3000/api/tts

# 方式3: 查询参数 (不推荐生产环境)
curl "http://localhost:3000/api/tts?apiKey=your-api-key"
```

### 3. 动态生成密钥

```javascript
// 管理员权限下生成新密钥
POST /api/auth/keys
{
  "services": ["tts", "unified-tts"],
  "permissions": ["tts.access"],
  "description": "服务专用密钥",
  "expiresIn": 86400000 // 24小时
}
```

## 🛡️ 权限系统

### 权限级别

- `full` / `admin` - 管理员权限，可访问所有功能
- `tts.access` - TTS服务访问权限
- `storage.access` - 文件存储访问权限
- `monitoring.access` - 监控信息访问权限

### 服务级别控制

API密钥可以限制只能访问特定服务：

```javascript
// 只能访问TTS服务
{
  "services": ["tts", "unified-tts", "qwen-tts"],
  "permissions": ["tts.access"]
}

// 只能访问存储服务
{
  "services": ["snpan"],
  "permissions": ["storage.access"]
}
```

## 📊 监控端点

### 1. 认证统计

```bash
GET /api/auth/stats
Authorization: Bearer admin-api-key
```

返回：
- 密钥使用统计
- 实时认证指标
- 最近认证事件

### 2. 密钥管理

```bash
# 获取所有密钥列表
GET /api/auth/keys

# 生成新密钥
POST /api/auth/keys

# 撤销密钥
DELETE /api/auth/keys/:keyId
```

## 🚦 速率限制

### 默认配置

- **default**: 100请求/分钟
- **premium**: 1000请求/分钟
- **admin**: 10000请求/分钟

### 响应头

成功请求会返回速率限制信息：

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

超出限制时返回 429 状态码。

## 🧪 测试

运行测试脚本验证认证系统：

```bash
node test-new-auth.js
```

测试内容包括：
- ✅ 健康检查（无需认证）
- ✅ 未认证请求拒绝
- ✅ 无效密钥拒绝
- ✅ 有效密钥通过
- ✅ 密钥生成和使用
- ✅ 监控端点访问

## 🔄 迁移指南

### 从旧系统迁移

1. **备份现有配置**
   ```bash
   cp src/core/middleware/apiKeyMiddleware.js.backup
   cp src/shared/middleware/authMiddleware.js.backup
   ```

2. **更新环境变量**
   ```env
   # 保持原有的API_KEYS配置
   API_KEYS=your-existing-keys
   ```

3. **更新客户端代码**
   ```javascript
   // 旧方式
   headers: { 'x-api-key': key }

   // 新方式 (保持兼容)
   headers: { 'X-API-Key': key }
   // 或者
   headers: { 'Authorization': `Bearer ${key}` }
   ```

## 🚨 安全注意事项

1. **密钥保护**
   - 不要在客户端代码中硬编码密钥
   - 使用HTTPS传输
   - 定期轮换密钥

2. **权限最小化**
   - 只授予必要的权限
   - 限制密钥可访问的服务
   - 设置合理的过期时间

3. **监控异常**
   - 关注认证失败率
   - 监控异常IP访问
   - 及时撤销可疑密钥

## 🛠️ 故障排除

### 常见问题

1. **认证失败**
   - 检查API密钥是否正确
   - 确认密钥权限是否足够
   - 查看服务是否在允许列表中

2. **速率限制**
   - 检查请求频率
   - 考虑升级到高级别限制
   - 实现客户端重试机制

3. **监控数据异常**
   - 检查内存使用情况
   - 重启服务清理缓存
   - 查看错误日志

## 📞 支持

如有问题，请检查：
1. 控制台日志输出
2. `/api/auth/stats` 监控数据
3. 运行 `node test-new-auth.js` 诊断脚本