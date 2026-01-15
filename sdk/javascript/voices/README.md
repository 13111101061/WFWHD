# TTS 音色工厂 SDK - 前端版

> 🎙️ 轻松获取和管理TTS音色库的前端JavaScript SDK

## 📦 安装

### 方式1: 直接引入

```html
<!-- 引入SDK -->
<script src="/sdk/javascript/voices/VoiceLibraryClient.js"></script>

<!-- 或使用压缩版本 -->
<script src="/sdk/javascript/voices/VoiceLibraryClient.min.js"></script>
```

### 方式2: ES6模块

```javascript
import VoiceLibraryClient from '/sdk/javascript/voices/VoiceLibraryClient.js';
```

### 方式3: NPM (待发布)

```bash
npm install @tts-voice-factory/client
```

## 🚀 快速开始

### 基础使用

```javascript
// 1. 创建客户端实例
const voiceClient = new VoiceLibraryClient({
  apiBaseUrl: '/api',
  apiKey: 'your-api-key',  // 可选
  timeout: 10000,          // 请求超时时间(毫秒)
  cacheTTL: 300000         // 缓存有效期(毫秒, 默认5分钟)
});

// 2. 获取所有音色
const voices = await voiceClient.getVoices();
console.log(`加载了 ${voices.length} 个音色`);

// 3. 查找特定音色
const kaiVoice = await voiceClient.getVoiceById('aliyun-qwen-kai');
console.log('Kai音色:', kaiVoice);
```

### 在浏览器中使用

```html
<!DOCTYPE html>
<html>
<head>
  <title>TTS音色库示例</title>
  <script src="/sdk/javascript/voices/VoiceLibraryClient.js"></script>
</head>
<body>
  <div id="voice-list"></div>

  <script>
    const client = new VoiceLibraryClient();

    // 加载音色列表
    async function loadVoices() {
      try {
        const voices = await client.getVoices();
        displayVoices(voices);
      } catch (error) {
        console.error('加载失败:', error);
      }
    }

    // 显示音色列表
    function displayVoices(voices) {
      const container = document.getElementById('voice-list');
      container.innerHTML = voices.map(voice => `
        <div class="voice-item">
          <h3>${voice.name}</h3>
          <p>语言: ${voice.languages.join(', ')}</p>
          <p>标签: ${voice.tags.join(', ')}</p>
        </div>
      `).join('');
    }

    loadVoices();
  </script>
</body>
</html>
```

## 📖 API 文档

### 构造函数

```javascript
new VoiceLibraryClient(config)
```

**参数:**
- `config.apiBaseUrl` (string) - API基础URL，默认: `/api`
- `config.apiKey` (string) - API密钥，可选
- `config.timeout` (number) - 请求超时时间(毫秒)，默认: `10000`
- `config.cacheTTL` (number) - 缓存有效期(毫秒)，默认: `300000` (5分钟)

### 核心方法

#### 1. 获取所有音色

```javascript
const voices = await voiceClient.getVoices(options);
```

**参数:**
- `options.useCache` (boolean) - 是否使用缓存，默认: `true`
- `options.forceRefresh` (boolean) - 强制刷新，默认: `false`

**返回:** `Array<Voice>` - 音色数组

**示例:**
```javascript
// 使用缓存
const voices = await voiceClient.getVoices();

// 强制刷新
const freshVoices = await voiceClient.getVoices({
  forceRefresh: true
});
```

#### 2. 根据ID获取音色

```javascript
const voice = await voiceClient.getVoiceById(systemId);
```

**参数:**
- `systemId` (string) - 音色系统ID，如: `'aliyun-qwen-kai'`

**返回:** `Voice` - 音色对象

**示例:**
```javascript
const kai = await voiceClient.getVoiceById('aliyun-qwen-kai');
console.log(kai.name);  // "Kai"
```

#### 3. 按服务商筛选

```javascript
const voices = await voiceClient.getVoicesByProvider(provider);
```

**参数:**
- `provider` (string) - 服务商名称，如: `'aliyun'`, `'tencent'`

**返回:** `Array<Voice>`

**示例:**
```javascript
const aliyunVoices = await voiceClient.getVoicesByProvider('aliyun');
console.log(`阿里云音色: ${aliyunVoices.length} 个`);
```

#### 4. 按标签筛选

```javascript
const voices = await voiceClient.getVoicesByTag(tag);
```

**参数:**
- `tag` (string) - 标签名称，如: `'热门'`, `'双语'`, `'可爱'`

**返回:** `Array<Voice>`

