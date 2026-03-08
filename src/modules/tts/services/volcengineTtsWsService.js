const WebSocket = require('ws');
const BaseTtsService = require('../core/BaseTtsService');
const TtsException = require('../core/TtsException');
const config = require('../../../shared/config/config');
const zlib = require('zlib');
const util = require('util');

// 将同步压缩函数转换为异步版本，避免阻塞 Event Loop
const gzipAsync = util.promisify(zlib.gzip);
const gunzipAsync = util.promisify(zlib.gunzip);

/**
 * 火山引擎TTS WebSocket服务
 * 继承自BaseTtsService，使用二进制协议
 */
class VolcengineTtsWsService extends BaseTtsService {
  constructor(config = {}) {
    super({
      provider: 'volcengine',
      serviceType: 'volcengine_ws',
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
      console.log('正在连接到火山引擎TTS WebSocket服务...');

      // 调用WebSocket API
      const result = await this.callWebSocketAPI(text, apiParams);

      return result;

    } catch (error) {
      console.error('火山引擎WebSocket TTS调用失败:', error);

      if (error.message.includes('API密钥')) {
        throw TtsException.ConfigError(error.message);
      } else if (error.message.includes('WebSocket')) {
        throw TtsException.NetworkError(error.message);
      } else {
        throw TtsException.SynthesisFailed(`火山引擎WebSocket合成失败: ${error.message}`);
      }
    }
  }

  /**
   * 调用火山引擎WebSocket TTS API
   * @private
   */
  callWebSocketAPI(text, apiParams) {
    return new Promise((resolve, reject) => {
      try {
        const cluster = apiParams.cluster || 'volcano_tts';

        console.log('正在连接到火山引擎TTS WebSocket服务...');

        // 创建WebSocket连接
        const ws = new WebSocket('wss://openspeech.bytedance.com/api/v1/tts/ws_binary', {
          headers: {
            'Authorization': `Bearer;${this.token}`
          }
        });

        let audioBuffers = [];
        let isTaskFinished = false;
        let timeoutId = null;

        // 连接打开时发送初始化消息
        ws.on('open', async () => {
          console.log('WebSocket连接已建立');

          // 设置超时
          timeoutId = setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.close();
              reject(new Error('TTS任务超时'));
            }
          }, 30000); // 30秒超时

          // 构造请求JSON - 使用映射后的参数
          const requestJson = {
            "app": {
              "appid": this.appId,
              "token": this.token,
              "cluster": cluster
            },
            "user": {
              "uid": "user-" + Date.now()
            },
            "audio": {
              "voice_type": apiParams.voice_type || "BV001_streaming",
              "encoding": apiParams.encoding || "mp3",
              "speed_ratio": apiParams.speed_ratio || 1.0,
              "volume_ratio": apiParams.volume_ratio || 1.0,
              "sample_rate": apiParams.sample_rate || 24000
            },
            "request": {
              "reqid": "req-" + Date.now(),
              "text": text,
              "text_type": "plain",
              "operation": "submit"
            }
          };

          try {
            // 构造二进制消息（异步，非阻塞）
            const message = await buildBinaryMessage(requestJson);
            ws.send(message);
          } catch (error) {
            console.error('构造消息失败:', error);
            clearTimeout(timeoutId);
            ws.close();
            reject(new Error(`构造消息失败: ${error.message}`));
          }
        });

        // 接收消息
        ws.on('message', async (data) => {
          try {
            const result = await parseResponse(data);

            if (result.isAudio) {
              // 收到音频数据
              audioBuffers.push(result.payload);
              console.log('收到音频数据块');
            } else if (result.isError) {
              // 收到错误信息
              console.error('任务失败:', result.payload);
              clearTimeout(timeoutId);
              ws.close();
              reject(new Error(`TTS任务失败: ${result.payload}`));
            } else if (result.isFinal) {
              // 最终响应，任务完成
              console.log('任务已完成');
              isTaskFinished = true;
              clearTimeout(timeoutId);
              finishTask();
            } else {
              // 其他响应
              console.log('收到其他响应:', result.payload);
            }
          } catch (e) {
            console.error('解析消息错误:', e.message);
          }
        });

        // 连接错误处理
        ws.on('error', (error) => {
          console.error('WebSocket连接错误:', error);
          clearTimeout(timeoutId);
          reject(new Error(`WebSocket连接错误: ${error.message}`));
        });

        // 连接关闭处理
        ws.on('close', () => {
          console.log('WebSocket连接已关闭');
          clearTimeout(timeoutId);

          if (!isTaskFinished && audioBuffers.length > 0) {
            // 如果有音频数据但任务未标记完成，则认为任务已完成
            console.log('检测到音频数据，认为任务已完成');
            isTaskFinished = true;
            finishTask();
          } else if (!isTaskFinished) {
            // 如果任务未完成就关闭连接，说明可能出错了
            reject(new Error('连接在任务完成前关闭'));
          }
        });

        // 完成任务并保存音频文件
        const finishTask = async () => {
          try {
            if (audioBuffers.length === 0) {
              reject(new Error('未收到任何音频数据'));
              return;
            }

            // 合并所有音频数据块
            const audioBuffer = Buffer.concat(audioBuffers);

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
              subDir: 'volcengine-ws'
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
              sampleRate: apiParams.sample_rate || 24000,
              createdAt: new Date().toISOString()
            });

            // 关闭WebSocket连接
            ws.close();

          } catch (error) {
            console.error('保存音频文件时出错:', error);
            reject(new Error(`保存音频文件时出错: ${error.message}`));
          }
        };

      } catch (error) {
        reject(new Error(`初始化火山引擎WebSocket TTS服务时出错: ${error.message}`));
      }
    });
  }

  /**
   * 获取硬编码音色列表（降级方案）
   * 保留作为备用数据，当音色工厂不可用时使用
   * @returns {Array} 硬编码音色列表
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

// ============== 二进制协议辅助函数 ==============

/**
 * 构造二进制消息（异步版本）
 * 使用异步 gzip 避免 Event Loop 阻塞
 * @param {Object} requestJson - 请求数据
 * @returns {Promise<Buffer>} 二进制消息
 */
