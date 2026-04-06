# 前端音色展示 API 文档

## 概述

| 项目 | 说明 |
|------|------|
| **接口地址** | `GET /api/tts/frontend` |
| **认证方式** | 无需认证（公开接口） |
| **响应格式** | JSON |
| **用途** | 前端音色选择器专用，精简数据结构 |

---

## 接口说明

该接口专为**前端音色展示场景**设计，返回精简的音色数据和预聚合的筛选选项。

### 设计特点

| 特点 | 说明 |
|------|------|
| **精简字段** | 只返回 7 个展示必需字段，减少约 60% 数据传输量 |
| **预聚合筛选** | 一次性返回所有筛选选项，无需二次请求 |
| **无认证** | 公开接口，适合 CDN 缓存 |
| **缓存友好** | 响应数据稳定，可长期缓存 |

---

## 请求示例

### cURL

```bash
curl http://localhost:3000/api/tts/frontend
```

### JavaScript (fetch)

```javascript
const response = await fetch('http://localhost:3000/api/tts/frontend');
const { data } = await response.json();

// 使用音色数据
console.log(`共 ${data.total} 个音色`);
console.log(`筛选选项:`, data.filters);
```

### JavaScript (axios)

```javascript
const { data } = await axios.get('http://localhost:3000/api/tts/frontend');
const { voices, filters, total } = data.data;
```

---

## 响应结构

### 成功响应 (200 OK)

```json
{
  "success": true,
  "data": {
    "voices": [...],
    "filters": {
      "genders": [...],
      "languages": [...],
      "tags": [...]
    },
    "total": 50
  },
  "timestamp": "2026-03-23T11:02:02.353Z"
}
```

---

## 音色对象结构 (Voice)

每个音色对象只包含 **7 个展示字段**：

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `id` | string | 全局唯一标识 | `"aliyun-qwen_http-cherry"` |
| `displayName` | string | 展示名称（中文） | `"爱千月"` |
| `gender` | string | 性别 | `"female"` / `"male"` |
| `languages` | string[] | 支持语言列表 | `["中文"]` |
| `tags` | string[] | 标签列表 | `["舒缓", "亲切", "自然"]` |
| `description` | string | 音色描述 | `"阳光积极的邻家姐姐..."` |
| `preview` | string | 预览音频 URL | `"http://..."` |

### 音色示例

```json
{
  "id": "aliyun-qwen_http-cherry",
  "displayName": "爱千月",
  "gender": "female",
  "languages": ["中文"],
  "tags": ["舒缓", "亲切", "自然", "治愈", "温柔", "温暖"],
  "description": "阳光积极的邻家姐姐，用亲切自然的话语予人最贴心的治愈。",
  "preview": "http://bf.9p.pw/YP-WJ/QWEN-LA/cherry.wav"
}
```

---

## 筛选选项结构 (Filters)

`filters` 字段包含三个预聚合的分类数组，可直接用于前端筛选器渲染：

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `genders` | string[] | 性别选项 | `["female", "male"]` |
| `languages` | string[] | 语言选项 | `["中文", "英语", "日语", ...]` |
| `tags` | string[] | 标签选项 | `["温柔", "专业", "二次元", ...]` |

### 筛选选项示例

```json
{
  "genders": ["female", "male"],
  "languages": ["中文", "俄语", "德语", "意大利语", "日语", "法语", "英语", "西班牙语", "韩语"],
  "tags": ["ASMR", "专业", "个性", "乖巧", "二次元", "京腔", ...]
}
```

---

## 完整响应示例

```json
{
  "success": true,
  "data": {
    "voices": [
      {
        "id": "moss-tts-ashui",
        "displayName": "阿树",
        "gender": "female",
        "languages": ["中文"],
        "tags": ["松弛", "耐听", "女声"],
        "description": "冬天清晨的灰白天空，风很冷，但阳光迟早会出来。",
        "preview": ""
      },
      {
        "id": "aliyun-qwen_http-cherry",
        "displayName": "爱千月",
        "gender": "female",
        "languages": ["中文"],
        "tags": ["舒缓", "亲切", "自然", "治愈", "温柔", "温暖"],
        "description": "阳光积极的邻家姐姐，用亲切自然的话语予人最贴心的治愈。",
        "preview": "http://bf.9p.pw/YP-WJ/QWEN-LA/cherry.wav"
      },
      {
        "id": "aliyun-qwen_http-ethan",
        "displayName": "爱晨曦",
        "gender": "male",
        "languages": ["中文"],
        "tags": ["阳光", "温暖", "活力", "朝气", "磁性", "可靠"],
        "description": "充满朝气与活力的青年之声，温暖有力，尽显北方口音的爽朗与可靠。",
        "preview": "http://bf.9p.pw/YP-WJ/QWEN-LA/ethan.wav"
      }
    ],
    "filters": {
      "genders": ["female", "male"],
      "languages": ["中文", "俄语", "德语", "意大利语", "日语", "法语", "英语", "西班牙语", "韩语"],
      "tags": ["ASMR", "专业", "个性", "乖巧", "乡土", "二次元", "京腔", "亲切", ...]
    },
    "total": 50
  },
  "timestamp": "2026-03-23T11:02:02.353Z"
}
```

