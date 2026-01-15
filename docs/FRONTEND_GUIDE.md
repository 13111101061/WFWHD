# 🎤 TTS 前端调用指南

## 📋 概述

本指南介绍如何在前端页面中集成和使用TTS服务，包括声音模型查询、语音合成和音频播放等功能。

## 🚀 快速开始

### 1. 基础配置

```javascript
// 配置API信息
const config = {
    apiBaseUrl: 'http://localhost:3000',
    apiKey: 'key2'  // 替换为你的实际API密钥
};
```

### 2. 基础API调用

```javascript
// 获取所有声音模型
async function getAllModels() {
    const response = await fetch(`${config.apiBaseUrl}/api/voice-models/models`, {
        method: 'GET',
        headers: {
            'X-API-Key': config.apiKey
        }
    });

    const data = await response.json();
    if (data.success) {
        return data.data;
    } else {
        throw new Error(data.error);
    }
}
```

## 🔧 核心功能

### 声音模型管理

#### 获取所有模型
```javascript
async function loadAllModels() {
    try {
        const response = await fetch(`${config.apiBaseUrl}/api/voice-models/models`, {
            method: 'GET',
            headers: {
                'X-API-Key': config.apiKey
            }
        });

        const data = await response.json();

        if (data.success) {
            console.log(`成功加载 ${data.data.length} 个声音模型`);
            return data.data;
        } else {
            console.error('加载失败:', data.error);
            return [];
        }
    } catch (error) {
        console.error('请求出错:', error);
        return [];
    }
}
```

#### 按分类获取模型
```javascript
async function getModelsByCategory(category) {
    // category: 'female', 'male', 'child', 'character'
    try {
        const response = await fetch(`${config.apiBaseUrl}/api/voice-models/categories/${category}`, {
            method: 'GET',
            headers: {
                'X-API-Key': config.apiKey
            }
        });

        const data = await response.json();

        if (data.success) {
            return data.data.models;
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error(`获取${category}模型失败:`, error);
        return [];
    }
}
```

#### 按标签获取模型
```javascript
async function getModelsByTag(tag) {
    // tag: 'popular', 'sweet', 'professional', 'storytelling', etc.
    try {
        const response = await fetch(`${config.apiBaseUrl}/api/voice-models/tags/${tag}`, {
            method: 'GET',
            headers: {
                'X-API-Key': config.apiKey
            }
        });

        const data = await response.json();

        if (data.success) {
            return data.data.models;
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error(`获取${tag}标签模型失败:`, error);
        return [];
    }
}
```

#### 搜索模型
```javascript
async function searchModels(query) {
    try {
        const response = await fetch(`${config.apiBaseUrl}/api/voice-models/search?q=${encodeURIComponent(query)}`, {
            method: 'GET',
            headers: {
                'X-API-Key': config.apiKey
            }
        });

        const data = await response.json();

        if (data.success) {
            return data.data.models;
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('搜索模型失败:', error);
        return [];
    }
}
```

### 语音合成

#### 统一TTS接口
```javascript
async function synthesizeSpeech(text, options = {}) {
    const defaultOptions = {
        service: 'aliyun_cosyvoice',
        voice: 'longxiaochun_v2',
        speed: 1.0,
        pitch: 1.0,
        volume: 5
    };

    const requestParams = { ...defaultOptions, ...options, text };

    try {
        const response = await fetch(`${config.apiBaseUrl}/api/tts/synthesize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': config.apiKey
            },
            body: JSON.stringify(requestParams)
        });

        const data = await response.json();

        if (data.success) {
            return data.data;
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('语音合成失败:', error);
        throw error;
    }
}
```

#### 使用示例
```javascript
// 基础语音合成
async function basicSynthesis() {
    try {
        const result = await synthesizeSpeech('你好，这是语音合成测试', {
            service: 'aliyun_cosyvoice',
            voice: 'longxiaochun_v2'
        });

        console.log('合成成功:', result.audioUrl);
        playAudio(result.audioUrl);
    } catch (error) {
        console.error('合成失败:', error);
    }
}

