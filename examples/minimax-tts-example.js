/**
 * MiniMax TTS API 使用示例
 * 
 * 本示例展示如何使用MiniMax TTS服务进行文本转语音
 * 需要在.env文件中配置 MINIMAX_API_KEY
 */

const axios = require('axios');
require('dotenv').config();

// 服务器配置
const SERVER_URL = 'http://localhost:3000';
const TTS_ENDPOINT = '/api/tts/unified';

/**
 * 基础TTS转换示例
 */
async function basicTtsExample() {
  console.log('\n=== 基础TTS转换示例 ===');
  
  try {
    const response = await axios.post(`${SERVER_URL}${TTS_ENDPOINT}`, {
      service: 'minimax',
      text: '你好，这是MiniMax TTS服务的测试。',
      voice: 'male-qn-qingse',
      speed: 1.0,
      volume: 1.0,
      pitch: 0
    });

    if (response.data.success) {
      console.log('✅ TTS转换成功');
      console.log('音频URL:', response.data.data.audioUrl);
      console.log('音频时长:', response.data.data.duration, 'ms');
      console.log('文件大小:', response.data.data.fileSize, 'bytes');
      console.log('音频格式:', response.data.data.format);
      console.log('采样率:', response.data.data.sampleRate);
    } else {
      console.error('❌ TTS转换失败:', response.data.error);
    }
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
  }
}

/**
 * 高级参数示例
 */
async function advancedTtsExample() {
  console.log('\n=== 高级参数示例 ===');
  
  try {
    const response = await axios.post(`${SERVER_URL}${TTS_ENDPOINT}`, {
      service: 'minimax',
      text: '这是一个高级参数配置的示例，包含情绪控制和音频设置。',
      voice: 'Chinese (Mandarin)_Lyrical_Voice',
      speed: 1.2,
      volume: 1.5,
      pitch: 2,
      sample_rate: 44100,
      format: 'mp3',
      model: 'speech-2.5-hd-preview',
      emotion: 'happy',
      text_normalization: true,
      subtitle_enable: false,
      aigc_watermark: false
    });

    if (response.data.success) {
      console.log('✅ 高级TTS转换成功');
      console.log('音频URL:', response.data.data.audioUrl);
      console.log('使用模型:', response.data.data.model);
      console.log('音色:', response.data.data.voice);
      console.log('追踪ID:', response.data.data.traceId);
    } else {
      console.error('❌ 高级TTS转换失败:', response.data.error);
    }
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
  }
}

/**
 * 英文TTS示例
 */
async function englishTtsExample() {
  console.log('\n=== 英文TTS示例 ===');
  
  try {
    const response = await axios.post(`${SERVER_URL}${TTS_ENDPOINT}`, {
      service: 'minimax',
      text: 'Hello, this is a test of MiniMax TTS service with English voice.',
      voice: 'English_Graceful_Lady',
      speed: 1.0,
      volume: 1.0,
      pitch: 0,
      model: 'speech-2.5-hd-preview',
      emotion: 'calm'
    });

    if (response.data.success) {
      console.log('✅ 英文TTS转换成功');
      console.log('音频URL:', response.data.data.audioUrl);
      console.log('音色:', response.data.data.voice);
    } else {
      console.error('❌ 英文TTS转换失败:', response.data.error);
    }
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
  }
}

/**
 * 日文TTS示例
 */
async function japaneseTtsExample() {
  console.log('\n=== 日文TTS示例 ===');
  
  try {
    const response = await axios.post(`${SERVER_URL}${TTS_ENDPOINT}`, {
      service: 'minimax',
      text: 'こんにちは、これはMiniMax TTSサービスのテストです。',
      voice: 'Japanese_Whisper_Belle',
      speed: 1.0,
      volume: 1.0,
      pitch: 0,
      model: 'speech-2.5-hd-preview'
    });

    if (response.data.success) {
      console.log('✅ 日文TTS转换成功');
      console.log('音频URL:', response.data.data.audioUrl);
      console.log('音色:', response.data.data.voice);
    } else {
      console.error('❌ 日文TTS转换失败:', response.data.error);
    }
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
  }
}

/**
 * 混合音色示例
 */
