# TTS JavaScript SDK

用于调用当前项目的统一 TTS 接口，已对齐现有服务端路由：

- `POST /api/tts/synthesize`
- `POST /api/tts/batch`
- `GET /api/tts/frontend`
- `GET /api/tts/voices?service=...`
- `GET /api/tts/providers`
- `GET /api/tts/capabilities/:service`
- `GET /api/tts/catalog`
- `GET /api/tts/health`
- `GET /api/tts/stats`

## 1. 初始化

```html
<script src="/sdk/javascript/tts/TtsClient.js"></script>
<script>
  const client = new TtsClient({
    apiBaseUrl: '/api',
    apiKey: 'your-api-key',
    timeout: 30000
  });
</script>
```

```javascript
const TtsClient = require('./sdk/javascript/tts/TtsClient');

const client = new TtsClient({
  apiBaseUrl: 'http://localhost:3000/api',
  apiKey: 'your-api-key'
});
```

Node.js 18 以下需要手动传 `fetch`。

## 2. 单条合成

### 2.1 推荐方式：`voiceCode`

```javascript
const result = await client.synthesize({
  text: '你好，这是测试文本',
  voiceCode: '001000030000005',
  speed: 1,
  format: 'mp3'
});

console.log(result.audioUrl);
```

### 2.2 兼容方式：`systemId`

```javascript
const result = await client.synthesize({
  text: '你好',
  systemId: 'moss-tts-ashui'
});
```

### 2.3 指定服务方式：`service + voice`

```javascript
const result = await client.synthesize({
  text: '你好',
  service: 'aliyun_qwen_http',
  voice: 'Cherry',
  speed: 1.1,
  pitch: 0.95
});
```

### 2.4 便捷写法

```javascript
await client.synthesize('你好', {
  service: 'moss_tts',
  voice: '2001257729754140672'
});
```

## 3. 批量合成

批量合成现在分两种模式：

- `server`：走 `/api/tts/batch`，要求必须有 `service`
- `client`：逐条调用 `/api/tts/synthesize`，支持 `voiceCode` / `systemId`
- `auto`：默认模式，SDK 自动判断

### 3.1 服务端批量

```javascript
const result = await client.batchSynthesize({
  texts: ['你好', '欢迎使用 TTS'],
  service: 'aliyun_qwen_http',
  voice: 'Cherry',
  speed: 1,
  mode: 'server'
});
```

### 3.2 基于 `voiceCode` 的批量

```javascript
const result = await client.batchSynthesize({
  texts: ['第一句', '第二句', '第三句'],
  voiceCode: '001000030000005',
  mode: 'client',
  concurrency: 3
});
```

## 4. 服务商快捷方法

```javascript
await client.aliyunQwen('你好', 'Cherry', { speed: 1.05 });
await client.aliyunCosyvoice('你好', 'longxiaochun_v2');
await client.tencent('你好', '101001');
await client.volcengine('你好', 'zh_female_tianmei');
await client.moss('你好', '2001257729754140672', {
  expectedDurationSec: 5
});
await client.minimax('你好', 'female-tianmei', {
  emotion: 'happy'
});
```

## 5. 查询接口

### 5.1 获取前端精简音色列表

```javascript
const result = await client.getVoices();
console.log(result.data.voices);
```

### 5.2 获取某个服务下的音色

```javascript
const result = await client.getServiceVoices('aliyun_qwen_http');
console.log(result.data.voices);
```

### 5.3 获取能力定义

```javascript
const caps = await client.getCapabilities('moss_tts');
console.log(caps.data.parameters);
console.log(caps.data.defaults);
console.log(caps.data.lockedParams);
```

### 5.4 获取完整目录

```javascript
const catalog = await client.getCatalog();
console.log(catalog.data.voices);
```

## 6. 自定义请求

如果需要测试其他 TTS 端点，不要直接调用私有方法，直接用公开的 `get/post/request`。

```javascript
const health = await client.get('/tts/health');
const stats = await client.get('/tts/stats');

const custom = await client.request('/tts/providers', {
  method: 'GET'
});
```

## 7. 事件

```javascript
client.on('requestStart', ({ method, url }) => {
  console.log(`[start] ${method} ${url}`);
});

client.on('requestSuccess', ({ latency, url }) => {
  console.log(`[ok] ${url} ${latency}ms`);
});

client.on('requestError', ({ error, url }) => {
  console.error(`[error] ${url}`, error.message);
});

client.on('synthesizeSuccess', ({ provider, serviceType }) => {
  console.log(`[tts] ${provider}/${serviceType}`);
});
```

## 8. 参数透传规则

SDK 会把以下参数自动整理到请求里：

- 身份参数：`voiceCode`、`systemId`、`service`、`voice`
- 通用参数：`model`、`format`、`sampleRate`、`speed`、`pitch`、`volume`
- 特殊参数：`emotion`、`expectedDurationSec`、`samplingParams`、`seed`
- 其他未知顶层字段：会继续透传，方便后续接新 provider 的特殊参数

如果同时传了 `options` 和顶层参数，顶层参数优先。

## 9. 注意点

- `batchSynthesize` 不是所有场景都走服务端批量接口。`voiceCode/systemId` 会自动切到客户端批量模式。
- `getVoices()` 默认拿的是前端精简列表，不包含完整 provider 运行信息；需要完整信息请用 `getCatalog()`。
- `getHealth()` 和 `getStats()` 走的是受保护接口，没传 `apiKey` 时可能返回鉴权错误。
