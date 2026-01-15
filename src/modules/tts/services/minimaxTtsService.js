const axios = require('axios');
const BaseTtsService = require('../core/BaseTtsService');
const TtsException = require('../core/TtsException');
const { voiceModelRegistry } = require('../config/VoiceModelRegistry');

/**
 * MiniMax TTS服务类（重构版）
 * 继承自BaseTtsService，提供统一的接口
 */
class MinimaxTtsService extends BaseTtsService {
  constructor(config = {}) {
    super({
      provider: 'minimax',
      serviceType: 'minimax_tts',
      ...config
    });

    // 安全地获取MiniMax配置：优先使用传入的config，最后从环境变量读取
    this.apiKey = config.apiKey || process.env.MINIMAX_API_KEY;
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
    const apiParams = this.validateOptions(options);

    try {
      console.log('正在调用MiniMax TTS API...');

      // 构建请求参数
      const requestData = this.buildRequestParams(text, apiParams);

      // 发送请求
      const response = await this.callAPI(requestData);

      // 处理响应
      return await this.processResponse(response, text, apiParams);

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
  buildRequestParams(text, apiParams) {
    return {
      model: apiParams.model || 'speech-2.5-hd-preview',
      text: text,
      stream: false,
      voice_setting: {
        voice_id: apiParams.voice_id || apiParams.voice || 'male-qn-qingse',
        speed: apiParams.speed || 1.0,
        vol: apiParams.vol || 1.0,
        pitch: apiParams.pitch || 0,
        emotion: apiParams.emotion || 'calm'
      },
      audio_setting: {
        sample_rate: apiParams.sample_rate || 32000,
        bitrate: apiParams.bitrate || 128000,
        format: apiParams.format || 'mp3',
        channel: apiParams.channel || 1
      },
      output_format: 'hex',
      subtitle_enable: apiParams.subtitle_enable || false
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
  async processResponse(responseData, text, apiParams) {
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

    // 保存音频文件（使用 this.audioStorage 继承自BaseTtsService）
    const audioFile = await this.audioStorage.saveAudioFile(audioBuffer, {
      extension: apiParams.format || 'mp3',
      metadata: {
        provider: this.provider,
        serviceType: this.serviceType,
        text: text.substring(0, 50),
        voice: apiParams.voice_id || apiParams.voice
      },
      subDir: 'minimax'
    });

    console.log(`音频文件已保存: ${audioFile.filename}`);

    // 使用基类统一方法格式化响应
    return this.formatResponse({
      audioFile,
      text,
      apiParams,
      extraInfo: {
        duration: responseData.extra_info ? responseData.extra_info.audio_length : null,
        fileSize: responseData.extra_info ? responseData.extra_info.audio_size : null,
        traceId: responseData.trace_id
      }
    });
  }

  /**
   * 获取硬编码音色列表（降级方案）
   * 保留作为备用数据，当音色工厂不可用时使用
   * @returns {Array} 硬编码音色列表
   */
  getHardcodedVoices() {
    // 注意：此方法仅作为降级方案
    // 正常情况下应使用从 BaseTtsService 继承的 getAvailableVoices() 方法
    // 该方法会从 VoiceModelRegistry 获取完整的MiniMax音色
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
   * 获取可用音色列表（已弃用 - 硬编码版本）
   * @deprecated 请使用继承自 BaseTtsService 的 getAvailableVoices() 方法
   * 该方法会从 VoiceModelRegistry 获取完整的MiniMax音色
   *
   * 原硬编码列表已移至 getHardcodedVoices() 作为降级方案
   */
  // getAvailableVoices() {
  //   return [ /* 硬编码列表已移至 getHardcodedVoices() */ ];
  // }

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