---

## 前端使用示例

### Vue 3 组件示例

```vue
<template>
  <div class="voice-selector">
    <!-- 筛选器 -->
    <div class="filters">
      <select v-model="selectedGender">
        <option value="">全部性别</option>
        <option v-for="g in filters.genders" :key="g" :value="g">{{ g }}</option>
      </select>
      
      <select v-model="selectedLanguage">
        <option value="">全部语言</option>
        <option v-for="l in filters.languages" :key="l" :value="l">{{ l }}</option>
      </select>
    </div>
    
    <!-- 音色列表 -->
    <div class="voice-list">
      <div 
        v-for="voice in filteredVoices" 
        :key="voice.id" 
        class="voice-card"
        @click="selectVoice(voice)"
      >
        <h3>{{ voice.displayName }}</h3>
        <p>{{ voice.description }}</p>
        <span v-for="tag in voice.tags" :key="tag" class="tag">{{ tag }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';

const voices = ref([]);
const filters = ref({ genders: [], languages: [], tags: [] });
const selectedGender = ref('');
const selectedLanguage = ref('');

// 本地筛选
const filteredVoices = computed(() => {
  return voices.value.filter(v => {
    if (selectedGender.value && v.gender !== selectedGender.value) return false;
    if (selectedLanguage.value && !v.languages.includes(selectedLanguage.value)) return false;
    return true;
  });
});

// 加载数据
onMounted(async () => {
  const res = await fetch('/api/tts/frontend');
  const { data } = await res.json();
  voices.value = data.voices;
  filters.value = data.filters;
});

function selectVoice(voice) {
  console.log('选中音色:', voice.id);
}
</script>
```

### React 组件示例

```jsx
import { useState, useEffect, useMemo } from 'react';

function VoiceSelector() {
  const [voices, setVoices] = useState([]);
  const [filters, setFilters] = useState({ genders: [], languages: [], tags: [] });
  const [selectedGender, setSelectedGender] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('');

  useEffect(() => {
    fetch('/api/tts/frontend')
      .then(res => res.json())
      .then(({ data }) => {
        setVoices(data.voices);
        setFilters(data.filters);
      });
  }, []);

  // 本地筛选
  const filteredVoices = useMemo(() => {
    return voices.filter(v => {
      if (selectedGender && v.gender !== selectedGender) return false;
      if (selectedLanguage && !v.languages.includes(selectedLanguage)) return false;
      return true;
    });
  }, [voices, selectedGender, selectedLanguage]);

  return (
    <div>
      {/* 筛选器 */}
      <select value={selectedGender} onChange={e => setSelectedGender(e.target.value)}>
        <option value="">全部性别</option>
        {filters.genders.map(g => <option key={g} value={g}>{g}</option>)}
      </select>
      
      {/* 音色列表 */}
      {filteredVoices.map(voice => (
        <div key={voice.id} className="voice-card">
          <h3>{voice.displayName}</h3>
          <p>{voice.description}</p>
          {voice.tags.map(tag => <span key={tag} className="tag">{tag}</span>)}
        </div>
      ))}
    </div>
  );
}
```

---

## 与其他接口对比

| 接口 | 字段数 | 认证 | 用途 |
|------|--------|------|------|
| `GET /api/tts/frontend` | 7 | 无 | 前端展示、精简数据 |
| `GET /api/tts/voices` | 15+ | 无 | 完整列表、管理后台 |
| `GET /api/tts/voices/:id` | 20+ | 无 | 音色详情页 |
| `GET /api/tts/catalog` | 完整 | 无 | 完整目录、含 index |

**选择建议：**
- 🎯 **前端音色选择器** → 使用 `/frontend`（本接口）
- 📋 **管理后台列表** → 使用 `/voices`
- 📖 **音色详情页** → 使用 `/voices/:id`

---

## 错误响应

该接口为公开接口，一般不会返回错误。如遇服务异常：

### 500 服务器错误

```json
{
  "success": false,
  "error": "Internal Server Error",
  "timestamp": "2026-03-23T11:02:02.353Z"
}
```

---

## 性能建议

1. **前端缓存** - 响应数据稳定，可缓存 5-10 分钟
2. **CDN 加速** - 无认证要求，适合 CDN 缓存
3. **本地筛选** - 数据量小（~50条），推荐客户端筛选而非请求参数筛选

---

## 相关文档

- [VOICE_API.md](./VOICE_API.md) - 完整音色 API 文档
- [VOICE_DTO.md](./VOICE_DTO.md) - 音色 DTO 结构详解
- [FRONTEND_GUIDE.md](./FRONTEND_GUIDE.md) - 前端集成指南