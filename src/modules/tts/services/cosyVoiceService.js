const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const BaseTtsService = require('../core/BaseTtsService');
const TtsException = require('../core/TtsException');
const config = require('../../../shared/config/config');
const { voiceModelRegistry } = require('../config/VoiceModelRegistry');

/**
 * Aliyun CosyVoice TTS服务
 * 继承自BaseTtsService，使用WebSocket连接
 */
class CosyVoiceService extends BaseTtsService {
  constructor(config = {}) {
    super({
      provider: 'aliyun',
      serviceType: 'cosyvoice',
      ...config
    });

    // 安全地获取API密钥：优先使用传入的config，其次从全局config读取，最后从环境变量读取
    this.apiKey = config.apiKey ||
                   (config.api?.tts?.apiKey) ||
                   (typeof config === 'object' && Object.keys(config).length > 0 ? undefined : undefined) ||
                   process.env.TTS_API_KEY;

    if (!this.apiKey) {
      console.warn('CosyVoice API密钥未配置，请在环境变量中设置 TTS_API_KEY');
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
      throw TtsException.ConfigError('CosyVoice API密钥未配置');
    }

    // 验证输入
    this.validateText(text);
    const apiParams = this.validateOptions(options);

    try {
      console.log('正在连接到阿里云CosyVoice服务...');

      // 使用WebSocket调用API
      const result = await this.callCosyVoiceWebSocket(text, apiParams);

      return result;

    } catch (error) {
      console.error('CosyVoice TTS调用失败:', error);

      if (error.message.includes('API密钥')) {
        throw TtsException.ConfigError(error.message);
      } else if (error.message.includes('超时')) {
        throw TtsException.TimeoutError(error.message);
      } else {
        throw TtsException.SynthesisFailed(`CosyVoice合成失败: ${error.message}`);
      }
    }
  }