// 高级语音合成（带参数）
async function advancedSynthesis() {
    try {
        const result = await synthesizeSpeech('这是一个高级语音合成测试', {
            service: 'aliyun_cosyvoice',
            voice: 'longxiaochun_v2',
            speed: 1.2,
            pitch: 0.8,
            volume: 7
        });

        console.log('合成成功:', result);
        playAudio(result.audioUrl);
    } catch (error) {
        console.error('合成失败:', error);
    }
}
```

### 音频播放

#### 创建音频播放器
```javascript
function createAudioPlayer(audioUrl) {
    const audio = new Audio(audioUrl);

    return {
        audio,
        play: () => audio.play(),
        pause: () => audio.pause(),
        stop: () => {
            audio.pause();
            audio.currentTime = 0;
        },
        setVolume: (volume) => {
            audio.volume = Math.max(0, Math.min(1, volume));
        },
        setPlaybackRate: (rate) => {
            audio.playbackRate = Math.max(0.5, Math.min(2, rate));
        },
        on: (event, callback) => {
            audio.addEventListener(event, callback);
        }
    };
}
```

#### 快速播放音频
```javascript
async function playAudio(text, options = {}) {
    try {
        const result = await synthesizeSpeech(text, options);

        if (result.audioUrl) {
            const player = createAudioPlayer(result.audioUrl);

            // 设置音频事件监听
            player.on('ended', () => {
                console.log('音频播放完成');
            });

            player.on('error', (error) => {
                console.error('音频播放错误:', error);
            });

            player.play();
            return player;
        } else {
            throw new Error('合成成功但未返回音频URL');
        }
    } catch (error) {
        console.error('播放音频失败:', error);
        throw error;
    }
}
```

## 🎯 实际应用示例

### 示例1：简单的TTS播放器
```html
<div class="tts-player">
    <input type="text" id="textInput" placeholder="输入要转换的文本" value="你好，世界！">
    <select id="voiceSelect">
        <option value="">选择音色</option>
    </select>
    <button onclick="speak()">播放</button>
    <button onclick="stop()">停止</button>
</div>

<script>
// 初始化音色选择
async function initVoiceSelect() {
    const models = await getAllModels();
    const voiceSelect = document.getElementById('voiceSelect');

    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.voiceId;
        option.textContent = `${model.name} (${model.provider})`;
        voiceSelect.appendChild(option);
    });
}

let currentPlayer = null;

async function speak() {
    const text = document.getElementById('textInput').value;
    const voiceId = document.getElementById('voiceSelect').value;

    if (!text.trim()) {
        alert('请输入文本');
        return;
    }

    if (!voiceId) {
        alert('请选择音色');
        return;
    }

    try {
        // 停止当前播放
        if (currentPlayer) {
            currentPlayer.stop();
        }

        currentPlayer = await playAudio(text, {
            service: 'aliyun_cosyvoice',
            voice: voiceId
        });
    } catch (error) {
        alert('播放失败: ' + error.message);
    }
}

