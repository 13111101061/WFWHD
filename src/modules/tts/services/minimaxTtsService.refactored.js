const axios = require('axios');
const BaseTtsService = require('../core/BaseTtsService');
const TtsException = require('../core/TtsException');

/**
 * MiniMax TTS服务类（重构版）
 * 继承自BaseTtsService，提供统一的接口
 */
class MinimaxTtsService extends BaseTtsService {
  constructor(config = {}) {
    super({
      provider: 'minimax',
      serviceType: 'tts',
      ...config
    });

    this.apiKey = process.env.MINIMAX_API_KEY;
    this.baseUrl = 'https://api.minimaxi.com/v1/t2a_v2';

    if (!this.apiKey) {
      console.warn('MiniMax API密钥未配置，请在环境变量中设置 MINIMAX_API_KEY');
    }
  }

  /**
   * 文本转语音（统一接口）
   * @param {string} text - 要转换的文本
   * @param {Object} options - 转换选项
   * @returns {Promise<Object>} 转换结果
   */
  async synthesize(text, options = {}) {
    if (!this.apiKey) {
      throw TtsException.ConfigError('MiniMax API密钥未配置');
    }

    // 验证输入
    this.validateText(text);
    this.validateOptions(options);

    try {
      console.log('正在调用MiniMax TTS API...');

      // 构建请求参数
      const requestData = this.buildRequestParams(text, options);

      // 发送请求
      const response = await this.callAPI(requestData);

      // 处理响应
      return await this.processResponse(response, text, options);

    } catch (error) {
      console.error('MiniMax TTS API调用失败:', error);

      if (error.response) {
        const errorMsg = error.response.data?.base_resp?.status_msg ||
                        error.response.data?.error ||
                        `HTTP ${error.response.status}: ${error.response.statusText}`;
        throw TtsException.SynthesisFailed(`MiniMax TTS API错误: ${errorMsg}`);
      } else if (error.request) {
        throw TtsException.NetworkError('MiniMax TTS API请求失败: 网络连接错误');
      } else {
        throw TtsException.SynthesisFailed(`MiniMax TTS服务错误: ${error.message}`);
      }
    }
  }

  /**
   * 构建API请求参数
   * @private
   */
  buildRequestParams(text, options) {
    return {
      model: options.model || 'speech-2.5-hd-preview',
      text: text,
      stream: false,
      voice_setting: {
        voice_id: options.voice_id || options.voice || 'male-qn-qingse',
        speed: options.speed || 1.0,
        vol: options.volume || 1.0,
        pitch: options.pitch || 0,
        emotion: options.emotion || 'calm'
      },
      audio_setting: {
        sample_rate: options.sample_rate || 32000,
        bitrate: options.bitrate || 128000,
        format: options.format || 'mp3',
        channel: options.channel || 1
      },
      output_format: 'hex',
      subtitle_enable: options.subtitle_enable || false
    };
  }

  /**
   * 调用MiniMax API
   * @private
   */
  async callAPI(requestData) {
    const response = await axios.post(this.baseUrl, requestData, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: this.config.timeout
    });

    console.log('MiniMax TTS API调用成功');
    return response.data;
  }

  /**
   * 处理API响应
   * @private
   */
  async processResponse(responseData, text, options) {
    // 检查响应状态
    if (responseData.base_resp && responseData.base_resp.status_code !== 0) {
      throw new Error(`MiniMax API错误: ${responseData.base_resp.status_msg || '未知错误'}`);
    }

    if (!responseData.data || !responseData.data.audio) {
      throw TtsException.AudioFormatError('MiniMax API返回数据格式错误');
    }

    // 解码音频数据
    const audioHex = responseData.data.audio;
    const audioBuffer = Buffer.from(audioHex, 'hex');

    // 保存音频文件（使用 audioStorageManager）
    const audioFile = await this.audioStorage.saveAudioFile(audioBuffer, {
      extension: options.format || 'mp3',
      metadata: {
        provider: this.provider,
        serviceType: this.serviceType,
        text: text.substring(0, 50),
        voice: options.voice_id || options.voice
      },
      subDir: 'minimax'
    });

    console.log(`音频文件已保存: ${audioFile.filename}`);

    return {
      text: text,
      audioUrl: audioFile.url,
      filePath: audioFile.path,
      fileName: audioFile.filename,
      provider: this.provider,
      serviceType: this.serviceType,
      voice: options.voice_id || options.voice,
      model: options.model || 'speech-2.5-hd-preview',
      duration: responseData.extra_info ? responseData.extra_info.audio_length : null,
      fileSize: responseData.extra_info ? responseData.extra_info.audio_size : null,
      format: options.format || 'mp3',
      sampleRate: options.sample_rate || 32000,
      traceId: responseData.trace_id,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * 获取支持的语音列表
   * @returns {Array} 语音列表
   */
  getAvailableVoices() {
    return [
      // 中文音色
      {
        id: 'moss_audio_ce44fc67-7ce3-11f0-8de5-96e35d26fb85',
        systemId: 'minimax-female-1',
        name: '中文女声1',
        gender: 'female',
        language: 'zh-CN',
        type: 'system'
      },
      {
        id: 'moss_audio_aaa1346a-7ce7-11f0-8e61-2e6e3c7ee85d',
        systemId: 'minimax-female-2',
        name: '中文女声2',
        gender: 'female',
        language: 'zh-CN',
        type: 'system'
      },
      {
        id: 'male-qn-qingse',
        systemId: 'minimax-male-1',
        name: '男声-青涩',
        gender: 'male',
        language: 'zh-CN',
        type: 'system'
      },
      // 英文音色
      {
        id: 'English_Graceful_Lady',
        systemId: 'minimax-female-en-1',
        name: '优雅女士',
        gender: 'female',
        language: 'en-US',
        type: 'system'
      },
      {
        id: 'English_Insightful_Speaker',
        systemId: 'minimax-male-en-1',
        name: '睿智演讲者',
        gender: 'male',
        language: 'en-US',
        type: 'system'
      }
    ];
  }

  /**
   * 获取支持的模型列表
   * @returns {Array<string>} 模型列表
   */
  getSupportedModels() {
    return [
      'speech-2.5-hd-preview',
      'speech-01-hd-preview'
    ];
  }

  /**
   * 获取服务状态
   * @returns {Object} 状态信息
   */
  getStatus() {
    return {
      service: 'MinimaxTtsService',
      provider: this.provider,
      serviceType: this.serviceType,
      config: {
        baseUrl: this.baseUrl,
        hasApiKey: !!this.apiKey,
        timeout: this.config.timeout
      },
      status: this.apiKey ? 'active' : 'inactive',
      timestamp: new Date().toISOString()
    };
  }
}

// 创建单例
const minimaxTtsService = new MinimaxTtsService();

module.exports = minimaxTtsService;