  /**
   * 调用CosyVoice WebSocket API
   * @private
   */
  callCosyVoiceWebSocket(text, apiParams) {
    return new Promise((resolve, reject) => {
      const taskId = uuidv4();
      let audioBuffers = [];
      let taskStarted = false;
      let taskFinished = false;

      // 创建WebSocket连接
      const ws = new WebSocket('wss://dashscope.aliyuncs.com/api-ws/v1/inference/', {
        headers: {
          'Authorization': `bearer ${this.apiKey}`
        }
      });

      // 智能超时机制 - 根据文本长度动态调整
      const textLength = text.length;
      const estimatedTime = Math.min(5000 + (textLength * 50), 60000);
      console.log(`文本长度: ${textLength}字符，预计处理时间: ${estimatedTime/1000}秒`);

      const timeout = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1000, 'Client timeout');
        }
        reject(new Error(`处理超时 (${estimatedTime/1000}秒)`));
      }, estimatedTime);

      // 连接打开时发送run-task指令
      ws.on('open', () => {
        console.log('WebSocket连接已建立');

        const runTaskMessage = {
          header: {
            action: 'run-task',
            task_id: taskId,
            streaming: 'duplex'
          },
          payload: {
            task_group: 'audio',
            task: 'tts',
            function: 'SpeechSynthesizer',
            model: apiParams.model || 'cosyvoice-v1',
            parameters: {
              text_type: 'PlainText',
              voice: apiParams.voice || 'longxiaochun_v2',
              format: apiParams.format || 'mp3',
              sample_rate: apiParams.sample_rate || 22050,
              volume: apiParams.volume || 50,
              rate: apiParams.rate || 1,
              pitch: apiParams.pitch || 1
            },
            input: {
              text: text
            }
          }
        };

        console.log('发送run-task指令');
        ws.send(JSON.stringify(runTaskMessage));
      });

      // 接收消息
      ws.on('message', (data) => {
        clearTimeout(timeout);

        if (data instanceof Buffer || data instanceof Uint8Array) {
          // 音频数据
          audioBuffers.push(data);

          if (audioBuffers.length === 1) {
            console.log('接收到第一个音频数据包...');

            // 根据文本长度决定等待策略
            if (textLength <= 50) {
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.close(1000, 'Short text completed');
                }
              }, 300);
            } else if (textLength <= 200) {
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.close(1000, 'Medium text completed');
                }
              }, 1000);
            } else {
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.close(1000, 'Long text completed');
                }
              }, 3000);
            }
          }
        } else {
          // JSON消息
          try {
            const message = JSON.parse(typeof data === 'string' ? data : data.toString());
            console.log('收到消息:', message.header.event);

            switch (message.header.event) {
              case 'task-started':
                console.log('任务已启动');
                taskStarted = true;

                // 发送finish-task
                if (ws.readyState === WebSocket.OPEN) {
                  const finishTaskMessage = {
                    header: {
                      action: 'finish-task',
                      task_id: taskId,
                      streaming: 'duplex'
                    },
                    payload: { input: {} }
                  };
                  ws.send(JSON.stringify(finishTaskMessage));
                  console.log('已发送finish-task消息');
                }
                break;

              case 'task-finished':
                console.log('任务已完成');
                taskFinished = true;
                break;

              case 'task-failed':
                console.error('CosyVoice API返回错误:', message);
                if (ws.readyState === WebSocket.OPEN) {
                  ws.close(1000, 'Task failed');
                }
                reject(new Error(message.header.error_message || 'CosyVoice API错误'));
                break;

              default:
                break;
            }
          } catch (parseError) {
            console.error('解析JSON消息时出错:', parseError);
          }
        }
      });

      // 连接关闭时处理结果
      ws.on('close', async (code, reason) => {
        console.log(`WebSocket连接已关闭，代码: ${code}`);
        clearTimeout(timeout);

        if (audioBuffers.length > 0) {
          try {
            // 合并所有音频数据
            const fullAudioBuffer = Buffer.concat(audioBuffers);

            // 使用 audioStorageManager 保存文件
            const audioFile = await this.audioStorage.saveAudioFile(fullAudioBuffer, {
              extension: apiParams.format || 'mp3',
              metadata: {
                provider: this.provider,
                serviceType: this.serviceType,
                text: text.substring(0, 50),
                voice: apiParams.voice,
                model: apiParams.model,
                taskId: taskId
              },
              subDir: 'cosyvoice'
            });

            console.log(`音频文件已保存: ${audioFile.filename}`);

            resolve({
              text: text,
              audioUrl: audioFile.url,
              filePath: audioFile.path,
              fileName: audioFile.filename,
              taskId: taskId,
              provider: this.provider,
              serviceType: this.serviceType,
              voice: apiParams.voice,
              model: apiParams.model,
              duration: fullAudioBuffer.length / (apiParams.sample_rate || 22050) / 2,
              format: apiParams.format || 'mp3',
              sampleRate: apiParams.sample_rate || 22050,
              createdAt: new Date().toISOString()
            });

          } catch (error) {
            console.error('保存音频文件时出错:', error);
            reject(new Error(`保存音频文件时出错: ${error.message}`));
          }
        } else {
          // 没有收到音频数据
          if (code !== 1000) {
            reject(new Error(`连接异常关闭，代码: ${code}`));
          } else if (!taskStarted) {
            reject(new Error('任务未能启动'));
          } else {
            reject(new Error('未收到音频数据'));
          }
        }
      });

      // 连接错误处理
      ws.on('error', (error) => {
        console.error('WebSocket连接错误:', error);
        clearTimeout(timeout);
        reject(new Error(`WebSocket连接错误: ${error.message}`));
      });
    });
  }

  /**
   * 获取可用音色列表
   * @returns {Array} 音色列表
   */
  async getAvailableVoices() {
    try {
      // 确保注册中心已初始化
      if (!voiceModelRegistry.isLoaded) {
        await voiceModelRegistry.initialize();
      }

      // 获取CosyVoice的所有模型
      const models = voiceModelRegistry.getModelsByProvider('aliyun');
      const cosyVoiceModels = models.filter(model => model.service === 'cosyvoice');

      return cosyVoiceModels.map(model => ({
        id: model.voiceId,
        systemId: model.id,
        name: model.name,
        language: model.languages && model.languages[0] || 'zh-CN',
        gender: model.gender,
        model: model.model,
        _modelInfo: model
      }));

    } catch (error) {
      console.error('从配置中心获取音色列表失败，使用备用数据:', error.message);

      // 备用数据
      return [
        { id: 'longxiaochun_v2', name: '龙小淳', language: 'zh-CN', gender: 'female', model: 'cosyvoice-v2' },
        { id: 'longcheng_v2', name: '龙橙', language: 'zh-CN', gender: 'male', model: 'cosyvoice-v2' }
      ];
    }
  }

  /**
   * 获取支持的模型列表
   * @returns {Array<string>} 模型列表
   */
  getSupportedModels() {
    return ['cosyvoice-v1', 'cosyvoice-v2'];
  }
}

// 创建单例
const cosyVoiceService = new CosyVoiceService();

module.exports = cosyVoiceService;