**示例:**
```javascript
const hotVoices = await voiceClient.getVoicesByTag('热门');
const cuteVoices = await voiceClient.getVoicesByTag('可爱');
```

#### 5. 搜索音色

```javascript
const voices = await voiceClient.searchVoices(keyword, options);
```

**参数:**
- `keyword` (string) - 搜索关键词
- `options.fields` (Array<string>) - 搜索字段，默认: `['name', 'tags', 'description']`

**返回:** `Array<Voice>`

**示例:**
```javascript
// 搜索名字包含"可爱"的音色
const results = await voiceClient.searchVoices('可爱');

// 自定义搜索范围
const results = await voiceClient.searchVoices('男声', {
  fields: ['name', 'description']
});
```

#### 6. 高级筛选

```javascript
const voices = await voiceClient.filterVoices(filters);
```

**参数:**
- `filters.provider` (string) - 服务商
- `filters.gender` (string) - 性别: `'male'` | `'female'`
- `filters.language` (string) - 语言代码: `'zh-CN'`, `'en-US'` 等
- `filters.tags` (Array<string>) - 标签数组
- `filters.search` (string) - 搜索关键词

**返回:** `Array<Voice>`

**示例:**
```javascript
// 筛选阿里云的女声、中文、热门音色
const results = await voiceClient.filterVoices({
  provider: 'aliyun',
  gender: 'female',
  language: 'zh-CN',
  tags: ['热门']
});

// 搜索并筛选
const results = await voiceClient.filterVoices({
  search: 'Kai',
  provider: 'aliyun'
});
```

### 辅助方法

#### 获取服务商列表

```javascript
const providers = await voiceClient.getProviders();
// [{ provider: 'aliyun', service: 'qwen_http', count: 45, models: [...] }, ...]
```

#### 获取标签列表

```javascript
const tags = await voiceClient.getTags();
// [{ name: '热门', count: 10 }, { name: '双语', count: 25 }, ...]
```

#### 按性别筛选

```javascript
const maleVoices = await voiceClient.getVoicesByGender('male');
const femaleVoices = await voiceClient.getVoicesByGender('female');
```

#### 按语言筛选

```javascript
const chineseVoices = await voiceClient.getVoicesByLanguage('zh-CN');
const englishVoices = await voiceClient.getVoicesByLanguage('en-US');
```

#### 获取统计信息

```javascript
const stats = await voiceClient.getStatistics();
// {
//   total: 49,
//   byProvider: { aliyun: 45, tencent: 4 },
//   byGender: { male: 25, female: 24 },
//   byLanguage: { 'zh-CN': 40, 'en-US': 30, ... },
//   byTag: { '热门': 10, '双语': 25, ... },
//   byModel: { 'qwen3-tts-flash': 45, ... }
// }
```

#### 获取推荐音色

```javascript
const recommended = await voiceClient.getRecommendedVoices({
  limit: 10,      // 返回数量
  provider: 'aliyun'  // 可选：指定服务商
});
```

#### 批量获取音色

```javascript
const voices = await voiceClient.getVoicesByIds([
  'aliyun-qwen-kai',
  'aliyun-qwen-cherry',
  'aliyun-qwen-momo'
]);
```

### 缓存管理

```javascript
// 清除缓存
voiceClient.clearCache();

// 强制刷新数据
const freshVoices = await voiceClient.getVoices({ forceRefresh: true });
```

### 事件监听

```javascript
// 监听音色加载完成事件
voiceClient.on('voicesLoaded', (voices) => {
  console.log(`音色加载完成，共 ${voices.length} 个`);
});

// 监听其他事件（SDK可扩展）
```

### 数据导出

```javascript
// 导出为JSON字符串
const jsonStr = await voiceClient.exportToJSON({ pretty: true });

// 下载为文件
function downloadVoiceData() {
  voiceClient.exportToJSON({ pretty: true })
    .then(json => {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'voices.json';
      a.click();
      URL.revokeObjectURL(url);
    });
}
```

## 📋 数据结构

### Voice 对象

```typescript
interface Voice {
  id: string;              // 系统ID (如: 'aliyun-qwen-kai')
  name: string;            // 音色名称 (如: 'Kai')
  provider: string;        // 服务商 (如: 'aliyun')
  service: string;         // 服务类型 (如: 'qwen_http')
  voiceId: string;         // 厂商音色ID (如: 'Kai')
  model: string;           // 模型名称 (如: 'qwen3-tts-flash')
  gender: string;          // 性别: 'male' | 'female'
  languages: string[];     // 支持的语言 (如: ['zh-CN', 'en-US'])
  tags: string[];          // 标签 (如: ['舒缓', '年轻男性'])
  description?: string;    // 描述（可选）
  systemId?: string;       // 系统ID别名（可选）
}
```

