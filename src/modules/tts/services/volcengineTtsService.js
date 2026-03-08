const https = require('https');
const BaseTtsService = require('../core/BaseTtsService');
const TtsException = require('../core/TtsException');
const config = require('../../../shared/config/config');

/**
 * 火山引擎TTS服务 - HTTP API实现
 * 继承自BaseTtsService（v2.0 - 使用VoiceManager）
 */
class VolcengineTtsService extends BaseTtsService {
  constructor(config = {}) {
    super({
      provider: 'volcengine',
      serviceType: 'volcengine_http',
      ...config
    });

    // 安全地获取火山引擎配置：优先使用传入的config，其次从全局config读取，最后从环境变量读取
    this.appId = config.appId ||
                  (config.api?.volcengine?.appId) ||
                  process.env.VOLCENGINE_APP_ID;
    this.token = config.token ||
                  (config.api?.volcengine?.token) ||
                  process.env.VOLCENGINE_TOKEN;

    if (!this.appId || !this.token) {
      console.warn('火山引擎API密钥未配置，请在环境变量中设置 VOLCENGINE_APP_ID 和 VOLCENGINE_TOKEN');
    }
  }

  /**
   * 文本转语音（统一接口）
   * @param {string} text - 要转换的文本
   * @param {Object} options - 转换选项
   * @returns {Promise<Object>} 转换结果
   */
  async synthesize(text, options = {}) {
    if (!this.appId || !this.token) {
      throw TtsException.ConfigError('火山引擎API密钥未配置');
    }

    // 验证输入
    this.validateText(text);
    const apiParams = this.validateOptions(options);

    try {
      console.log('正在调用火山引擎TTS API...');

      // 调用火山引擎API
      const result = await this.callVolcengineAPI(text, apiParams);

      return result;

    } catch (error) {
      console.error('火山引擎TTS调用失败:', error);

      if (error.message.includes('API密钥')) {
        throw TtsException.ConfigError(error.message);
      } else if (error.message.includes('HTTP请求失败')) {
        throw TtsException.NetworkError(error.message);
      } else {
        throw TtsException.SynthesisFailed(`火山引擎合成失败: ${error.message}`);
      }
    }
  }

  /**
   * 调用火山引擎TTS API
   * @private
   */
  callVolcengineAPI(text, apiParams) {
    return new Promise((resolve, reject) => {
      try {
        const cluster = apiParams.cluster || 'volcano_tts';

        // 构造请求载荷 - 使用映射后的参数
        const payloadObj = {
          app: {
            appid: this.appId,
            token: this.token,
            cluster: cluster
          },
          user: {
            uid: 'user-' + Date.now()
          },
          audio: {
            voice_type: apiParams.voice_type || 'BV001_streaming',
            encoding: apiParams.encoding || 'mp3',
            speed_ratio: apiParams.speed_ratio || 1.0,
            volume_ratio: apiParams.volume_ratio || 1.0,
            rate: apiParams.rate || 24000
          },
          request: {
            text: text,
            reqid: 'req-' + Date.now(),
            operation: 'query'
          }
        };

        const postData = JSON.stringify(payloadObj);

        // 构造请求选项
        const requestOptions = {
          hostname: 'openspeech.bytedance.com',
          port: 443,
          path: '/api/v1/tts',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'Authorization': `Bearer;${this.token}`
          }
        };

        const req = https.request(requestOptions, (res) => {
          let data = [];

          res.on('data', (chunk) => {
            data.push(chunk);
          });

          res.on('end', async () => {
            try {
              console.log(`收到HTTP响应，状态码: ${res.statusCode}`);

              if (res.statusCode !== 200) {
                const errorData = Buffer.concat(data).toString();
                console.error('HTTP请求失败，响应数据:', errorData);
                reject(new Error(`HTTP请求失败，状态码: ${res.statusCode}`));
                return;
              }

              // 解析响应数据
              const responseData = JSON.parse(Buffer.concat(data).toString());
              console.log('API响应成功');

              // 检查响应代码
              if (responseData.code === 3000 && responseData.data) {
                // 解码base64音频数据
                const audioBuffer = Buffer.from(responseData.data, 'base64');

                // 使用 audioStorageManager 保存文件
                const audioFile = await this.audioStorage.saveAudioFile(audioBuffer, {
                  extension: apiParams.encoding || 'mp3',
                  metadata: {
                    provider: this.provider,
                    serviceType: this.serviceType,
                    text: text.substring(0, 50),
                    voiceType: apiParams.voice_type,
                    cluster: cluster
                  },
                  subDir: 'volcengine'
                });

                console.log(`音频文件已保存: ${audioFile.filename}`);

                resolve({
                  text: text,
                  audioUrl: audioFile.url,
                  filePath: audioFile.path,
                  fileName: audioFile.filename,
                  provider: this.provider,
                  serviceType: this.serviceType,
                  voiceType: apiParams.voice_type,
                  cluster: cluster,
                  format: apiParams.encoding || 'mp3',
                  sampleRate: apiParams.rate || 24000,
                  duration: responseData.addition?.duration,
                  createdAt: new Date().toISOString()
                });

              } else {
                // 错误响应
                console.error('API返回错误:', responseData);
                reject(new Error(`API错误 (代码${responseData.code}): ${responseData.message || '未知错误'}`));
              }

            } catch (error) {
              console.error('处理HTTP响应时出错:', error);
              reject(new Error(`处理HTTP响应时出错: ${error.message}`));
            }
          });
        });

        req.on('error', (error) => {
          console.error('HTTP请求出错:', error);
          reject(new Error(`HTTP请求出错: ${error.message}`));
        });

        // 发送请求数据
        req.write(postData);
        req.end();

      } catch (error) {
        reject(new Error(`初始化火山引擎TTS服务时出错: ${error.message}`));
      }
    });
  }

  /**
   * 获取硬编码音色列表（紧急降级方案）
   * 仅在 VoiceManager 完全不可用时使用
   * @returns {Array} 精简的备用音色列表
   */
  getHardcodedVoices() {
    return [
      { id: 'BV001_streaming', name: '通用女声', gender: 'female', language: 'zh-CN' },
      { id: 'BV002_streaming', name: '通用男声', gender: 'male', language: 'zh-CN' }
    ];
  }

  /**
   * 获取支持的模型列表
   * @returns {Array<string>} 模型列表
   */
  getSupportedModels() {
    return ['volcano_tts'];
  }
}

// 创建单例
const volcengineTtsService = new VolcengineTtsService();

module.exports = volcengineTtsService;
