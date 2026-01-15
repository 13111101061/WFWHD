# 音色分类系统使用指南

## 📋 概述

音色分类系统将音色数据拆分为两个独立的文件，实现关注点分离和伪热更新：

- **voiceIdMapping.json** - 后端转译专用（技术映射）
- **voiceCategories.json** - 前端展示专用（自动生成）

## 🏗️ 架构设计

### 文件职责

```
voiceIdMapping.json (主数据源，人工维护)
    ↓
generate-voice-categories.js (分类逻辑)
    ↓
voiceCategories.json (自动生成，前端使用)
```

### 数据流向

1. **开发者维护** `voiceIdMapping.json`（添加/修改音色）
2. **运行生成脚本** 自动生成 `voiceCategories.json`
3. **前端调用API** 获取分类数据
4. **热更新机制** 文件变化自动重新生成

## 📄 文件说明

### 1. voiceIdMapping.json（后端专用）

**职责**：纯粹的ID映射，用于后端API调用转译

**包含字段**：
- `id` - 系统唯一标识（systemId）
- `name` - 音色名称
- `provider` - 服务提供商
- `service` - 服务类型
- `voiceId` - 厂商音色ID
- `model` - 模型版本（可选）
- `gender` - 性别
- `languages` - 支持语言
- `tags` - 标签（用于分类）

**示例**：
```json
{
  "version": 1,
  "voices": [
    {
      "id": "aliyun-cosyvoice-longxiaochun",
      "name": "龙小淳",
      "provider": "aliyun",
      "service": "cosyvoice",
      "voiceId": "longxiaochun_v2",
      "model": "cosyvoice-v2",
      "gender": "female",
      "languages": ["zh-CN"],
      "tags": ["sweet", "young-female", "storytelling"]
    }
  ]
}
```

### 2. voiceCategories.json（前端专用）

**职责**：用户友好的分类数据，由脚本自动生成

**特点**：
- ✅ 自动生成，不人工维护
- ✅ 只包含展示信息
- ✅ 支持伪热更新
- ✅ 带缓存优化（ETag）

**结构**：
```json
{
  "version": 1,
  "generatedAt": "2026-01-09T...",
  "source": {
    "mappingVersion": 1,
    "sourceFingerprint": "3f22bd899d59e47d",
    "totalVoices": 21
  },
  "categories": [
    {
      "key": "gender_female",
      "title": "女声",
      "icon": "👩",
      "order": 1,
      "count": 13,
      "items": [
        {
          "systemId": "aliyun-cosyvoice-longxiaochun",
          "title": "龙小淳",
          "provider": "aliyun",
          "service": "cosyvoice",
          "gender": "female",
          "languages": ["zh-CN"],
          "badges": ["甜美", "讲故事"],
          "popularity": 95
        }
      ]
    }
  ]
}
```

## 🚀 使用方法

### 1. 添加新音色

编辑 `src/modules/tts/config/voiceIdMapping.json`：

```json
{
  "id": "provider-service-voicename",
  "name": "音色名称",
  "provider": "aliyun",
  "service": "cosyvoice",
  "voiceId": "provider_voice_id",
  "gender": "female",
  "languages": ["zh-CN"],
  "tags": ["popular", "sweet"]
}
```

### 2. 重新生成分类文件

```bash
# 手动生成
node src/modules/tts/config/generate-voice-categories.js

# 或使用npm脚本（如果配置）
npm run generate-categories
```

### 3. 前端调用API

```javascript
// 获取分类数据（推荐）
GET /api/tts/voices/categories

// 响应示例
{
  "success": true,
  "data": {
    "version": 1,
    "categories": [...]
  }
}

// 支持ETag缓存
fetch('/api/tts/voices/categories', {
  headers: {
    'If-None-Match': previousETag
  }
})
```

### 4. 后端使用systemId

```javascript
// 合成请求
POST /api/tts/synthesize
{
  "systemId": "aliyun-cosyvoice-longxiaochun",
  "text": "你好世界"
}

// 后端自动转换
// systemId → { provider, service, voiceId }
```

## 🔥 热更新机制

### 自动热更新

系统会监听 `voiceIdMapping.json` 文件变化：

```javascript
// 在应用启动时自动启动（生产环境）
const { voiceHotReload } = require('./config/voice-hot-reload');
voiceHotReload.start();
```

