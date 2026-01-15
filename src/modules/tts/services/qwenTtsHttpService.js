const BaseTtsService = require('../core/BaseTtsService');
const TtsException = require('../core/TtsException');
const config = require('../../../shared/config/config');
const { voiceModelRegistry } = require('../config/VoiceModelRegistry');

/**
 * 阿里云千问TTS HTTP服务
 * 继承自BaseTtsService
 */
class QwenTtsHttpService extends BaseTtsService {
  constructor(config = {}) {
    super({
      provider: 'aliyun',
      serviceType: 'qwen_http',
      ...config
    });

    // 安全地获取API密钥：优先使用传入的config，其次从全局config读取，最后从环境变量读取
    this.apiKey = config.apiKey ||
                   process.env.QWEN_API_KEY ||
                   (config.api?.qwen?.apiKey) ||
                   (config.api?.tts?.apiKey) ||
                   process.env.TTS_API_KEY;

    if (!this.apiKey) {
      console.warn('千问TTS HTTP API密钥未配置，请在环境变量中设置 QWEN_API_KEY 或 TTS_API_KEY');
    } else {
      console.log(`✅ 千问TTS HTTP API密钥已配置: ${this.apiKey.substring(0, 10)}...`);
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
      throw TtsException.ConfigError('千问TTS HTTP API密钥未配置');
    }

    // 验证输入
    this.validateText(text);
    const apiParams = this.validateOptions(options);

    try {
      console.log('正在调用阿里云千问TTS HTTP API...');

      // 构造请求数据
      // apiParams已经是嵌套结构 { input: { voice, language_type, sample_rate } }
      const requestData = {
        model: apiParams.model || 'qwen3-tts-flash',  // 默认使用 qwen3-tts-flash（快速响应）
        input: {
          text: text,
          ...(apiParams.input || {})  // 合并经过ParameterMapper处理的参数
        }
      };

      // 确保voice参数存在（必需参数）
      if (!requestData.input.voice) {
        requestData.input.voice = 'Chelsie';  // 默认音色
      }

      // 确保language_type存在
      if (!requestData.input.language_type) {
        requestData.input.language_type = 'Auto';  // 默认自动检测
      }

      console.log('发送HTTP请求到千问TTS API...');
      console.log('请求参数:', JSON.stringify({
        model: requestData.model,
        voice: requestData.input.voice,
        language_type: requestData.input.language_type,
        text_length: text.length
      }, null, 2));

      // 发送HTTP请求 - 使用正确的API端点
      const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`HTTP响应错误，状态码: ${response.status}`, errorText);
        throw TtsException.NetworkError(`HTTP请求失败，状态码: ${response.status}`);
      }

      const result = await response.json();
      console.log('API响应成功');

      if (result.output && result.output.audio && result.output.audio.url) {
        // 下载音频文件
        const audioUrl = result.output.audio.url;
        const taskId = result.output.audio.id || Date.now().toString();

        console.log('正在下载音频文件...');
        const audioResponse = await fetch(audioUrl);

        if (!audioResponse.ok) {
          throw TtsException.AudioFormatError('下载音频文件失败');
        }

        const arrayBuffer = await audioResponse.arrayBuffer();
        const audioBuffer = Buffer.from(arrayBuffer);

        // 使用 audioStorageManager 保存文件
        const audioFile = await this.audioStorage.saveAudioFile(audioBuffer, {
          extension: 'wav',
          metadata: {
            provider: this.provider,
            serviceType: this.serviceType,
            text: text.substring(0, 50),
            voice: apiParams.voice,
            model: apiParams.model,
            taskId: taskId
          },
          subDir: 'qwen-http'
        });

        console.log(`音频文件已保存: ${audioFile.filename}`);

        return {
          text: text,
          audioUrl: audioFile.url,
          filePath: audioFile.filePath,
          fileName: audioFile.filename,
          taskId: taskId,
          provider: this.provider,
          serviceType: this.serviceType,
          voice: apiParams.voice,
          model: apiParams.model || 'qwen-tts',
          format: 'wav',
          duration: result.usage ? result.usage.output_tokens / 50 : 0,
          createdAt: new Date().toISOString()
        };

      } else {
        throw TtsException.SynthesisFailed('API响应格式不正确');
      }

    } catch (error) {
      console.error('千问TTS HTTP API调用失败:', error);

      if (error.message.includes('API密钥')) {
        throw TtsException.ConfigError(error.message);
      } else if (error.message.includes('HTTP请求失败')) {
        throw TtsException.NetworkError(error.message);
      } else {
        throw TtsException.SynthesisFailed(`千问HTTP合成失败: ${error.message}`);
      }
    }
  }

  /**
   * 下载音频文件（保留用于向后兼容）
   * @deprecated 直接在synthesize中处理
   */
  async downloadAudioFile(url, filepath) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`下载音频文件失败，状态码: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    await require('fs').promises.writeFile(filepath, audioBuffer);
    console.log(`音频文件已保存: ${filepath}`);
  }

  /**
   * 获取硬编码音色列表（降级方案）
   * 保留作为备用数据，当音色工厂不可用时使用
   * @returns {Array} 硬编码音色列表
   */
  getHardcodedVoices() {
    // 注意：此方法仅作为降级方案
    // 正常情况下应使用从 BaseTtsService 继承的 getAvailableVoices() 方法
    // 该方法会从 VoiceModelRegistry 获取完整的千问HTTP音色
    return [
      { id: 'Chelsie', name: 'Chelsie', language: 'zh-CN', gender: 'female' },
      { id: 'Cherry', name: 'Cherry', language: 'zh-CN', gender: 'female' },
      { id: 'Ethan', name: 'Ethan', language: 'zh-CN', gender: 'male' },
      { id: 'Serena', name: 'Serena', language: 'zh-CN', gender: 'female' }
    ];
  }

  /**
   * 获取可用音色列表（已弃用 - 硬编码版本）
   * @deprecated 请使用继承自 BaseTtsService 的 getAvailableVoices() 方法
   * 该方法会从 VoiceModelRegistry 获取完整的千问HTTP音色
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
    return ['qwen-tts', 'qwen3-tts-flash'];
  }
}

// 创建单例
const qwenTtsHttpService = new QwenTtsHttpService();

module.exports = qwenTtsHttpService;