function stop() {
    if (currentPlayer) {
        currentPlayer.stop();
        currentPlayer = null;
    }
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', initVoiceSelect);
</script>
```

### 示例2：批量文本转换
```javascript
async function batchSynthesize(texts, options = {}) {
    const results = [];

    for (let i = 0; i < texts.length; i++) {
        try {
            console.log(`正在处理第 ${i + 1}/${texts.length} 段文本...`);

            const result = await synthesizeSpeech(texts[i], options);
            results.push({
                index: i,
                text: texts[i],
                success: true,
                data: result
            });
        } catch (error) {
            results.push({
                index: i,
                text: texts[i],
                success: false,
                error: error.message
            });
        }
    }

    return results;
}

// 使用示例
const texts = [
    '第一段文本内容',
    '第二段文本内容',
    '第三段文本内容'
];

batchSynthesize(texts, {
    service: 'aliyun_cosyvoice',
    voice: 'longxiaochun_v2'
}).then(results => {
    console.log('批量处理完成:', results);
});
```

### 示例3：智能音色推荐
```javascript
class VoiceRecommendation {
    constructor() {
        this.models = [];
        this.loadModels();
    }

    async loadModels() {
        this.models = await getAllModels();
    }

    // 根据文本内容推荐音色
    recommendVoice(text, preferences = {}) {
        const { gender, age, style } = preferences;

        let candidates = this.models;

        // 按性别筛选
        if (gender) {
            candidates = candidates.filter(model => model.gender === gender);
        }

        // 按年龄筛选
        if (age) {
            candidates = candidates.filter(model => model.age === age);
        }

        // 按风格筛选
        if (style) {
            candidates = candidates.filter(model =>
                model.characteristics.includes(style) ||
                model.tags.includes(style)
            );
        }

        // 如果没有筛选结果，返回热门模型
        if (candidates.length === 0) {
            candidates = this.models.filter(model =>
                model.tags.includes('popular')
            );
        }

        // 返回最佳匹配
        return candidates.length > 0 ? candidates[0] : this.models[0];
    }

    // 智能语音合成
    async smartSynthesize(text, preferences = {}) {
        const recommendedVoice = this.recommendVoice(text, preferences);

        return await synthesizeSpeech(text, {
            service: recommendedVoice.service,
            voice: recommendedVoice.voiceId,
            ...preferences
        });
    }
}

// 使用示例
const recommender = new VoiceRecommendation();

// 为故事推荐音色
recommender.smartSynthesize('从前有一个美丽的小村庄...', {
    style: 'storytelling',
    gender: 'female'
}).then(result => {
    console.log('故事音色推荐:', result);
});

// 为商务通知推荐音色
recommender.smartSynthesize('会议将在10分钟后开始', {
    style: 'professional',
    gender: 'female'
}).then(result => {
    console.log('商务音色推荐:', result);
});
```

## 🛠️ 错误处理

### 通用错误处理
```javascript
class TTSClient {
    constructor(baseUrl, apiKey) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
    }

    async request(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.apiKey,
                    ...options.headers
                },
                ...options
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
            }

            if (!data.success) {
                throw new Error(data.error || '请求失败');
            }

            return data.data;
        } catch (error) {
            console.error('API请求失败:', error);
            throw error;
        }
    }

    async getModels() {
        return await this.request('/api/voice-models/models');
    }

    async synthesize(text, options = {}) {
        return await this.request('/api/tts/synthesize', {
            method: 'POST',
            body: JSON.stringify({ text, ...options })
        });
    }
}

// 使用示例
const client = new TTSClient('http://localhost:3000', 'key2');

client.synthesize('测试文本', {
    service: 'aliyun_cosyvoice',
    voice: 'longxiaochun_v2'
}).then(result => {
    console.log('合成成功:', result);
}).catch(error => {
    console.error('合成失败:', error);
});
```

### 错误类型和处理
```javascript
// 错误类型定义
const TTS_ERRORS = {
    NETWORK_ERROR: '网络连接错误',
    AUTH_ERROR: 'API密钥无效',
    MODEL_NOT_FOUND: '声音模型不存在',
    TEXT_TOO_LONG: '文本长度超过限制',
    SYNTHESIS_FAILED: '语音合成失败',
    RATE_LIMIT: '请求频率过高'
};

// 错误处理函数
function handleTTSError(error) {
    if (error.message.includes('API Key')) {
        return TTS_ERRORS.AUTH_ERROR;
    } else if (error.message.includes('not found')) {
        return TTS_ERRORS.MODEL_NOT_FOUND;
    } else if (error.message.includes('too long')) {
        return TTS_ERRORS.TEXT_TOO_LONG;
    } else if (error.message.includes('rate limit')) {
        return TTS_ERRORS.RATE_LIMIT;
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        return TTS_ERRORS.NETWORK_ERROR;
    } else {
        return TTS_ERRORS.SYNTHESIS_FAILED;
    }
}