### 手动触发重载

```bash
# 调用重载API（需要admin权限）
POST /api/tts/voices/reload
Authorization: Bearer <admin-api-key>
```

### 工作流程

1. 修改 `voiceIdMapping.json`
2. 文件监听器检测到变化（2秒防抖）
3. 自动运行生成脚本
4. 重新加载注册表
5. 前端下次请求获取新数据（通过ETag判断）

## 📊 分类规则

### 当前支持的分类

1. **按性别**
   - 女声（gender_female）
   - 男声（gender_male）

2. **按语言**
   - 中文（lang_zh_cn）
   - 英文（lang_en_us）
   - 英式英文（lang_en_gb）

3. **按服务商**
   - 阿里云（provider_aliyun）
   - 腾讯云（provider_tencent）
   - 火山引擎（provider_volcengine）
   - MiniMax（provider_minimax）

4. **按标签**
   - 热门推荐（tag_popular）
   - 双语音色（tag_bilingual）
   - 甜美音色（tag_sweet）
   - 专业音色（tag_professional）
   - 讲故事（tag_storytelling）
   - 方言音色（tag_dialect）

### 热门度计算

```javascript
基础分: 10
+ popular标签: +50
+ sweet标签: +20
+ bilingual标签: +30
+ professional标签: +15
+ storytelling标签: +10
+ 多语言: +25
+ 阿里云: +10
+ cosyvoice服务: +15
```

## 🧪 测试

```bash
# 运行测试脚本
node tests/test-voice-categories.js

# 测试内容
# 1. 获取分类数据
# 2. 缓存机制（ETag）
# 3. 旧API兼容性
# 4. SystemId查询
# 5. 统计信息
```

## 🔧 自定义分类规则

编辑 `src/modules/tts/config/generate-voice-categories.js`：

```javascript
// 添加新的分类维度
categorizeByCustom(voices) {
  const customMap = {
    'custom-key': { 
      key: 'custom_category', 
      title: '自定义分类', 
      icon: '🎯', 
      order: 40 
    }
  };

  // 实现分类逻辑
  return categories;
}
```

## 📈 性能优化

### 缓存策略

- **服务端**：ETag + Last-Modified
- **客户端**：5分钟缓存（Cache-Control: max-age=300）
- **304响应**：文件未变化时返回304 Not Modified

### 文件大小

- voiceIdMapping.json: ~20KB（100个音色）
- voiceCategories.json: ~30KB（100个音色，含分类）

### 生成性能

- 100个音色：~50ms
- 1000个音色：~200ms

## ⚠️ 注意事项

### 数据一致性

1. **systemId必须唯一**
   - 格式：`provider-service-voicename`
   - 示例：`aliyun-cosyvoice-longxiaochun`

2. **(provider, service, voiceId)组合必须唯一**
   - 同一服务商同一服务下不能有重复的voiceId

3. **必需字段不能缺失**
   - id, name, provider, service, voiceId, gender, languages

### 向后兼容

- 旧的 `voiceModels.json` 仍然支持（过渡期）
- 旧的API接口保持不变
- 新旧字段名同时支持（id/systemId）

### 生产环境

```bash
# 设置环境变量启用热更新
NODE_ENV=production
VOICE_HOT_RELOAD=true
```

## 🔗 相关文档

- [音色工厂架构深度剖析](./音色工厂架构深度剖析.md)
- [优化策略文档](../OPTIMIZATION_STRATEGIES.md)
- [API文档](./API_DOCUMENTATION.md)

## 📞 常见问题

### Q: 如何添加新的分类维度？

A: 编辑 `generate-voice-categories.js`，添加新的分类方法，并在 `generateCategories()` 中调用。

### Q: 分类文件生成失败怎么办？

A: 检查 `voiceIdMapping.json` 格式是否正确，运行验证脚本查看错误信息。

### Q: 如何禁用热更新？

A: 设置环境变量 `VOICE_HOT_RELOAD=false` 或不设置 `NODE_ENV=production`。

### Q: 前端如何判断数据是否更新？

A: 使用ETag机制，服务器返回304表示数据未变化，200表示有新数据。

---

**最后更新**: 2026-01-09  
**版本**: 1.0.0
