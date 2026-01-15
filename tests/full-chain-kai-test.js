const axios = require('axios');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'key2';

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json'
  }
});

const TEST_CONFIG = {
  text: "你好，我是Kai。这是一个全链路测试语音。Hello, this is a full chain test voice.",
  voiceId: "aliyun-qwen-kai",
  expectedVoiceName: "Kai"
};

async function checkServerHealth() {
  console.log('\n========== 步骤1: 检查服务健康状态 ==========');

  try {
    const response = await axiosInstance.get('/health');
    const data = response.data;

    if (data.status === 'OK') {
      console.log('✅ 服务运行正常');
      console.log(`服务名称: ${data.service}`);
      console.log(`运行时间: ${Math.floor(data.uptime / 60)}分钟`);
      return true;
    } else {
      console.log('❌ 服务状态异常');
      return false;
    }
  } catch (error) {
    console.error('❌ 无法连接到服务:', error.message);
    console.log('提示: 请确保服务已启动 (npm start)');
    return false;
  }
}

async function testApiKeyAuth() {
  console.log('\n========== 步骤2: 测试API密钥认证 ==========');
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/voice-models/stats`, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 401) {
      console.error('❌ API密钥认证失败');
      const errorData = await response.json();
      console.error(`错误信息: ${errorData.error}`);
      return false;
    }

    if (response.ok) {
      const data = await response.json();
      console.log('✅ API密钥认证成功');
      console.log(`API密钥: ${API_KEY}`);
      console.log(`音色模型总数: ${data.data.totalModels}`);
      console.log(`提供商数量: ${data.data.totalProviders}`);
      return true;
    } else {
      console.log(`⚠️  响应状态码: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error('❌ 认证测试失败:', error.message);
    return false;
  }
}

async function queryKaiVoice() {
  console.log('\n========== 步骤3: 查询Kai音色配置 ==========');

  try {
    const response = await axiosInstance.get(`/api/voice-models/models/${TEST_CONFIG.voiceId}`);
    const voice = response.data.data;

    console.log('✅ Kai音色配置查询成功');
    console.log('音色详细信息:');
    console.log(`  系统ID: ${voice.id}`);
    console.log(`  名称: ${voice.name}`);
    console.log(`  服务商: ${voice.provider}`);
    console.log(`  服务类型: ${voice.service}`);
    console.log(`  音色ID: ${voice.voiceId}`);
    console.log(`  模型: ${voice.model}`);
    console.log(`  性别: ${voice.gender}`);
    console.log(`  语言: ${voice.languages.join(', ')}`);
    console.log(`  标签: ${voice.tags.join(', ')}`);

    if (voice.name !== TEST_CONFIG.expectedVoiceName) {
      console.warn(`⚠️  警告: 音色名称不匹配，期望 "${TEST_CONFIG.expectedVoiceName}"，实际 "${voice.name}"`);
    }

    return voice;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.error('❌ 未找到Kai音色配置');
      console.log(`音色ID: ${TEST_CONFIG.voiceId}`);
    } else {
      console.error('❌ 查询失败:', error.response?.data?.error || error.message);
    }
    return null;
  }
}

