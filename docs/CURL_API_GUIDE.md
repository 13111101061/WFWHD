# 🎵 TTS API 调用指南 (Curl版本)

## 📋 基础配置

### API密钥
```bash
# 使用默认API密钥
API_KEY="key2"

# 或者使用环境变量中的第一个密钥
API_KEY=$(echo $API_KEYS | cut -d',' -f1)
```

### 基础URL
```bash
BASE_URL="http://localhost:3000"
```

## 🔐 认证方式

### 1. 请求头认证 (推荐)
```bash
curl -H "X-API-Key: $API_KEY" "$BASE_URL/api/voice-models/models"
```

### 2. Bearer Token认证
```bash
curl -H "Authorization: Bearer $API_KEY" "$BASE_URL/api/voice-models/models"
```

### 3. 查询参数认证 (不推荐生产环境)
```bash
curl "$BASE_URL/api/voice-models/models?apiKey=$API_KEY"
```

## 🎯 核心API调用示例

### 1. 获取所有声音模型
```bash
# 获取所有模型列表
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/voice-models/models" | jq

# 只获取模型数量
curl -s -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/voice-models/models" | jq '.count'
```

### 2. 按条件筛选模型

#### 按提供商筛选
```bash
# 获取阿里云所有模型
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/voice-models/providers/aliyun" | jq

# 腾讯云模型 (当有数据时)
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/voice-models/providers/tencent" | jq
```

#### 按分类筛选
```bash
# 获取所有女声模型
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/voice-models/categories/female" | jq

# 获取所有男声模型
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/voice-models/categories/male" | jq
```

#### 按标签筛选
```bash
# 获取热门模型
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/voice-models/tags/popular" | jq

# 获取甜美声音
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/voice-models/tags/sweet" | jq
```

#### 按语言筛选
```bash
# 获取中文模型
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/voice-models/languages/zh-CN" | jq

# 获取英文模型
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/voice-models/languages/en-US" | jq
```

#### 按性别筛选
```bash
# 女声模型
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/voice-models/gender/female" | jq

# 男声模型
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/voice-models/gender/male" | jq
```

### 3. 搜索模型
```bash
# 搜索包含"龙小"的模型
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/voice-models/search?q=龙小" | jq

# 搜索英文模型
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/voice-models/search?q=english" | jq
```

### 4. 获取单个模型详情
```bash
# 获取龙小淳模型详情
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/voice-models/models/cosyvoice-longxiaochun" | jq

# 格式化输出重要信息
curl -s -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/voice-models/models/cosyvoice-longxiaochun" | jq '
{
  name: .data.name,
  provider: .data.provider,
  languages: .data.languages,
  gender: .data.gender,
  voiceId: .data.voiceId,
  description: .data.description,
  tags: .data.tags
}'
```

### 5. 获取基础信息
```bash
# 获取所有提供商
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/voice-models/providers" | jq

# 获取所有分类
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/voice-models/categories" | jq

# 获取所有标签
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/voice-models/tags" | jq

# 获取统计信息
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/voice-models/stats" | jq
```

## 🎤 TTS合成调用

### 1. 基础TTS合成
```bash
# 使用统一TTS接口
curl -X POST -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "service": "aliyun_cosyvoice",
    "text": "你好，世界！",
    "voice": "longxiaochun_v2"
  }' \
  "$BASE_URL/api/tts/synthesize" | jq

# 保存返回的音频URL
AUDIO_URL=$(curl -s -X POST -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "service": "aliyun_cosyvoice",
    "text": "测试语音合成",
    "voice": "longxiaochun_v2"
  }' \
  "$BASE_URL/api/tts/synthesize" | jq -r '.data.audioUrl')

echo "音频URL: $AUDIO_URL"
```

### 2. 不同服务调用

#### 阿里云CosyVoice
```bash
curl -X POST -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "service": "aliyun_cosyvoice",
    "text": "欢迎使用阿里云CosyVoice",
    "voice": "longxiaochun_v2",
    "speed": 1.0,
    "pitch": 1.0
  }' \
  "$BASE_URL/api/tts/synthesize" | jq
```

