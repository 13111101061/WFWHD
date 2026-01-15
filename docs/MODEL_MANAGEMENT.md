# 🎵 TTS声音模型管理手册

## 📖 概述

本手册介绍如何管理TTS系统中的声音模型，包括添加、删除、修改、批量操作等。

## 🏗️ 架构说明

### 配置文件位置
```
src/modules/tts/config/voiceModels.json
```

### 数据结构
每个模型包含以下核心信息：
- **基础信息**: ID、名称、提供商、服务类型
- **语音特征**: 性别、年龄、语言、风格
- **业务属性**: 标签、分类、使用场景、状态
- **扩展信息**: 描述、特性、版本等

## 🛠️ 管理方式

### 方式一：直接编辑配置文件

#### 添加单个模型
```json
{
  "models": [
    // ...现有模型
    {
      "id": "tencent-newvoice-v1",
      "name": "新声音",
      "provider": "tencent",
      "service": "tts",
      "model": "tts-v1",
      "voiceId": "newvoice_001",
      "category": "female",
      "gender": "female",
      "languages": ["zh-CN"],
      "age": "young",
      "style": "gentle",
      "characteristics": ["clear", "sweet"],
      "tags": ["new", "popular"],
      "description": "新的高质量女声",
      "useCases": ["storytelling", "assistant"],
      "status": "active"
    }
  ]
}
```

#### 删除模型
```json
// 直接从 models 数组中移除对应的对象
{
  "models": [
    // 保留需要的模型，删除不需要的
  ]
}
```

#### 修改模型状态
```json
// 临时禁用
{
  "id": "old-model-v1",
  "status": "inactive"
}

// 标记为已废弃
{
  "id": "deprecated-model-v1",
  "status": "deprecated"
}
```

### 方式二：使用管理脚本

#### Node.js 工具 (推荐)

```bash
# 列出所有模型
node scripts/model-manager.js list

# 显示统计信息
node scripts/model-manager.js stats

# 搜索模型
node scripts/model-manager.js search "女声"

# 添加新模型
node scripts/model-manager.js add '{"id":"test-1","name":"测试",...}'

# 删除模型
node scripts/model-manager.js remove model-id

# 更新模型状态
node scripts/model-manager.js update-status model-id deprecated

# 批量导入
node scripts/model-manager.js import models.json

# 导出到文件
node scripts/model-manager.js export backup.json

# 按提供商导出
node scripts/model-manager.js export tencent-models.json --provider=tencent
```

#### Shell 快捷工具 (Linux/macOS)

```bash
# 赋予执行权限
chmod +x scripts/quick-model.sh

# 列出模型
./scripts/quick-model.sh list

# 搜索模型
./scripts/quick-model.sh search "甜美"

# 快速添加（交互式）
./scripts/quick-model.sh add tencent "小美"

# 启用/禁用模型
./scripts/quick-model.sh enable model-id
./scripts/quick-model.sh disable model-id

# 删除模型
./scripts/quick-model.sh delete model-id

# 重新加载配置
./scripts/quick-model.sh reload

# 备份配置
./scripts/quick-model.sh backup
```

### 方式三：使用API接口

```bash
# 获取所有模型
curl -H "X-API-Key: key2" \
  http://localhost:3000/api/voice-models/models

# 按提供商筛选
curl -H "X-API-Key: key2" \
  http://localhost:3000/api/voice-models/providers/aliyun

# 按分类筛选
curl -H "X-API-Key: key2" \
  http://localhost:3000/api/voice-models/categories/female

# 搜索模型
curl -H "X-API-Key: key2" \
  "http://localhost:3000/api/voice-models/search?q=甜美"

# 获取统计信息
curl -H "X-API-Key: key2" \
  http://localhost:3000/api/voice-models/stats

# 重新加载配置
curl -X POST -H "X-API-Key: key2" \
  http://localhost:3000/api/voice-models/reload
```

## 📝 常见操作场景

### 场景1：添加新的TTS服务模型

当接入新的TTS服务时：

1. **批量添加模型**
```bash
# 创建包含所有模型的JSON文件
node scripts/model-manager.js import new-service-models.json
```

2. **逐个添加并测试**
```bash
# 逐个添加
./scripts/quick-model.sh add newprovider "模型名称"
# 测试API
curl -H "X-API-Key: key2" "http://localhost:3000/api/voice-models/models"
```

### 场景2：模型版本管理

当模型升级时：

```json
// 新版本模型
{
  "id": "cosyvoice-longxiaochun-v3",
  "name": "龙小淳 v3",
  "provider": "aliyun",
  "service": "cosyvoice",
  "model": "cosyvoice-v3",
  // ... 其他属性
}

// 禁用旧版本
{
  "id": "cosyvoice-longxiaochun-v2",
  "status": "deprecated"
}
```

