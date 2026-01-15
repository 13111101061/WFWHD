# TTS 微服务节点

这是一个基于 Node.js 和 Express 构建的**TTS微服务节点**，专为微服务架构设计，提供统一的文本转语音服务接口。

## 🎯 设计理念

- **微服务架构** - 专注单一功能，易于扩展和维护
- **无用户系统** - 简化认证，通过API密钥进行服务间通信
- **高性能** - 内存存储，快速响应
- **可观测性** - 完整的监控和审计功能

## 🚀 功能特性

### TTS服务支持
- 阿里云 CosyVoice TTS (WebSocket)
- 阿里云千问 TTS (WebSocket + HTTP)
- 腾讯云 TTS (HTTP API)
- 火山引擎 TTS (HTTP + WebSocket)
- 统一 TTS API 接口

### 认证和安全
- **统一API密钥管理** - 支持静态和动态密钥
- **服务级别权限控制** - 精细化访问控制
- **速率限制保护** - 防止滥用
- **实时监控审计** - 完整的访问日志

### 文件存储
- SNPAN云存储集成
- 文件上传和管理
- 安全的存储访问控制

## 技术栈

- Node.js
- Express
- WebSocket
- HTTPS

## 安装和运行

1. 安装依赖:
   ```
   npm install
   ```

2. 配置环境变量:
   复制 [.env.example](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/.env.example) 文件并重命名为 [.env](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/.env)，然后填入相应的 API 密钥

3. 启动服务:
   ```
   npm start
   ```

4. 访问服务:
   - 主界面: http://localhost:3000
   - 管理界面: http://localhost:3000/admin

## API 密钥保护

为保护后端API接口安全，系统支持API密钥验证功能。

### 配置API密钥

在 [.env](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/.env) 文件中配置API密钥：
```env
# API密钥（用于保护后端API）
API_KEYS=key1,key2,key3
```

### 使用API密钥

所有API请求都需要在请求头中包含有效的API密钥：

```bash
# 使用 X-API-Key 请求头
curl -H "X-API-Key: your-api-key" http://localhost:3000/api/tts

# 或者使用 Authorization Bearer 令牌
curl -H "Authorization: Bearer your-api-key" http://localhost:3000/api/tts

# 或者使用查询参数（不推荐用于生产环境）
curl http://localhost:3000/api/tts?apiKey=your-api-key
```

### 管理API密钥

通过管理界面可以方便地管理API密钥：
1. 访问管理界面: http://localhost:3000/admin
2. 在"API 密钥管理"部分可以:
   - 查看现有API密钥列表
   - 添加新的API密钥
   - 删除不需要的API密钥
   - 自动生成安全的API密钥

## API 接口

### 1. 阿里云 CosyVoice TTS (WebSocket)
- **Endpoint**: `ws://localhost:3000/api/tts`
- **Method**: WebSocket
- **特点**: 实时流式传输，延迟低

### 2. 阿里云千问 TTS (WebSocket)
- **Endpoint**: `ws://localhost:3000/api/qwen-tts`
- **Method**: WebSocket
- **特点**: 实时流式传输，延迟低

### 3. 阿里云千问 TTS (HTTP API)
- **Endpoint**: `http://localhost:3000/api/qwen-tts-http`
- **Method**: HTTP POST
- **特点**: 返回可直接访问的音频文件URL

### 4. 腾讯云 TTS (HTTP API)
- **Endpoint**: `http://localhost:3000/api/tencent-tts`
- **Method**: HTTP POST
- **特点**: 返回Base64编码的音频数据

### 5. 火山引擎 TTS (HTTP API)
- **Endpoint**: `http://localhost:3000/api/volcengine-tts`
- **Method**: HTTP POST
- **特点**: 异步处理，需要轮询获取结果

### 6. 火山引擎 TTS (WebSocket)
- **Endpoint**: `http://localhost:3000/api/volcengine-tts-ws`
- **Method**: HTTP POST
- **特点**: 实时流式传输，延迟低

### 7. 统一 TTS API (推荐)
- **Endpoint**: `http://localhost:3000/api/unified-tts`
- **Method**: HTTP POST
- **特点**: 统一调用所有TTS服务，简化前端调用

## 管理界面

本系统提供了一个图形化管理界面，方便管理员配置和管理各种 TTS 服务的密钥和系统设置。

访问地址: http://localhost:3000/admin

管理界面功能包括:
1. 查看和更新各 TTS 服务的 API 密钥
2. 配置服务器参数（端口、日志级别等）
3. 监控系统运行状态和资源使用情况