#### 阿里云千问TTS
```bash
curl -X POST -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "service": "aliyun_qwen_http",
    "text": "这是千问TTS测试",
    "voice": "longfei",
    "model": "qwen-tts-latest"
  }' \
  "$BASE_URL/api/tts/synthesize" | jq
```

#### 腾讯云TTS
```bash
curl -X POST -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "service": "tencent",
    "text": "腾讯云TTS测试",
    "voice": "101001"
  }' \
  "$BASE_URL/api/tts/synthesize" | jq
```

### 3. 批量文本转语音
```bash
# 批量处理多个文本
curl -X POST -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "service": "aliyun_cosyvoice",
    "texts": [
      "第一段文本",
      "第二段文本",
      "第三段文本"
    ],
    "options": {
      "voice": "longxiaochun_v2",
      "speed": 1.0
    }
  }' \
  "$BASE_URL/api/tts/batch" | jq
```

## 🛠️ 管理操作

### 1. 获取系统状态
```bash
# 健康检查
curl "$BASE_URL/health" | jq

# 系统信息
curl "$BASE_URL/api/public/info" | jq

# TTS服务统计
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/tts/stats" | jq
```

### 2. 重新加载配置
```bash
# 重新加载声音模型配置
curl -X POST -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/voice-models/reload" | jq
```

### 3. 清理操作
```bash
# 清理缓存
curl -X POST -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/tts/clear-cache" | jq

# 重置统计
curl -X POST -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/tts/reset-stats" | jq
```

## 🔍 实用脚本示例

### 脚本1: 获取并显示所有可用声音
```bash
#!/bin/bash
API_KEY="key2"
BASE_URL="http://localhost:3000"

echo "🎵 可用声音模型列表:"
echo "=================="

curl -s -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/voice-models/models" | jq -r '
  .data[] |
  "👤 \(.name) (\(.id))
   📱 提供商: \(.provider)
   🌐 语言: \(.languages | join(", "))
   👫 性别: \(.gender)
   🏷️  标签: \(.tags | join(", "))
   📝 描述: \(.description)
   "
'
```

### 脚本2: 语音合成测试脚本
```bash
#!/bin/bash
API_KEY="key2"
BASE_URL="http://localhost:3000"
TEXT="这是一个语音合成测试"
VOICE="longxiaochun_v2"

echo "🎤 开始语音合成..."
echo "文本: $TEXT"
echo "声音: $VOICE"
echo ""

# 调用TTS API
RESPONSE=$(curl -s -X POST -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"service\": \"aliyun_cosyvoice\",
    \"text\": \"$TEXT\",
    \"voice\": \"$VOICE\"
  }" \
  "$BASE_URL/api/tts/synthesize")

# 解析响应
SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
if [ "$SUCCESS" = "true" ]; then
  AUDIO_URL=$(echo "$RESPONSE" | jq -r '.data.audioUrl')
  TASK_ID=$(echo "$RESPONSE" | jq -r '.data.taskId')

  echo "✅ 语音合成成功!"
  echo "🔗 音频URL: $AUDIO_URL"
  echo "🆔 任务ID: $TASK_ID"

  # 下载音频文件 (可选)
  # curl -o "audio_$TASK_ID.mp3" "$AUDIO_URL"
  # echo "💾 音频已保存: audio_$TASK_ID.mp3"
else
  ERROR=$(echo "$RESPONSE" | jq -r '.error')
  echo "❌ 语音合成失败: $ERROR"
fi
```

