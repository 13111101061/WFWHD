/**
 * AliyunCosyVoiceAdapter - 阿里云CosyVoice适配器
 *
 * 支持凭证池化：
 * - 请求时选择最佳账号
 * - 报告成功/失败用于健康追踪
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

    // 初始化时获取凭证（向后兼容）
    const creds = this._getCredentials();
    const serviceConfig = this._getServiceConfig();
    this.apiKey = config.apiKey || creds?.apiKey;
    this.endpoint = config.endpoint || serviceConfig?.endpoint || 'wss://dashscope.aliyuncs.com/api-ws/v1/inference/';
  }

  async synthesize(text, options = {}) {
    this.validateText(text);
    const params = this.validateOptions(options);

    // 请求时获取凭证（支持池化选择和健康追踪）
    const creds = this._getCredentials();
    const apiKey = creds?.apiKey || this.apiKey;

    if (!apiKey) {
      throw this._error('CONFIG_ERROR', 'CosyVoice API密钥未配置');
    }

    try {
      const result = await this._callWebSocket(text, params, apiKey);

      // 报告成功
      this._reportSuccess();

      return result;
    } catch (error) {
      // 报告失败
      this._reportFailure(error);
      throw error;
    }
  }

  _callWebSocket(text, params, apiKey) {
    return new Promise((resolve, reject) => {
      const taskId = uuidv4();
      const audioBuffers = [];

      const ws = new WebSocket(this.endpoint, {
        headers: {
          'Authorization': `bearer ${apiKey}`
        }
      });

      const timeout = setTimeout(() => {
        ws.close();
        reject(this._error('TIMEOUT_ERROR', 'WebSocket连接超时'));
      }, this.config.timeout);

      ws.on('open', () => {
        const parameters = {
          text,
          voice: this._pickOption(params, ['voice']) || 'longxiaochun',
          format: this._pickOption(params, ['format']) || 'mp3',
          sample_rate: this._pickOption(params, ['sample_rate', 'sampleRate']) || 16000
        };

        const rate = this._pickOption(params, ['rate', 'speed']);
        if (rate !== undefined) {
          parameters.rate = rate;
        }

        const volume = this._pickOption(params, ['volume']);
        if (volume !== undefined) {
          parameters.volume = volume;
        }

        const pitch = this._pickOption(params, ['pitch']);
        if (pitch !== undefined) {
          parameters.pitch = pitch;
        }

        ws.send(JSON.stringify({
          header: { task_id: taskId, action: 'run-task' },
          payload: {
            model: 'cosyvoice-v1',
            function: 'speech_synthesis',
            parameters
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
              format: this._pickOption(params, ['format']) || 'mp3',
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
        reject(this._error('NETWORK_ERROR', err.message));
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
