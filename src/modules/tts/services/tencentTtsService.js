const https = require("https");
const crypto = require("crypto");
const BaseTtsService = require('../core/BaseTtsService');
const TtsException = require('../core/TtsException');
const config = require("../../../shared/config/config");
const { voiceModelRegistry } = require('../config/VoiceModelRegistry');

/**
 * 腾讯云TTS服务
 * 继承自BaseTtsService，使用TC3-HMAC-SHA256签名算法
 */
class TencentTtsService extends BaseTtsService {
  constructor(config = {}) {
    super({
      provider: 'tencent',
      serviceType: 'tts',
      ...config
    });

    // 安全地获取腾讯云配置：优先使用传入的config，其次从全局config读取，最后从环境变量读取
    this.secretId = config.secretId ||
                     (config.api?.tencent?.secretId) ||
                     process.env.TENCENTCLOUD_SECRET_ID;
    this.secretKey = config.secretKey ||
                      (config.api?.tencent?.secretKey) ||
                      process.env.TENCENTCLOUD_SECRET_KEY;
    this.region = config.region ||
                   (config.api?.tencent?.region) ||
                   process.env.TENCENTCLOUD_REGION || '';

    if (!this.secretId || !this.secretKey) {
      console.warn('腾讯云API密钥未配置，请在环境变量中设置 TENCENTCLOUD_SECRET_ID 和 TENCENTCLOUD_SECRET_KEY');
    }
  }

  /**
   * 文本转语音（统一接口）
   * @param {string} text - 要转换的文本
   * @param {Object} options - 转换选项
   * @returns {Promise<Object>} 转换结果
   */
  async synthesize(text, options = {}) {
    if (!this.secretId || !this.secretKey) {
      throw TtsException.ConfigError('腾讯云API密钥未配置');
    }

    // 验证输入
    this.validateText(text);
    const apiParams = this.validateOptions(options);

    try {
      console.log('正在调用腾讯云TTS API...');

      // 调用腾讯云API
      const result = await this.callTencentAPI(text, apiParams);

      return result;

    } catch (error) {
      console.error('腾讯云TTS调用失败:', error);

      if (error.message.includes('API密钥')) {
        throw TtsException.ConfigError(error.message);
      } else if (error.message.includes('HTTP请求失败')) {
        throw TtsException.NetworkError(error.message);
      } else {
        throw TtsException.SynthesisFailed(`腾讯云合成失败: ${error.message}`);
      }
    }
  }