async function buildBinaryMessage(requestJson) {
  // version: b0001 (4 bits)
  // header size: b0001 (4 bits)
  // message type: b0001 (Full client request) (4bits)
  // message type specific flags: b0000 (none) (4bits)
  // message serialization method: b0001 (JSON) (4 bits)
  // message compression: b0001 (gzip) (4 bits)
  // reserved data: 0x00 (1 byte)
  const defaultHeader = Buffer.from([0x11, 0x10, 0x11, 0x00]);

  // 序列化并异步压缩 payload（非阻塞）
  let payloadBytes = Buffer.from(JSON.stringify(requestJson), 'utf8');
  payloadBytes = await gzipAsync(payloadBytes);

  // 构造完整消息
  const message = Buffer.alloc(4 + 4 + payloadBytes.length);
  defaultHeader.copy(message, 0);
  message.writeUInt32BE(payloadBytes.length, 4);
  payloadBytes.copy(message, 8);

  return message;
}

/**
 * 解析响应（异步版本）
 * 使用异步 gunzip 避免 Event Loop 阻塞
 * @param {Buffer} data - 接收的数据
 * @returns {Promise<Object>} 解析结果
 */
async function parseResponse(data) {
  try {
    // 解析header
    const protocolVersion = data[0] >> 4;
    const headerSize = data[0] & 0x0f;
    const messageType = data[1] >> 4;
    const messageTypeSpecificFlags = data[1] & 0x0f;
    const serializationMethod = data[2] >> 4;
    const messageCompression = data[2] & 0x0f;

    // 获取payload
    const headerEnd = headerSize * 4;
    const payloadSize = data.readUInt32BE(4);
    let payload = data.slice(headerEnd, headerEnd + payloadSize);

    // 如果有压缩，异步解压缩（非阻塞）
    if (messageCompression === 1) { // gzip
      payload = await gunzipAsync(payload);
    }

    // 根据消息类型处理
    if (messageType === 11) { // audio-only server response
      return {
        isAudio: true,
        payload: payload
      };
    } else if (messageType === 15) { // error message
      let errorText = payload.toString('utf8');
      try {
        const errorJson = JSON.parse(errorText);
        errorText = errorJson.message || errorText;
      } catch (e) {
        // 如果不是JSON，就直接使用文本
      }

      return {
        isError: true,
        payload: errorText
      };
    } else if (messageType === 12) { // frontend server response
      let responseText = payload.toString('utf8');
      try {
        const responseJson = JSON.parse(responseText);
        if (responseJson.operation === "submit" && responseJson.code === 3000) {
          if (responseJson.message === "Success") {
            return {
              isFinal: true,
              payload: responseJson
            };
          }
        }
        return {
          payload: responseJson
        };
      } catch (e) {
        return {
          payload: responseText
        };
      }
    }

    return {
      payload: payload.toString('utf8')
    };
  } catch (e) {
    throw new Error(`解析响应失败: ${e.message}`);
  }
}

// 创建单例
const volcengineTtsWsService = new VolcengineTtsWsService();

module.exports = volcengineTtsWsService;
