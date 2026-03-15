/**
 * AliyunQwenAdapter - 阿里云Qwen TTS适配器（HTTP方式）
 *
 * 支持两种响应模式：
 * - url模式：API返回音频URL（推荐，节省服务器资源）
 * - binary模式：API返回音频二进制数据
 */

const BaseTtsAdapter = require('./BaseTtsAdapter');

class AliyunQwenAdapter extends BaseTtsAdapter {
  constructor(config = {}) {
    super({
      provider: 'aliyun',
      serviceType: 'qwen_http',
      ...config
    });

    const creds = this._getCredentials();
    const serviceConfig = this._getServiceConfig();
    this.apiKey = config.apiKey || creds?.apiKey;
    this.endpoint = config.endpoint || serviceConfig?.endpoint || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
    this.responseMode = config.responseMode || 'url';
  }

  async synthesize(text, options = {}) {
    if (!this.apiKey) {
      throw this._error('CONFIG_ERROR', 'Qwen TTS API密钥未配置');
    }

    this.validateText(text);
    const params = this.validateOptions(options);

    return this._retry(async () => {
      const headers = {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      };

      // 多模态生成端点请求格式
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: params.model || 'qwen3-tts-flash',
          input: {
            text,
            voice: params.voice || 'Cherry'
          }
        })
      });

      if (!response.ok) {
        const err = await response.text();
        throw this._error('API_ERROR', `Qwen TTS失败: ${err}`);
      }

      // URL模式：解析JSON获取音频URL
      if (this.responseMode === 'url') {
        const result = await response.json();

        // 解析返回格式：output.audio.url
        const audioUrl = result.output?.audio?.url;
        if (!audioUrl) {
          throw this._error('PARSE_ERROR', '未能获取音频URL', { response: result });
        }

        return {
          audioUrl,  // 直接返回阿里云托管的音频URL
          format: params.format || 'wav',
          provider: this.provider,
          serviceType: this.serviceType,
          audioId: result.output?.audio?.id
        };
      }

      // 二进制模式：返回Buffer
      const audio = Buffer.from(await response.arrayBuffer());

      return {
        audio,
        format: params.format || 'wav',
        provider: this.provider,
        serviceType: this.serviceType
      };
    });
  }

  getFallbackVoices() {
    return [
      { id: 'Cherry', name: '爱千月', gender: 'female' },
      { id: 'Ethan', name: '伊森', gender: 'male' },
      { id: 'Luna', name: '露娜', gender: 'female' }
    ];
  }
}

module.exports = AliyunQwenAdapter;