### 场景3：A/B测试模型

```json
// 测试版本
{
  "id": "test-model-experimental-v1",
  "name": "实验模型",
  "tags": ["test", "experimental", "beta"],
  "status": "active"
}

// 正式版本
{
  "id": "stable-model-v1",
  "name": "稳定模型",
  "tags": ["stable", "production"],
  "status": "active"
}
```

### 场景4：按业务场景分类

```json
// 儿童故事专用
{
  "id": "children-story-v1",
  "tags": ["children", "storytelling", "gentle"],
  "useCases": ["children", "storytelling", "education"],
  "age": "young"
}

// 商务播报专用
{
  "id": "business-news-v1",
  "tags": ["business", "news", "professional"],
  "useCases": ["business", "news", "presentation"],
  "age": "adult"
}
```

## 🔄 热更新流程

修改配置后的热更新步骤：

1. **修改配置文件**
```bash
# 编辑配置
vim src/modules/tts/config/voiceModels.json
```

2. **验证JSON格式**
```bash
# 验证JSON格式
python -m json.tool src/modules/tts/config/voiceModels.json
```

3. **重新加载配置**
```bash
# 使用脚本重载
./scripts/quick-model.sh reload

# 或使用API
curl -X POST -H "X-API-Key: key2" \
  http://localhost:3000/api/voice-models/reload
```

4. **验证加载结果**
```bash
# 检查统计信息
./scripts/quick-model.sh stats

# 测试新模型
curl -H "X-API-Key: key2" \
  "http://localhost:3000/api/voice-models/models/new-model-id"
```

## 📊 监控和维护

### 定期维护任务

#### 每日检查
```bash
# 检查模型总数
./scripts/quick-model.sh stats

# 检查系统状态
curl http://localhost:3000/health
```

#### 每周维护
```bash
# 备份配置
./scripts/quick-model.sh backup

# 清理已废弃的模型
./scripts/quick-model.sh search "deprecated"

# 检查模型使用情况
# (需要结合日志统计)
```

#### 每月优化
```bash
# 导出模型配置进行版本控制
./scripts/quick-model.sh export backup/monthly-$(date +%Y%m).json

# 分析模型使用趋势
# (需要开发使用统计功能)
```

### 问题排查

#### 模型不显示
```bash
# 检查模型状态
./scripts/quick-model.sh list | grep "模型ID"

# 检查服务日志
tail -f logs/app.log | grep "VoiceModelRegistry"

# 重新加载配置
./scripts/quick-model.sh reload
```

#### 配置文件格式错误
```bash
# 验证JSON格式
python -m json.tool src/modules/tts/config/voiceModels.json

# 查看详细错误
node scripts/model-manager.js list
```

#### API调用失败
```bash
# 检查API密钥
curl -H "X-API-Key: key2" http://localhost:3000/api/voice-models/stats

# 检查服务状态
curl http://localhost:3000/health
```

## 📋 最佳实践

### 数据管理
1. **版本控制**: 将voiceModels.json纳入Git管理
2. **定期备份**: 自动化备份配置文件
3. **变更记录**: 维护模型变更日志
4. **测试环境**: 先在测试环境验证新模型

### 命名规范
- **模型ID**: `provider-service-model-version` 格式
- **标签**: 使用英文小写，多个标签用逗号分隔
- **分类**: female/male/character/child
- **状态**: active/inactive/deprecated

### 性能优化
1. **合理分组**: 避免单次加载过多模型
2. **索引优化**: 充分利用标签和分类
3. **缓存策略**: 合理设置模型信息缓存时间
4. **监控指标**: 跟踪模型调用性能

## 🆘 故障排除

### 常见问题及解决方案

**Q: 添加模型后不生效？**
A: 检查JSON格式，执行reload命令，查看服务日志

**Q: 模型搜索不到？**
A: 确认模型状态为active，检查标签和关键词匹配

**Q: 批量导入失败？**
A: 验证JSON格式，逐个检查模型数据完整性

**Q: API返回500错误？**
A: 检查服务日志，验证配置文件权限

### 联系支持
如遇到无法解决的问题，请：
1. 查看服务日志: `tail -f logs/app.log`
2. 检查配置文件格式
3. 联系技术支持团队

---

## 📚 附录

### 相关文档
- [API接口文档](./API_DOCUMENTATION.md)
- [认证系统说明](./AUTH_SYSTEM_README.md)
- [部署指南](./DEPLOYMENT.md)

### 工具下载
- Node.js管理脚本: `scripts/model-manager.js`
- Shell快捷工具: `scripts/quick-model.sh`
- 批量导入示例: `examples/batch-models-example.json`