## 环境变量配置

在 [.env](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/.env) 文件中配置以下变量:

```
# 阿里云DashScope API 密钥 (用于TTS服务)
TTS_API_KEY=your-dashscope-api-key-here

# 腾讯云API密钥 (用于腾讯云TTS服务)
TENCENTCLOUD_SECRET_ID=your-tencent-cloud-secret-id
TENCENTCLOUD_SECRET_KEY=your-tencent-cloud-secret-key

# 火山引擎API密钥 (用于火山引擎TTS服务)
VOLCENGINE_APP_ID=your-volcengine-app-id
VOLCENGINE_TOKEN=your-volcengine-token
VOLCENGINE_SECRET_KEY=your-volcengine-secret-key

# 服务器配置
PORT=3000
HOST=localhost

# 日志级别
LOG_LEVEL=info
```

## 使用示例

### WebSocket 方式 (阿里云 CosyVoice TTS 和千问 TTS)

```javascript
// 创建WebSocket连接
const ws = new WebSocket('ws://localhost:3000/api/tts');

// 监听连接打开事件
ws.onopen = function() {
  // 发送文本消息
  ws.send(JSON.stringify({
    action: 'start',
    text: '你好，世界！',
    voice: 'longfei' // 可选参数
  }));
};

// 监听消息事件
ws.onmessage = function(event) {
  const data = JSON.parse(event.data);
  if (data.type === 'audio') {
    // 处理音频数据
    const audioData = data.audio;
    // 播放音频
  }
};
```

### HTTP API 方式 (千问 TTS HTTP API、腾讯云 TTS 和火山引擎 TTS)

```javascript
// 发送POST请求
fetch('http://localhost:3000/api/qwen-tts-http', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    text: '你好，世界！',
    voice: 'longfei', // 可选参数
    format: 'wav'     // 可选参数
  })
})
.then(response => response.json())
.then(data => {
  if (data.success) {
    // 获取音频文件URL
    const audioUrl = data.data.audioUrl;
    // 播放音频
    const audio = new Audio(audioUrl);
    audio.play();
  }
});
```

### 统一 TTS API 方式 (推荐)

```javascript
// 调用阿里云CosyVoice TTS服务
fetch('http://localhost:3000/api/unified-tts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    service: 'aliyun_cosyvoice',
    text: '你好，世界！',
    voice: 'longxiaochun_v2',
    speed: 1.0,
    pitch: 1.0
  })
})
.then(response => response.json())
.then(data => {
  if (data.success) {
    // 获取音频文件URL
    const audioUrl = data.data.audioUrl;
    // 播放音频
    const audio = new Audio(audioUrl);
    audio.play();
  }
});

// 获取所有TTS服务的音色列表
fetch('http://localhost:3000/api/unified-tts/voices')
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      console.log('所有TTS服务的音色列表:', data.data);
    }
  });
```

## 音色选项

我们为每个TTS服务提供了丰富的音色选项：

### 阿里云 CosyVoice TTS
cosyvoice-v1 音色:
- 龙婉 (女声) (v1)
- 龙橙 (男声) (v1)
- 龙华 (女声) (v1)
- 龙小淳 (女声) (v1)
- 龙小夏 (女声) (v1)
- 龙小诚 (男声) (v1)
- 龙小白 (男声) (v1)
- 龙老铁 (男声) (v1)
- 龙书 (男声) (v1)
- 龙硕 (男声) (v1)
- 龙婧 (女声) (v1)
- 龙妙 (女声) (v1)
- 龙悦 (女声) (v1)
- 龙媛 (女声) (v1)
- 龙飞 (男声) (v1)
- 龙杰力豆 (男声) (v1)
- 龙彤 (女声) (v1)
- 龙祥 (男声) (v1)
- Stella (女声) (v1)
- Bella (女声) (v1)