## 💡 使用场景

### 场景1: 音色选择器

```javascript
class VoiceSelector {
  constructor(containerId, client) {
    this.container = document.getElementById(containerId);
    this.client = client;
    this.selectedVoice = null;
  }

  async init() {
    const voices = await this.client.getVoices();
    this.render(voices);
  }

  render(voices) {
    this.container.innerHTML = voices.map(voice => `
      <div class="voice-option" data-id="${voice.id}">
        <span class="voice-name">${voice.name}</span>
        <span class="voice-tags">${voice.tags.join(', ')}</span>
      </div>
    `).join('');

    // 绑定点击事件
    this.container.querySelectorAll('.voice-option').forEach(el => {
      el.addEventListener('click', () => this.selectVoice(el.dataset.id));
    });
  }

  async selectVoice(voiceId) {
    this.selectedVoice = await this.client.getVoiceById(voiceId);
    console.log('选中音色:', this.selectedVoice);
    // 触发回调或发送到后端
  }
}

// 使用
const selector = new VoiceSelector('voice-selector', voiceClient);
selector.init();
```

### 场景2: 智能搜索

```javascript
class VoiceSearch {
  constructor(client) {
    this.client = client;
    this.searchInput = document.getElementById('search-input');
    this.resultsContainer = document.getElementById('search-results');

    this.searchInput.addEventListener('input', this.debounce(this.onSearch.bind(this), 300));
  }

  async onSearch(e) {
    const keyword = e.target.value.trim();

    if (!keyword) {
      this.resultsContainer.innerHTML = '';
      return;
    }

    const results = await this.client.searchVoices(keyword);
    this.displayResults(results);
  }

  displayResults(voices) {
    this.resultsContainer.innerHTML = voices.map(voice => `
      <div class="search-result">
        <strong>${voice.name}</strong>
        <p>${voice.languages.join(', ')} | ${voice.tags.join(', ')}</p>
      </div>
    `).join('');
  }

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
}
```

### 场景3: 筛选器

```javascript
class VoiceFilter {
  constructor(client) {
    this.client = client;
    this.filters = {
      provider: null,
      gender: null,
      language: null,
      tags: []
    };

    this.setupFilters();
  }

  setupFilters() {
    // 服务商筛选
    document.getElementById('provider-select').addEventListener('change', (e) => {
      this.filters.provider = e.target.value || null;
      this.applyFilters();
    });

    // 性别筛选
    document.querySelectorAll('input[name="gender"]').forEach(input => {
      input.addEventListener('change', (e) => {
        this.filters.gender = e.target.value || null;
        this.applyFilters();
      });
    });

    // 标签筛选
    document.querySelectorAll('input[name="tags"]').forEach(input => {
      input.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.filters.tags.push(e.target.value);
        } else {
          this.filters.tags = this.filters.tags.filter(t => t !== e.target.value);
        }
        this.applyFilters();
      });
    });
  }

  async applyFilters() {
    const voices = await this.client.filterVoices(this.filters);
    this.displayResults(voices);
  }

  displayResults(voices) {
    // 显示筛选结果
    console.log(`找到 ${voices.length} 个音色`);
  }
}
```

## 🔧 高级配置

### 自定义请求拦截器

```javascript
const client = new VoiceLibraryClient();

// 覆盖请求方法
const originalRequest = client._request.bind(client);
client._request = async function(endpoint, options) {
  // 添加自定义逻辑
  console.log(`请求: ${endpoint}`);

  // 添加认证token
  options.headers = {
    ...options.headers,
    'Authorization': `Bearer ${getAuthToken()}`
  };

  return originalRequest(endpoint, options);
};
```

### 错误处理

```javascript
try {
  const voices = await voiceClient.getVoices();
} catch (error) {
  if (error.message.includes('超时')) {
    console.error('请求超时，请检查网络连接');
  } else if (error.message.includes('401')) {
    console.error('API密钥无效');
  } else {
    console.error('发生错误:', error.message);
  }
}
```

## 🌐 浏览器兼容性

- Chrome/Edge: ✅ 完全支持
- Firefox: ✅ 完全支持
- Safari: ✅ 完全支持 (12+)
- IE: ❌ 不支持 (需要polyfills)

## 📝 更新日志

### v1.0.0 (2026-01-11)
- ✅ 初始版本发布
- ✅ 支持音色查询、搜索、筛选
- ✅ 支持缓存机制
- ✅ 支持事件监听
- ✅ 完整的TypeScript类型定义

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📄 许可证

MIT License