// 带错误处理的语音合成
async function safeSynthesize(text, options = {}) {
    try {
        return await synthesizeSpeech(text, options);
    } catch (error) {
        const errorType = handleTTSError(error);
        console.error(`语音合成失败 (${errorType}):`, error);

        // 根据错误类型采取不同措施
        switch (errorType) {
            case TTS_ERRORS.AUTH_ERROR:
                alert('API密钥无效，请检查配置');
                break;
            case TTS_ERRORS.MODEL_NOT_FOUND:
                alert('指定的声音模型不存在，请选择其他模型');
                break;
            case TTS_ERRORS.TEXT_TOO_LONG:
                alert('文本过长，请缩短文本内容');
                break;
            case TTS_ERRORS.NETWORK_ERROR:
                alert('网络连接失败，请检查网络设置');
                break;
            default:
                alert('语音合成失败，请稍后重试');
        }

        throw error;
    }
}
```

## 📱 移动端优化

### 触摸事件支持
```javascript
class MobileTTSPlayer {
    constructor() {
        this.audio = new Audio();
        this.isPlaying = false;
        this.setupTouchEvents();
    }

    setupTouchEvents() {
        // 触摸开始播放
        document.addEventListener('touchstart', () => {
            if (this.audio && !this.isPlaying) {
                this.audio.play().catch(e => {
                    console.log('自动播放被阻止，需要用户交互');
                });
            }
        }, { once: true });
    }

    async playWithUserInteraction(audioUrl) {
        this.audio.src = audioUrl;

        try {
            await this.audio.play();
            this.isPlaying = true;
        } catch (error) {
            console.log('播放失败，可能需要用户交互:', error);
            // 显示播放按钮让用户手动点击
            this.showPlayButton();
        }
    }

    showPlayButton() {
        const playButton = document.createElement('button');
        playButton.textContent = '点击播放';
        playButton.style.position = 'fixed';
        playButton.style.top = '50%';
        playButton.style.left = '50%';
        playButton.style.transform = 'translate(-50%, -50%)';
        playButton.style.zIndex = '9999';

        playButton.onclick = () => {
            this.audio.play();
            document.body.removeChild(playButton);
        };

        document.body.appendChild(playButton);
    }
}
```

### 响应式设计
```css
/* 移动端TTS控件样式 */
.tts-mobile-controls {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    padding: 15px;
    border-radius: 25px;
    display: flex;
    gap: 10px;
    align-items: center;
    z-index: 1000;
}

.tts-mobile-controls button {
    background: none;
    border: none;
    color: white;
    font-size: 20px;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
}

.tts-mobile-controls .progress-bar {
    width: 200px;
    height: 4px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
    overflow: hidden;
}

.tts-mobile-controls .progress-fill {
    height: 100%;
    background: #409eff;
    width: 0%;
    transition: width 0.1s;
}
```

## 🎨 UI组件示例

### 音色选择器
```javascript
class VoiceSelector {
    constructor(containerId, client) {
        this.container = document.getElementById(containerId);
        this.client = client;
        this.voices = [];
        this.init();
    }

    async init() {
        await this.loadVoices();
        this.render();
    }

    async loadVoices() {
        this.voices = await this.client.getModels();
    }

    render() {
        this.container.innerHTML = `
            <div class="voice-selector">
                <h3>选择音色</h3>
                <div class="voice-filters">
                    <button onclick="voiceSelector.filterByGender('female')">女声</button>
                    <button onclick="voiceSelector.filterByGender('male')">男声</button>
                    <button onclick="voiceSelector.filterByTag('popular')">热门</button>
                    <button onclick="voiceSelector.showAll()">全部</button>
                </div>
                <div class="voice-list">
                    ${this.voices.map(voice => this.createVoiceCard(voice)).join('')}
                </div>
            </div>
        `;
    }

    createVoiceCard(voice) {
        return `
            <div class="voice-card" data-voice-id="${voice.voiceId}" onclick="voiceSelector.selectVoice('${voice.voiceId}')">
                <div class="voice-avatar">
                    <img src="/images/avatars/${voice.gender}.png" alt="${voice.name}">
                </div>
                <div class="voice-info">
                    <h4>${voice.name}</h4>
                    <p>${voice.description}</p>
                    <div class="voice-tags">
                        ${voice.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                    </div>
                </div>
                <div class="voice-actions">
                    <button onclick="event.stopPropagation(); voiceSelector.previewVoice('${voice.voiceId}')">试听</button>
                </div>
            </div>
        `;
    }