cosyvoice-v2 音色 (共70个):
- 龙应催 (男声) (v2)
- 龙应答 (女声) (v2)
- 龙应静 (女声) (v2)
- 龙应严 (女声) (v2)
- 龙应甜 (女声) (v2)
- 龙应冰 (女声) (v2)
- 龙应桃 (女声) (v2)
- 龙应聆 (女声) (v2)
- YUMI (女声) (v2)
- 龙小淳 (女声) (v2)
- 龙小夏 (女声) (v2)
- 龙安燃 (女声) (v2)
- 龙安宣 (女声) (v2)
- 龙三叔 (男声) (v2)
- 龙修 (男声) (v2)
- 龙妙 (女声) (v2)
- 龙悦 (女声) (v2)
- 龙楠 (男声) (v2)
- 龙媛 (女声) (v2)
- 龙安柔 (女声) (v2)
- 龙嫱 (女声) (v2)
- 龙寒 (男声) (v2)
- 龙星 (女声) (v2)
- 龙华 (女声) (v2)
- 龙婉 (女声) (v2)
- 龙橙 (男声) (v2)
- 龙菲菲 (女声) (v2)
- 龙小诚 (男声) (v2)
- 龙哲 (男声) (v2)
- 龙颜 (女声) (v2)
- 龙天 (男声) (v2)
- 龙泽 (男声) (v2)
- 龙邵 (男声) (v2)
- 龙浩 (男声) (v2)
- 龙深 (男声) (v2)
- 龙杰力豆 (男声) (v2)
- 龙铃 (女声) (v2)
- 龙可 (女声) (v2)
- 龙仙 (女声) (v2)
- 龙老铁 (男声) (v2)
- 龙嘉怡 (女声) (v2)
- 龙桃 (女声) (v2)
- 龙飞 (男声) (v2)
- 李白 (男声) (v2)
- 龙津 (男声) (v2)
- 龙书 (男声) (v2)
- Bella2.0 (女声) (v2)
- 龙硕 (男声) (v2)
- 龙小白 (女声) (v2)
- 龙婧 (女声) (v2)
- loongstella (女声) (v2)
- loongeva (女声) (英式英文) (v2)
- loongbrian (男声) (英式英文) (v2)
- loongluna (女声) (英式英文) (v2)
- loongluca (男声) (英式英文) (v2)
- loongemily (女声) (英式英文) (v2)
- loongeric (男声) (英式英文) (v2)
- loongabby (女声) (美式英文) (v2)
- loongannie (女声) (美式英文) (v2)
- loongandy (男声) (美式英文) (v2)
- loongava (女声) (美式英文) (v2)
- loongbeth (女声) (美式英文) (v2)
- loongbetty (女声) (美式英文) (v2)
- loongcindy (女声) (美式英文) (v2)
- loongcally (女声) (美式英文) (v2)
- loongdavid (男声) (美式英文) (v2)
- loongdonna (女声) (美式英文) (v2)
- loongkyong (女声) (韩语) (v2)
- loongtomoka (女声) (日语) (v2)
- loongtomoya (男声) (日语) (v2)

### 阿里云千问 TTS
基础音色:
- Cherry (女声)
- Chelsie (女声)
- Ethan (男声)
- Serena (女声)
- Roger (男声)
- Sherry (女声)
- Alice (女声)
- Eric (男声)
- Catherine (女声)
- Demon (男声)

方言音色 (需要使用 qwen-tts-latest/2025-05-22 模型):
- Dylan（北京话-男） (方言)
- Jada（吴语-女） (方言)
- Sunny（四川话-女） (方言)

### 腾讯云 TTS
基础音色:
- 亲亲 (女声)
- 鸭鸭 (女声)
- 圆圆 (女声)
- 小郭 (男声)
- 小何 (男声)
- 小玲 (女声)
- 小露 (女声)
- 小倩 (女声)
- 小蓉 (女声)
- 小宋 (男声)
- 小唐 (男声)
- 小王 (男声)
- 小魏 (男声)
- 小文 (男声)
- 小欣 (女声)
- 小颜 (女声)

扩展音色:
- 小包 (男声)
- 小蔡 (男声)
- 小岑 (女声)
- 小戴 (男声)
- 小高 (男声)
- 小胡 (女声)
- 小贾 (女声)
- 小简 (女声)
- 小金 (女声)
- 小柯 (男声)
- 小兰 (女声)
- 小李 (女声)
- 小梁 (女声)
- 小刘 (男声)
- 小马 (男声)
- 小明 (男声)
- 小潘 (女声)
- 小邱 (男声)
- 小沈 (女声)
- 小孙 (女声)
- 小徐 (男声)
- 小袁 (女声)
- 小章 (男声)
- 小朱 (女声)

新增音色:
- 小强 (男声)
- 小焦 (男声)
- 小红 (女声)
- 小虹 (女声)
- 小满 (女声)
- 小乐 (男声)
- 小乔 (女声)
- 小帅 (男声)
- 小松 (男声)
- 小童 (女声)
- 小婉 (女声)
- 小威 (男声)
- 小文静 (女声)
- 小武 (男声)
- 小宇 (男声)
- 小喻 (女声)
- 小月 (女声)
- 小哲 (男声)
- 小震 (男声)
- 小志 (男声)