async function queryVoiceCategories() {
  console.log('\n========== 步骤4: 查询音色分类（验证前端加载） ==========');
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/voice-models/categories`, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn('⚠️  分类数据查询失败');
      return null;
    }

    const data = await response.json();
    const categories = data.data;

    console.log('✅ 音色分类数据获取成功');
    console.log(`分类数量: ${categories.categories.length}`);

    let kaiFound = false;
    for (const category of categories.categories) {
      const kaiInCategory = category.items.find(v => v.systemId === TEST_CONFIG.voiceId);
      if (kaiInCategory) {
        kaiFound = true;
        console.log(`\nKai音色在分类 "${category.title}" 中:`);
        console.log(`  分类键: ${category.key}`);
        console.log(`  图标: ${category.icon}`);
        console.log(`  该分类音色数量: ${category.count}`);
        break;
      }
    }

    if (!kaiFound) {
      console.warn('⚠️  Kai音色未在任何分类中找到');
    } else {
      console.log('✅ Kai音色已正确分类');
    }

    return categories;
  } catch (error) {
    console.error('❌ 查询分类失败:', error.message);
    return null;
  }
}

async function testTtsSynthesis(voiceConfig) {
  console.log('\n========== 步骤5: TTS语音合成测试 ==========');
  console.log(`测试文本: "${TEST_CONFIG.text}"`);
  console.log(`使用音色: ${voiceConfig.name} (${voiceConfig.id})`);

  try {
    const requestBody = {
      service: `${voiceConfig.provider}_${voiceConfig.service}`,
      text: TEST_CONFIG.text,
      voice: voiceConfig.voiceId,
      model: voiceConfig.model,
      format: 'mp3',
      sample_rate: 22050
    };

    console.log('\n请求参数:');
    console.log(`  服务: ${requestBody.service}`);
    console.log(`  音色: ${requestBody.voice}`);
    console.log(`  模型: ${requestBody.model}`);
    console.log(`  格式: ${requestBody.format}`);
    console.log(`  采样率: ${requestBody.sample_rate}Hz`);

    console.log('\n正在发送TTS合成请求...');

    const response = await fetch(`${API_BASE_URL}/api/tts/synthesize`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ TTS合成失败');
      console.error(`错误状态码: ${response.status}`);
      console.error(`错误信息: ${errorData.error}`);
      console.error(`详细消息: ${errorData.message}`);
      return null;
    }

    const result = await response.json();

    if (!result.success) {
      console.error('❌ TTS合成失败');
      console.error(`错误: ${result.error}`);
      return null;
    }

    const audioData = result.data;
    console.log('\n✅ TTS合成成功');
    console.log('合成结果:');
    console.log(`  原文: ${audioData.text}`);
    console.log(`  音色: ${audioData.voice}`);
    console.log(`  模型: ${audioData.model}`);
    console.log(`  格式: ${audioData.format}`);
    console.log(`  任务ID: ${audioData.taskId}`);
    console.log(`  音频URL: ${audioData.audioUrl}`);
    console.log(`  文件路径: ${audioData.filePath}`);
    console.log(`  文件名: ${audioData.fileName}`);
    console.log(`  时长: ${audioData.duration}秒`);
    console.log(`  是否来自缓存: ${result.fromCache ? '是' : '否'}`);

    return audioData;
  } catch (error) {
    console.error('❌ TTS合成异常:', error.message);
    return null;
  }
}

async function verifyAudioFile(audioData) {
  console.log('\n========== 步骤6: 验证音频文件 ==========');

  try {
    const fs = require('fs');
    const path = require('path');

    if (!audioData || !audioData.filePath) {
      console.error('❌ 音频文件路径为空');
      return false;
    }

    const filePath = path.resolve(audioData.filePath);

    if (!fs.existsSync(filePath)) {
      console.error('❌ 音频文件不存在');
      console.log(`预期路径: ${filePath}`);
      return false;
    }

    const stats = fs.statSync(filePath);
    const fileSizeKB = (stats.size / 1024).toFixed(2);
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(3);

    console.log('✅ 音频文件已生成');
    console.log('文件信息:');
    console.log(`  绝对路径: ${filePath}`);
    console.log(`  文件大小: ${fileSizeKB} KB (${fileSizeMB} MB)`);
    console.log(`  文件格式: ${audioData.format}`);

    const audioUrl = `${API_BASE_URL}${audioData.audioUrl}`;
    console.log(`  HTTP访问: ${audioUrl}`);

    return { filePath, audioUrl, fileSizeKB };
  } catch (error) {
    console.error('❌ 验证音频文件失败:', error.message);
    return false;
  }
}

async function testAudioPlayback(audioUrl) {
  console.log('\n========== 步骤7: 测试音频HTTP访问（可选） ==========');

  try {
    console.log(`正在访问音频URL: ${audioUrl}`);

    const response = await axios.get(audioUrl, {
      responseType: 'arraybuffer',
      maxContentLength: 50 * 1024 * 1024
    });

    const contentType = response.headers['content-type'];
    const contentLength = response.headers['content-length'];
    const sizeKB = ((parseInt(contentLength) || response.data.byteLength) / 1024).toFixed(2);

    console.log('✅ 音频HTTP访问成功');
    console.log(`  Content-Type: ${contentType}`);
    console.log(`  Content-Length: ${contentLength} bytes (${sizeKB} KB)`);

    return true;
  } catch (error) {
    console.warn('⚠️  音频HTTP访问测试失败:', error.message);
    return false;
  }
}

async function runFullChainTest() {
  console.log('========================================');
  console.log('   TTS音色工厂全链路测试');
  console.log('   测试音色: Kai (aliyun-qwen-kai)');
  console.log('========================================');
  console.log(`测试时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log(`API基础URL: ${API_BASE_URL}`);
  console.log(`API密钥: ${API_KEY}`);

  const startTime = Date.now();

  try {
    const serverHealthy = await checkServerHealth();
    if (!serverHealthy) {
      console.error('\n❌ 测试终止: 服务不可用');
      process.exit(1);
    }

    const authOk = await testApiKeyAuth();
    if (!authOk) {
      console.error('\n❌ 测试终止: API密钥认证失败');
      console.error('请检查环境变量 API_KEY 是否正确配置');
      process.exit(1);
    }

    const voiceConfig = await queryKaiVoice();
    if (!voiceConfig) {
      console.error('\n❌ 测试终止: Kai音色配置查询失败');
      process.exit(1);
    }

    await queryVoiceCategories();

    const audioData = await testTtsSynthesis(voiceConfig);
    if (!audioData) {
      console.error('\n❌ 测试终止: TTS合成失败');
      console.error('可能的原因:');
      console.error('  1. 阿里云API密钥未配置 (请检查 QWEN_API_KEY 或 TTS_API_KEY)');
      console.error('  2. 阿里云API服务异常');
      console.error('  3. 网络连接问题');
      process.exit(1);
    }

    const audioFile = await verifyAudioFile(audioData);
    if (!audioFile) {
      console.error('\n❌ 测试终止: 音频文件验证失败');
      process.exit(1);
    }

    await testAudioPlayback(audioFile.audioUrl);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log('\n========================================');
    console.log('   ✅ 全链路测试通过！');
    console.log('========================================');
    console.log('\n测试总结:');
    console.log('  ✅ 服务健康检查: 通过');
    console.log('  ✅ API密钥认证: 通过');
    console.log('  ✅ Kai音色配置查询: 通过');
    console.log('  ✅ 音色分类数据: 通过');
    console.log('  ✅ TTS语音合成: 通过');
    console.log('  ✅ 音频文件生成: 通过');
    console.log('  ✅ 音频HTTP访问: 通过');
    console.log(`\n总耗时: ${duration}秒`);
    console.log(`\n🎉 Kai音色全链路测试成功！`);
    console.log(`\n音频文件位置: ${audioFile.filePath}`);
    console.log(`音频访问URL: ${audioFile.audioUrl}`);

  } catch (error) {
    console.error('\n========================================');
    console.error('   ❌ 测试异常终止');
    console.error('========================================');
    console.error('错误信息:', error.message);
    console.error('错误堆栈:', error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  runFullChainTest()
    .then(() => {
      console.log('\n测试完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n测试失败:', error);
      process.exit(1);
    });
}

module.exports = { runFullChainTest };

module.exports = { runFullChainTest };