### 脚本3: 批量测试所有声音
```bash
#!/bin/bash
API_KEY="key2"
BASE_URL="http://localhost:3000"
TEST_TEXT="这是测试音频，用于验证声音效果。"

echo "🧪 批量测试所有声音模型..."
echo "================================"

# 获取所有模型
MODELS=$(curl -s -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/voice-models/models" | jq -r '.data[].id')

for model_id in $MODELS; do
  echo ""
  echo "🎤 测试模型: $model_id"

  # 获取模型详情
  MODEL_INFO=$(curl -s -H "X-API-Key: $API_KEY" \
    "$BASE_URL/api/voice-models/models/$model_id")

  NAME=$(echo "$MODEL_INFO" | jq -r '.data.name')
  VOICE_ID=$(echo "$MODEL_INFO" | jq -r '.data.voiceId')

  echo "👤 名称: $NAME"
  echo "🆔 语音ID: $VOICE_ID"

  # 进行TTS合成
  RESPONSE=$(curl -s -X POST -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"service\": \"aliyun_cosyvoice\",
      \"text\": \"$TEST_TEXT\",
      \"voice\": \"$VOICE_ID\"
    }" \
    "$BASE_URL/api/tts/synthesize")

  SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
  if [ "$SUCCESS" = "true" ]; then
    AUDIO_URL=$(echo "$RESPONSE" | jq -r '.data.audioUrl')
    echo "✅ 合成成功: $AUDIO_URL"
  else
    ERROR=$(echo "$RESPONSE" | jq -r '.error')
    echo "❌ 合成失败: $ERROR"
  fi

  sleep 1  # 避免请求过快
done

echo ""
echo "🏁 批量测试完成!"
```

## 📱 快速命令参考

### 查看和搜索
```bash
# 查看所有模型
curl -H "X-API-Key: key2" http://localhost:3000/api/voice-models/models | jq '.data[] | {name, id, provider}'

# 搜索女声模型
curl -H "X-API-Key: key2" "http://localhost:3000/api/voice-models/gender/female" | jq '.data[].name'

# 搜索中文模型
curl -H "X-API-Key: key2" "http://localhost:3000/api/voice-models/languages/zh-CN" | jq '.data[].name'

# 搜索热门模型
curl -H "X-API-Key: key2" "http://localhost:3000/api/voice-models/tags/popular" | jq '.data[].name'
```

### 快速测试
```bash
# 简单语音合成
curl -X POST -H "X-API-Key: key2" \
  -H "Content-Type: application/json" \
  -d '{"service":"aliyun_cosyvoice","text":"你好","voice":"longxiaochun_v2"}' \
  http://localhost:3000/api/tts/synthesize | jq '.data.audioUrl'

# 下载音频文件
curl -o test.mp3 "$(curl -s -X POST -H "X-API-Key: key2" \
  -H "Content-Type: application/json" \
  -d '{"service":"aliyun_cosyvoice","text":"测试音频","voice":"longxiaochun_v2"}' \
  http://localhost:3000/api/tts/synthesize | jq -r '.data.audioUrl')"
```

## ⚠️ 错误处理

### 常见错误及解决方案

#### 认证失败
```bash
# 检查API密钥
curl -H "X-API-Key: key2" http://localhost:3000/api/voice-models/stats

# 如果失败，尝试其他密钥
curl -H "X-API-Key: key3" http://localhost:3000/api/voice-models/stats
```

#### 服务不可用
```bash
# 检查服务状态
curl http://localhost:3000/health

# 检查端口是否开放
netstat -tlnp | grep :3000
```

#### 模型不存在
```bash
# 检查可用模型列表
curl -H "X-API-Key: key2" http://localhost:3000/api/voice-models/models | jq '.data[].id'

# 搜索特定模型
curl -H "X-API-Key: key2" "http://localhost:3000/api/voice-models/search?q=模型名"
```

## 📊 性能监控

### 查看调用统计
```bash
# 获取TTS服务统计
curl -H "X-API-Key: key2" http://localhost:3000/api/tts/stats | jq

# 获取声音模型统计
curl -H "X-API-Key: key2" http://localhost:3000/api/voice-models/stats | jq
```

### 监控API响应时间
```bash
# 测试API响应时间
time curl -H "X-API-Key: key2" http://localhost:3000/api/voice-models/models

# 测试TTS合成时间
time curl -X POST -H "X-API-Key: key2" \
  -H "Content-Type: application/json" \
  -d '{"service":"aliyun_cosyvoice","text":"测试","voice":"longxiaochun_v2"}' \
  http://localhost:3000/api/tts/synthesize
```

---

## 🔗 相关文档

- [API接口文档](./API_DOCUMENTATION.md)
- [模型管理手册](./MODEL_MANAGEMENT.md)
- [部署指南](./DEPLOYMENT.md)