    selectVoice(voiceId) {
        // 移除之前的选中状态
        document.querySelectorAll('.voice-card').forEach(card => {
            card.classList.remove('selected');
        });

        // 添加选中状态
        const selectedCard = document.querySelector(`[data-voice-id="${voiceId}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
        }

        // 触发选择事件
        this.onVoiceSelected(voiceId);
    }

    async previewVoice(voiceId) {
        try {
            const voice = this.voices.find(v => v.voiceId === voiceId);
            if (voice) {
                await this.client.synthesize('这是试听音频', {
                    service: voice.service,
                    voice: voiceId
                });
            }
        } catch (error) {
            console.error('试听失败:', error);
        }
    }

    onVoiceSelected(voiceId) {
        // 子类可重写此方法
        console.log('已选择音色:', voiceId);
    }
}
```

## 📊 性能优化

### 音频缓存
```javascript
class AudioCache {
    constructor(maxSize = 50) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    // 生成缓存键
    generateKey(text, options) {
        return `${text}_${JSON.stringify(options)}`;
    }

    // 获取缓存
    get(text, options) {
        const key = this.generateKey(text, options);
        return this.cache.get(key);
    }

    // 设置缓存
    set(text, options, audioData) {
        const key = this.generateKey(text, options);

        // 如果缓存已满，删除最旧的条目
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, audioData);
    }

    // 清除缓存
    clear() {
        this.cache.clear();
    }
}

// 带缓存的TTS客户端
class CachedTTSClient extends TTSClient {
    constructor(baseUrl, apiKey, cacheSize = 50) {
        super(baseUrl, apiKey);
        this.cache = new AudioCache(cacheSize);
    }

    async synthesize(text, options = {}) {
        const cacheKey = this.cache.generateKey(text, options);

        // 检查缓存
        const cached = this.cache.get(text, options);
        if (cached) {
            console.log('使用缓存的音频');
            return cached;
        }

        // 进行语音合成
        const result = await super.synthesize(text, options);

        // 缓存结果
        this.cache.set(text, options, result);

        return result;
    }
}
```

### 预加载常用音色
```javascript
class VoicePreloader {
    constructor(client) {
        this.client = client;
        this.preloadedVoices = new Set();
        this.preloadTexts = [
            '你好',
            '谢谢',
            '再见',
            '欢迎',
            '请稍等'
        ];
    }

    async preloadPopularVoices() {
        try {
            const models = await this.client.getModels();
            const popularVoices = models.filter(model =>
                model.tags.includes('popular')
            );

            // 并发预加载
            const promises = popularVoices.slice(0, 3).map(voice =>
                this.preloadVoice(voice)
            );

            await Promise.all(promises);
            console.log('热门音色预加载完成');
        } catch (error) {
            console.error('预加载失败:', error);
        }
    }

    async preloadVoice(voice) {
        if (this.preloadedVoices.has(voice.voiceId)) {
            return;
        }

        try {
            // 预合成的短文本
            const text = this.preloadTexts[0];
            await this.client.synthesize(text, {
                service: voice.service,
                voice: voice.voiceId
            });

            this.preloadedVoices.add(voice.voiceId);
            console.log(`预加载音色: ${voice.name}`);
        } catch (error) {
            console.error(`预加载音色失败 ${voice.name}:`, error);
        }
    }
}
```

## 🔗 相关资源

- [API接口文档](./API_DOCUMENTATION.md)
- [声音模型管理手册](./MODEL_MANAGEMENT.md)
- [Curl调用指南](./CURL_API_GUIDE.md)
- [部署指南](./DEPLOYMENT.md)

---

💡 **提示**:
- 所有API调用都需要有效的API密钥
- 建议在生产环境中实现适当的错误处理和重试机制
- 移动端需要注意自动播放策略的限制
- 可根据实际需求调整缓存策略和预加载方案