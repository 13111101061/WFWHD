#!/bin/bash

# 快速测试脚本 - Windows版本兼容

API_KEY="key2"
BASE_URL="http://localhost:3000"

echo "🎵 TTS API 快速测试"
echo "=================="

echo ""
echo "1. 测试声音模型查询..."
echo "----------------------------------"

# 获取所有模型
echo "📋 获取所有模型:"
curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/voice-models/models" > models.json
echo "结果已保存到 models.json"

# 显示统计信息
echo ""
echo "📊 系统统计:"
curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/voice-models/stats"

echo ""
echo "2. 测试分类查询..."
echo "----------------------------------"

# 女声模型
echo "👩 女声模型:"
curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/voice-models/categories/female"

echo ""
echo "👨 男声模型:"
curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/voice-models/categories/male"

echo ""
echo "3. 测试标签查询..."
echo "----------------------------------"

# 热门模型
echo "🔥 热门模型:"
curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/voice-models/tags/popular"

echo ""
echo "🏷️ 甜美声音:"
curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/voice-models/tags/sweet"

echo ""
echo "4. 测试提供商查询..."
echo "----------------------------------"

# 阿里云模型
echo "☁️ 阿里云模型:"
curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/voice-models/providers/aliyun"

echo ""
echo "5. 测试搜索功能..."
echo "----------------------------------"

# 搜索包含"龙"的模型
echo "🔍 搜索包含'龙'的模型:"
curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/voice-models/search?q=龙"

echo ""
echo "6. 测试单个模型详情..."
echo "----------------------------------"

# 获取龙小淳详情
echo "🎤 龙小淳模型详情:"
curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/voice-models/models/cosyvoice-longxiaochun"

echo ""
echo "7. 测试基础信息..."
echo "----------------------------------"

# 提供商列表
echo "🏢 提供商列表:"
curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/voice-models/providers"

echo ""
echo "🎭 分类列表:"
curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/voice-models/categories"

echo ""
echo "🏷️ 标签列表:"
curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/voice-models/tags"

echo ""
echo "8. 健康检查..."
echo "----------------------------------"
echo "🏥 系统健康状态:"
curl -s "$BASE_URL/health"

echo ""
echo "✅ 测试完成!"
echo ""
echo "📝 详细结果文件:"
echo "   - models.json (所有模型数据)"
echo ""
echo "💡 使用说明:"
echo "   1. 查看models.json文件获取完整模型信息"
echo "   2. 复制上述curl命令进行自定义测试"
echo "   3. API密钥: $API_KEY"
echo "   4. 服务地址: $BASE_URL"