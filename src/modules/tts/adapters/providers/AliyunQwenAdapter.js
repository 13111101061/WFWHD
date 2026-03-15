/**
 * AliyunQwenAdapter - 阿里云Qwen TTS适配器（HTTP方式）
 *
 * 支持两种响应模式：
 * - url模式：API返回音频URL（推荐，节省服务器资源）
 * - binary模式：API返回音频二进制数据
 *
 * 支持凭证池化：
 * - 请求时选择最佳账号
 * - 报告成功/失败用于健康追踪
 */

const BaseTtsAdapter = require('./BaseTtsAdapter');

class AliyunQwenAdapter extends BaseTtsAdapter {
  constructor(config = {}) {
    super({
      provider: 'aliyun',
      serviceType: 'qwen_http',
      ...config
    });

    // 初始化时获取凭证（向后兼容）
    // 实际请求时可能会重新选择
    const creds = this._getCredentials();
    const serviceConfig = this._getServiceConfig();
    this.apiKey = config.apiKey || creds?.apiKey;
    this.endpoint = config.endpoint || serviceConfig?.endpoint || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
    this.responseMode = config.responseMode || 'url';
  }

  async synthesize(text, options = {}) {
    this.validateText(text);
    const params = this.validateOptions(options);

    // 请求时获取凭证（支持池化选择和健康追踪）
    const creds = this._getCredentials();
    const apiKey = creds?.apiKey || this.apiKey;

    if (!apiKey) {
      throw this._error('CONFIG_ERROR', 'Qwen TTS API密钥未配置');
    }

    try {
      const result = await this._executeRequest(text, params, apiKey);

      // 报告成功
      this._reportSuccess();

      return result;
    } catch (error) {
      // 报告失败
      this._reportFailure(error);
      throw error;
    }
  }

  /**
   * 执行API请求
   */
  async _executeRequest(text, params, apiKey) {
    return this._retry(async () => {
      const headers = {
        'Authorization': `Bearer ${apiKey}`,
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