  /**
   * 调用腾讯云TTS API
   * @private
   */
  callTencentAPI(text, apiParams) {
    return new Promise((resolve, reject) => {
      try {
        const host = "tts.tencentcloudapi.com";
        const service = "tts";
        const action = "TextToVoice";
        const version = "2019-08-23";
        const timestamp = parseInt(String(new Date().getTime() / 1000));
        const date = this.getDate(timestamp);

        // 构造请求载荷 - 使用映射后的参数
        const payloadObj = {
          Text: text,
          SessionId: "session-" + Date.now(),
          ModelType: apiParams.ModelType || 1,
          Volume: apiParams.Volume || 0,
          Speed: apiParams.Speed || 1,
          ProjectId: apiParams.ProjectId || 0,
          VoiceType: apiParams.VoiceType || 101001,
          PrimaryLanguage: apiParams.PrimaryLanguage || 1,
          SampleRate: apiParams.SampleRate || 16000,
          Codec: apiParams.Codec || "wav",
          EnableSubtitle: apiParams.EnableSubtitle || false,
        };

        const payload = JSON.stringify(payloadObj);

        // TC3-HMAC-SHA256签名算法
        const signedHeaders = "content-type;host";
        const hashedRequestPayload = this.getHash(payload);
        const httpRequestMethod = "POST";
        const canonicalUri = "/";
        const canonicalQueryString = "";
        const canonicalHeaders =
          "content-type:application/json; charset=utf-8\n" + "host:" + host + "\n";

        const canonicalRequest =
          httpRequestMethod + "\n" +
          canonicalUri + "\n" +
          canonicalQueryString + "\n" +
          canonicalHeaders + "\n" +
          signedHeaders + "\n" +
          hashedRequestPayload;

        const algorithm = "TC3-HMAC-SHA256";
        const hashedCanonicalRequest = this.getHash(canonicalRequest);
        const credentialScope = date + "/" + service + "/" + "tc3_request";
        const stringToSign =
          algorithm + "\n" +
          timestamp + "\n" +
          credentialScope + "\n" +
          hashedCanonicalRequest;

        const kDate = this.sha256(date, "TC3" + this.secretKey);
        const kService = this.sha256(service, kDate);
        const kSigning = this.sha256("tc3_request", kService);
        const signature = this.sha256(stringToSign, kSigning, "hex");

        const authorization =
          algorithm + " " +
          "Credential=" + this.secretId + "/" + credentialScope + ", " +
          "SignedHeaders=" + signedHeaders + ", " +
          "Signature=" + signature;

        const headers = {
          Authorization: authorization,
          "Content-Type": "application/json; charset=utf-8",
          Host: host,
          "X-TC-Action": action,
          "X-TC-Timestamp": timestamp,
          "X-TC-Version": version,
        };

        if (this.region) {
          headers["X-TC-Region"] = this.region;
        }

        const requestOptions = {
          hostname: host,
          method: httpRequestMethod,
          headers,
        };

        const req = https.request(requestOptions, (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });

          res.on("end", async () => {
            try {
              console.log(`收到HTTP响应，状态码: ${res.statusCode}`);

              if (res.statusCode !== 200) {
                console.error("HTTP请求失败，响应数据:", data);
                reject(new Error(`HTTP请求失败，状态码: ${res.statusCode}`));
                return;
              }

              const response = JSON.parse(data);
              console.log("API响应成功");

              if (response.Response && response.Response.Audio) {
                // 解码Base64音频数据
                const audioBuffer = Buffer.from(response.Response.Audio, 'base64');

                // 使用 audioStorageManager 保存文件
                const audioFile = await this.audioStorage.saveAudioFile(audioBuffer, {
                  extension: apiParams.Codec || 'wav',
                  metadata: {
                    provider: this.provider,
                    serviceType: this.serviceType,
                    text: text.substring(0, 50),
                    voiceType: apiParams.VoiceType,
                    sessionId: response.Response.SessionId
                  },
                  subDir: 'tencent'
                });

                console.log(`音频文件已保存: ${audioFile.filename}`);

                resolve({
                  text: text,
                  audioUrl: audioFile.url,
                  filePath: audioFile.path,
                  fileName: audioFile.filename,
                  sessionId: response.Response.SessionId,
                  provider: this.provider,
                  serviceType: this.serviceType,
                  voiceType: apiParams.VoiceType,
                  codec: apiParams.Codec || 'wav',
                  sampleRate: apiParams.SampleRate || 16000,
                  duration: response.Response.Subtitles ? response.Response.Subtitles.length : 0,
                  createdAt: new Date().toISOString()
                });

              } else if (response.Response && response.Response.Error) {
                console.error("API返回错误:", response.Response.Error);
                reject(new Error(`API错误: ${response.Response.Error.Message}`));
              } else {
                console.error("API响应格式不正确:", response);
                reject(new Error("API响应格式不正确"));
              }

            } catch (error) {
              console.error("处理HTTP响应时出错:", error);
              reject(new Error(`处理HTTP响应时出错: ${error.message}`));
            }
          });
        });

        req.on("error", (error) => {
          console.error("HTTP请求出错:", error);
          reject(new Error(`HTTP请求出错: ${error.message}`));
        });

        req.write(payload);
        req.end();

      } catch (error) {
        reject(new Error(`初始化腾讯云TTS服务时出错: ${error.message}`));
      }
    });
  }

  /**
   * SHA256签名
   * @private
   */
  sha256(message, secret = "", encoding) {
    const hmac = crypto.createHmac("sha256", secret);
    return hmac.update(message).digest(encoding);
  }

  /**
   * 计算哈希
   * @private
   */
  getHash(message, encoding = "hex") {
    const hash = crypto.createHash("sha256");
    return hash.update(message).digest(encoding);
  }

  /**
   * 获取日期字符串
   * @private
   */
  getDate(timestamp) {
    const date = new Date(timestamp * 1000);
    const year = date.getUTCFullYear();
    const month = ("0" + (date.getUTCMonth() + 1)).slice(-2);
    const day = ("0" + date.getUTCDate()).slice(-2);
    return `${year}-${month}-${day}`;
  }

  /**
   * 获取硬编码音色列表（降级方案）
   * 保留作为备用数据，当音色工厂不可用时使用
   * @returns {Array} 硬编码音色列表
   */
  getHardcodedVoices() {
    // 注意：此方法仅作为降级方案
    // 正常情况下应使用从 BaseTtsService 继承的 getAvailableVoices() 方法
    // 该方法会从 VoiceModelRegistry 获取完整的83个音色
    return [
      // 基础音色（部分示例）
      { id: 101001, name: '亲亲', gender: '女', language: '中文' },
      { id: 101002, name: '鸭鸭', gender: '女', language: '中文' },
      { id: 101003, name: '圆圆', gender: '女', language: '中文' },
      { id: 101004, name: '小郭', gender: '男', language: '中文' },
      { id: 101005, name: '小何', gender: '男', language: '中文' },
      { id: 101006, name: '小玲', gender: '女', language: '中文' },
      { id: 101007, name: '小露', gender: '女', language: '中文' },
      { id: 101008, name: '小倩', gender: '女', language: '中文' },
      { id: 101009, name: '小蓉', gender: '女', language: '中文' },
      { id: 101010, name: '小宋', gender: '男', language: '中文' },
      { id: 101011, name: '小唐', gender: '男', language: '中文' },
      { id: 101012, name: '小王', gender: '男', language: '中文' },
      { id: 101013, name: '小魏', gender: '男', language: '中文' },
      { id: 101014, name: '小文', gender: '男', language: '中文' },
      { id: 101015, name: '小欣', gender: '女', language: '中文' },
      { id: 101016, name: '小颜', gender: '女', language: '中文' },
      { id: 101017, name: '小包', gender: '男', language: '中文' },
      { id: 101018, name: '小蔡', gender: '男', language: '中文' },
      { id: 101019, name: '小岑', gender: '女', language: '中文' },
      { id: 101020, name: '小戴', gender: '男', language: '中文' },
      { id: 101070, name: '翻译腔男声', gender: '男', language: '中文', type: '特色' }
    ];
  }

  /**
   * 获取可用音色列表（已弃用 - 硬编码版本）
   * @deprecated 请使用继承自 BaseTtsService 的 getAvailableVoices() 方法
   * 该方法会从 VoiceModelRegistry 获取完整的83个腾讯云音色
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
    return ['1', '2']; // 1=标准模型, 2=精品模型
  }
}

// 创建单例
const tencentTtsService = new TencentTtsService();

module.exports = tencentTtsService;