情感音色:
- 贝贝 (女声) [情感]
- 晶晶 (女声) [情感]
- 欢欢 (男声) [情感]
- 莹莹 (女声) [情感]
- 妮妮 (女声) [情感]

特色音色:
- 英文男声 (男声) 英文
- 英文女声 (女声) 英文
- 粤语女声 (女声) 粤语
- 翻译腔女声 (女声) [特色]
- 翻译腔男声 (男声) [特色]

### 火山引擎 TTS
基础音色:
- 通用女声
- 通用男声
- 甜美女声
- 沉稳男声
- 活力男声
- 新闻女声
- 新闻男声
- 知性女声
- 温柔女声
- 少年音

青年音系列:
- 青年音 (男声)
- 青年音 (女声)

客服音色系列:
- 客服女声
- 客服男声

高质量音色系列:
- 超自然音色-梓梓
- 超自然音色-燃燃
- 译制片男声

灿灿系列:
- 灿灿
- 灿灿 2.0
- 炀炀
- 擎苍
- 擎苍 2.0
- 擎苍
- 燃燃
- 燃燃 2.0
- 灵儿
- 灵儿 2.0
- 朵朵
- 朵朵 2.0
- 小帅
- 小帅 2.0

抖音系列:
- 抖音小姐姐
- 阳光男声
- 动漫小新
- 奶气萌娃

英文音色:
- 英文女声
- 英文男声

多语言音色:
- 灿灿/Shiny (中文、美式英语)
- 清新女声 (中文)
- 邻家小妹/Lily (中文)
- 思彤 (中文)
- 融成 (中文)
- 飞宇 (中文)
- 龙飞 (中文)
- 雷奇 (中文)
- 茂茂 (中文)
- 昭谦 (中文)
- 朝雨 (中文)
- 武哲 (中文)
- 小明 (中文)
- 小军 (中文)
- 小童 (中文)
- 小新 (中文)
- 小威 (中文)
- 小武 (中文)
- 小智 (中文)
- 小昭 (中文)
- 小张 (中文)
- 小周 (中文)
- 小朱 (中文)
- 小郑 (中文)
- 小赵 (中文)
- 小陈 (中文)
- 小亮 (中文)
- 小峰 (中文)
- 小刚 (中文)
- 小李 (中文)
- 小王 (中文)
- 小刘 (中文)

## API调用示例

我们提供了一个完整的API调用示例文件，位于 [examples/tts-api-example.js](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/examples/tts-api-example.js)，展示了如何使用各种TTS服务。

### 获取音色列表
```javascript
// 获取可用音色列表
async function getAvailableVoices(service) {
  try {
    const response = await fetch(`http://localhost:3000/api/${service}/voices`);
    const data = await response.json();
    
    if (data.success) {
      console.log(`${service} 可用音色列表:`);
      data.data.forEach(voice => {
        console.log(`- ${voice.id}: ${voice.name} (${voice.gender})`);
      });
      
      return data.data;
    } else {
      console.error(`获取 ${service} 音色列表失败:`, data.error);
      return [];
    }
  } catch (error) {
    console.error(`获取 ${service} 音色列表网络错误:`, error);
    return [];
  }
}
```

### 调用TTS服务
```javascript
// 调用CosyVoice TTS服务
async function callCosyVoiceTTS(text) {
  try {
    const response = await fetch('http://localhost:3000/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text,
        voice: 'longxiaochun_v2',
        speed: 1.0,
        pitch: 1.0
      })
    });

    const data = await response.json();
    
    if (data.success) {
      console.log('CosyVoice TTS调用成功:');
      console.log('- 音频URL:', data.data.audioUrl);
      console.log('- 任务ID:', data.data.taskId);
      
      // 播放音频
      const audio = new Audio(data.data.audioUrl);
      audio.play();
      
      return data.data;
    } else {
      console.error('CosyVoice TTS调用失败:', data.error);
      return null;
    }
  } catch (error) {
    console.error('CosyVoice TTS网络错误:', error);
    return null;
  }
}
```

## 统一 TTS API 说明

为了简化前端调用，我们提供了统一的 TTS API，可以通过一个接口调用所有支持的 TTS 服务。

### 调用方式

```javascript
// 通用调用格式
fetch('http://localhost:3000/api/unified-tts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    service: '服务标识',  // 必需
    text: '要合成的文本', // 必需
    // 其他参数根据服务而定
  })
})
```

### 支持的服务标识

- `aliyun_cosyvoice` - 阿里云 CosyVoice TTS
- `aliyun_qwen_ws` - 阿里云千问 TTS (WebSocket)
- `aliyun_qwen_http` - 阿里云千问 TTS (HTTP)
- `tencent` - 腾讯云 TTS
- `volcengine_http` - 火山引擎 TTS (HTTP)
- `volcengine_ws` - 火山引擎 TTS (WebSocket)

### 获取音色列表

```javascript
// 获取所有服务的音色列表
fetch('http://localhost:3000/api/unified-tts/voices')
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      console.log('所有服务的音色列表:', data.data);
    }
  });

