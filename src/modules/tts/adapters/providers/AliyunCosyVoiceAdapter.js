/**
 * AliyunCosyVoiceAdapter - 阿里云CosyVoice适配器
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const BaseTtsAdapter = require('./BaseTtsAdapter');

class AliyunCosyVoiceAdapter extends BaseTtsAdapter {
  constructor(config = {}) {
    super({
      provider: 'aliyun',
      serviceType: 'cosyvoice',
      ...config
    });

    const creds = this._getCredentials();
    const serviceConfig = this._getServiceConfig();
    this.apiKey = config.apiKey || creds?.apiKey;
    this.endpoint = config.endpoint || serviceConfig?.endpoint || 'wss://dashscope.aliyuncs.com/api-ws/v1/inference/';
  }

  async synthesize(text, options = {}) {
    if (!this.apiKey) {
      throw this._error('CONFIG_ERROR', 'CosyVoice API密钥未配置');
    }

    this.validateText(text);
    const params = this.validateOptions(options);

    return this._retry(async () => {
      return this._callWebSocket(text, params);
    });
  }

  _callWebSocket(text, params) {
    return new Promise((resolve, reject) => {
      const taskId = uuidv4();
      const audioBuffers = [];

      const ws = new WebSocket(this.endpoint, {
        headers: {
          'Authorization': `bearer ${this.apiKey}`
        }
      });

      const timeout = setTimeout(() => {
        ws.close();
        reject(this._error('TIMEOUT', 'WebSocket连接超时'));
      }, this.config.timeout);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          header: { task_id: taskId, action: 'run-task' },
          payload: {
            model: 'cosyvoice-v1',
            function: 'speech_synthesis',
            parameters: {
              text,
              voice: params.voice || 'longxiaochun',
              format: params.format || 'mp3',
              sample_rate: params.sampleRate || 16000
            }
          }
        }));
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          if (msg.header?.event === 'result' && msg.payload?.audio) {
            audioBuffers.push(Buffer.from(msg.payload.audio, 'base64'));
          }
          if (msg.header?.event === 'task-finished') {
            clearTimeout(timeout);
            ws.close();
            resolve({
              audio: Buffer.concat(audioBuffers),
              format: params.format || 'mp3',
              provider: this.provider,
              serviceType: this.serviceType
            });
          }
        } catch (e) {
          // 忽略解析错误
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(this._error('CONNECTION_ERROR', err.message));
      });

      ws.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  getFallbackVoices() {
    return [
      { id: 'longxiaochun', name: '龙小春', gender: 'female' },
      { id: 'longxiaoxia', name: '龙小夏', gender: 'female' },
      { id: 'longxiaobai', name: '龙小白', gender: 'male' }
    ];
  }
}

module.exports = AliyunCosyVoiceAdapter;