async function timbreWeightsExample() {
  console.log('\n=== 混合音色示例 ===');
  
  try {
    const response = await axios.post(`${SERVER_URL}${TTS_ENDPOINT}`, {
      service: 'minimax',
      text: '这是混合音色的测试，结合了两种不同的声音特色。',
      timbre_weights: [
        {
          voice_id: 'Chinese (Mandarin)_Lyrical_Voice',
          weight: 60
        },
        {
          voice_id: 'moss_audio_ce44fc67-7ce3-11f0-8de5-96e35d26fb85',
          weight: 40
        }
      ],
      speed: 1.0,
      volume: 1.0,
      model: 'speech-2.5-hd-preview'
    });

    if (response.data.success) {
      console.log('✅ 混合音色TTS转换成功');
      console.log('音频URL:', response.data.data.audioUrl);
    } else {
      console.error('❌ 混合音色TTS转换失败:', response.data.error);
    }
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
  }
}

/**
 * 获取音色列表示例
 */
async function getVoicesExample() {
  console.log('\n=== 获取音色列表示例 ===');
  
  try {
    const response = await axios.get(`${SERVER_URL}${TTS_ENDPOINT}/voices?service=minimax`);

    if (response.data.success) {
      console.log('✅ 获取音色列表成功');
      console.log('支持的音色数量:', response.data.data.length);
      console.log('前5个音色:');
      response.data.data.slice(0, 5).forEach((voice, index) => {
        console.log(`  ${index + 1}. ${voice.name} (${voice.id}) - ${voice.gender} - ${voice.language}`);
      });
    } else {
      console.error('❌ 获取音色列表失败:', response.data.error);
    }
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
  }
}

/**
 * 停顿控制示例
 */
async function pauseControlExample() {
  console.log('\n=== 停顿控制示例 ===');
  
  try {
    const response = await axios.post(`${SERVER_URL}${TTS_ENDPOINT}`, {
      service: 'minimax',
      text: '这是第一句话<#1.5#>这里停顿1.5秒<#0.5#>这里停顿0.5秒，然后继续说话。',
      voice: 'male-qn-qingse',
      speed: 1.0,
      volume: 1.0,
      model: 'speech-2.5-hd-preview'
    });

    if (response.data.success) {
      console.log('✅ 停顿控制TTS转换成功');
      console.log('音频URL:', response.data.data.audioUrl);
    } else {
      console.error('❌ 停顿控制TTS转换失败:', response.data.error);
    }
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
  }
}

/**
 * 发音字典示例
 */
async function pronunciationDictExample() {
  console.log('\n=== 发音字典示例 ===');
  
  try {
    const response = await axios.post(`${SERVER_URL}${TTS_ENDPOINT}`, {
      service: 'minimax',
      text: '处理这个危险的情况需要小心。OMG，这太神奇了！',
      voice: 'male-qn-qingse',
      pronunciation_dict: {
        tone: [
          '处理/(chu3)(li3)',
          '危险/dangerous',
          'OMG/oh my god'
        ]
      },
      speed: 1.0,
      volume: 1.0,
      model: 'speech-2.5-hd-preview'
    });

    if (response.data.success) {
      console.log('✅ 发音字典TTS转换成功');
      console.log('音频URL:', response.data.data.audioUrl);
    } else {
      console.error('❌ 发音字典TTS转换失败:', response.data.error);
    }
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
  }
}

/**
 * 运行所有示例
 */
async function runAllExamples() {
  console.log('🚀 开始运行MiniMax TTS示例...');
  
  // 检查环境变量
  if (!process.env.MINIMAX_API_KEY) {
    console.error('❌ 请在.env文件中设置 MINIMAX_API_KEY');
    return;
  }

  await basicTtsExample();
  await advancedTtsExample();
  await englishTtsExample();
  await japaneseTtsExample();
  await timbreWeightsExample();
  await getVoicesExample();
  await pauseControlExample();
  await pronunciationDictExample();
  
  console.log('\n✅ 所有示例运行完成！');
}

// 如果直接运行此文件，则执行所有示例
if (require.main === module) {
  runAllExamples().catch(console.error);
}

module.exports = {
  basicTtsExample,
  advancedTtsExample,
  englishTtsExample,
  japaneseTtsExample,
  timbreWeightsExample,
  getVoicesExample,
  pauseControlExample,
  pronunciationDictExample,
  runAllExamples
};