// 获取特定服务的音色列表
fetch('http://localhost:3000/api/unified-tts/voices?service=aliyun_cosyvoice')
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      console.log('阿里云CosyVoice音色列表:', data.data);
    }
  });
```

## 错误处理

所有API都会返回统一的错误格式:

```json
{
  "success": false,
  "error": "错误信息"
}
```

## 测试

运行测试脚本:

```
npm test
```

或者运行特定的测试:

```
node test/test-tts.js
node test/qwen-tts-test.js
node test/qwen-tts-http-test.js
node test/tencent-tts-test.js
node test/volcengine-tts-test.js
node test/volcengine-tts-ws-test.js
```

## 部署到宝塔面板

本项目可以轻松部署到宝塔面板中：

1. 将项目文件上传到服务器
2. 在宝塔面板中安装 Node.js 环境
3. 安装项目依赖: `npm install`
4. 配置环境变量
5. 在宝塔面板中添加 Node.js 项目
6. 配置反向代理
7. 启动服务

详细部署步骤请参考部署文档。

## 故障排除

### 火山引擎 TTS 服务

当前实现的火山引擎TTS服务使用HTTP API方式，但该API采用异步处理机制。当请求成功提交后，API会返回"Successfully submitted"消息，但实际的音频数据需要通过其他方式获取：

1. 可以考虑使用WebSocket方式来实现实时语音合成
2. 可以查阅火山引擎官方文档了解如何轮询获取异步处理结果
3. 可以尝试调整参数配置看是否可以获得同步响应

如果遇到 `[resource_id=volc.tts.default] requested resource not granted` 错误，请检查以下几点：
1. 确保您已在火山引擎控制台正确配置了TTS服务
2. 确认您的APP ID和Token是有效的
3. 检查您的账户是否有足够的权限使用TTS服务
4. 确认您已在控制台启用了相应的语音合成资源
5. 如果问题持续存在，请联系火山引擎技术支持

## 开发指南

### 项目结构

```
.
├── audio/                  # 音频文件存储目录
├── examples/               # API调用示例
├── public/                 # 前端静态资源
│   ├── index.html          # 主界面
│   └── admin.html          # 管理界面
├── routes/                 # 路由定义
├── services/               # TTS服务实现
├── test/                   # 测试文件
├── utils/                  # 工具函数
├── .env.example            # 环境变量示例
├── config.js               # 配置文件
├── index.js                # 应用入口
└── package.json            # 项目依赖
```

### 核心模块说明

1. **服务模块 (services/)**
   - [cosyVoiceService.js](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/services/cosyVoiceService.js) - 阿里云CosyVoice WebSocket服务
   - [qwenTtsService.js](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/services/qwenTtsService.js) - 阿里云千问TTS WebSocket服务
   - [qwenTtsHttpService.js](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/services/qwenTtsHttpService.js) - 阿里云千问TTS HTTP服务
   - [tencentTtsService.js](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/services/tencentTtsService.js) - 腾讯云TTS服务
   - [volcengineTtsService.js](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/services/volcengineTtsService.js) - 火山引擎TTS HTTP服务
   - [volcengineTtsWsService.js](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/services/volcengineTtsWsService.js) - 火山引擎TTS WebSocket服务

2. **路由模块 (routes/)**
   - [ttsRoutes.js](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/routes/ttsRoutes.js) - CosyVoice路由
   - [qwenTtsRoutes.js](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/routes/qwenTtsRoutes.js) - 千问TTS WebSocket路由
   - [qwenTtsHttpRoutes.js](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/routes/qwenTtsHttpRoutes.js) - 千问TTS HTTP路由
   - [tencentTtsRoutes.js](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/routes/tencentTtsRoutes.js) - 腾讯云TTS路由
   - [volcengineTtsRoutes.js](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/routes/volcengineTtsRoutes.js) - 火山引擎TTS HTTP路由
   - [volcengineTtsWsRoutes.js](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/routes/volcengineTtsWsRoutes.js) - 火山引擎TTS WebSocket路由
   - [adminRoutes.js](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/routes/adminRoutes.js) - 管理界面路由
   - [unifiedTtsRoutes.js](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/routes/unifiedTtsRoutes.js) - 统一TTS路由

3. **工具模块 (utils/)**
   - [aliyunSignature.js](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/utils/aliyunSignature.js) - 阿里云签名工具
   - [tencentCloudSignature.js](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/utils/tencentCloudSignature.js) - 腾讯云签名工具

### API设计规范

所有API遵循统一的设计规范：

1. **请求格式**
   - Content-Type: application/json
   - 所有参数通过JSON格式传递

2. **响应格式**
   ```json
   {
     "success": true/false,
     "data": {}, // 成功时返回数据
     "error": "" // 失败时返回错误信息
   }
   ```

3. **统一错误处理**
   - 所有服务都应捕获并处理异常
   - 返回统一的错误格式

### 添加新的TTS服务

要添加新的TTS服务，请按照以下步骤操作：

1. 在 [services/](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/services/) 目录下创建服务实现文件
2. 实现以下核心方法：
   - `synthesize(text, options)` - 文本合成方法
   - `getAvailableVoices()` - 获取音色列表方法
3. 在 [routes/](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/routes/) 目录下创建路由文件
4. 在 [index.js](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/index.js) 中注册新路由
5. 在前端 [index.html](file:///C:/Users/Administrator/Desktop/BD/cs/Node.js%20+%20Express/public/index.html) 中添加相关UI元素
6. 更新本README文档

### 音色管理规范

每个TTS服务都应实现 `getAvailableVoices()` 方法，返回统一格式的音色列表：

```javascript
[
  {
    id: 'voice_id',
    name: '音色名称',
    language: '语言代码', // 如: zh-CN, en-US
    gender: '性别',      // male 或 female
    model: '模型版本',   // 如: cosyvoice-v1, cosyvoice-v2 (可选)
    type: '音色类型'     // 如: 情感, 特色 (可选)
  }
]
```

### WebSocket服务实现要点

对于WebSocket服务，需要注意以下几点：

1. 使用标准WebSocket协议
2. 实现心跳机制保持连接
3. 正确处理连接状态变化
4. 实现二进制数据传输（如适用）
5. 提供完整的事件处理机制

### HTTP服务实现要点

对于HTTP服务，需要遵循以下规范：

1. 使用RESTful API设计
2. 正确设置HTTP状态码
3. 实现请求参数验证
4. 提供详细的错误信息
5. 支持CORS跨域请求

### 测试规范

每个服务都应包含相应的测试文件：

1. 功能测试 - 验证核心功能
2. 错误测试 - 验证异常处理
3. 参数验证测试 - 验证输入参数处理
4. 集成测试 - 验证与其他模块的集成

运行测试:
```
npm test
```

### 前端集成指南

前端通过标准的fetch或WebSocket API与后端通信：

1. **获取音色列表**
   ```javascript
   fetch('/api/tts/voices')
     .then(response => response.json())
     .then(data => {
       // 处理音色列表
     });
   ```

2. **调用TTS服务**
   ```javascript
   fetch('/api/tts', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({
       text: '待合成文本',
       voice: '音色ID'
     })
   })
   .then(response => response.json())
   .then(data => {
     // 处理返回的音频数据
   });
   ```

3. **WebSocket连接**
   ```javascript
   const ws = new WebSocket('ws://localhost:3000/api/tts');
   ws.onopen = function() {
     // 发送文本
   };
   ws.onmessage = function(event) {
     // 处理返回的音频数据
   };
   ```

### 安全考虑

1. **API密钥保护**
   - 所有API密钥存储在环境变量中
   - 不在代码中硬编码密钥
   - 不将密钥提交到版本控制系统

2. **输入验证**
   - 所有用户输入都应验证和清理
   - 防止注入攻击

3. **访问控制**
   - 管理界面应有访问控制
   - 敏感操作需要身份验证

### 性能优化建议

1. **音频文件缓存**
   - 合成的音频文件存储在服务器上
   - 避免重复合成相同内容

2. **连接复用**
   - WebSocket连接应尽可能复用
   - 减少连接建立开销

3. **异步处理**
   - 耗时操作应异步处理
   - 避免阻塞主线程

## 许可证

MIT