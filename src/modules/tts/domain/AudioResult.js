/**
 * AudioResult - 音频合成结果
 * 领域实体，表示TTS合成的产出
 */
class AudioResult {
  /**
   * @param {Object} params
   * @param {string} params.text - 原始文本
   * @param {string} params.audioUrl - 音频文件URL
   * @param {string} params.filePath - 文件物理路径
   * @param {string} params.fileName - 文件名
   * @param {string} params.provider - 服务提供商
   * @param {string} params.serviceType - 服务类型
   * @param {string} params.voice - 使用的音色
   * @param {string} [params.model] - 使用的模型
   * @param {number} [params.duration] - 音频时长(秒)
   * @param {number} [params.fileSize] - 文件大小(字节)
   * @param {string} [params.format] - 音频格式
   * @param {number} [params.sampleRate] - 采样率
   * @param {string} [params.traceId] - 追踪ID
   * @param {boolean} [params.fromCache] - 是否来自缓存
   * @param {number} [params.textLength] - 文本字符数（前端计费）
   */
  constructor({
    text,
    audioUrl,
    filePath,
    fileName,
    provider,
    serviceType,
    serviceKey,
    voice,
    voiceCode,
    model,
    duration,
    fileSize,
    format = 'mp3',
    sampleRate,
    traceId,
    fromCache = false,
    textLength
  }) {
    this.text = text;
    this.audioUrl = audioUrl;
    this.filePath = filePath;
    this.fileName = fileName;
    this.provider = provider;
    this.serviceType = serviceType;
    this.serviceKey = serviceKey || null;
    this.voice = voice;
    this.voiceCode = voiceCode || null;
    this.model = model;
    this.duration = duration;
    this.fileSize = fileSize;
    this.format = format;
    this.sampleRate = sampleRate;
    this.traceId = traceId;
    this.fromCache = fromCache;
    this.textLength = textLength || (text ? text.length : 0);
    this.timestamp = new Date().toISOString();
  }

  /**
   * 从服务层响应创建
   * @param {Object} serviceResult - 服务层返回的结果
   * @param {Object} context - 上下文信息
   */
  static fromServiceResult(serviceResult, context = {}) {
    return new AudioResult({
      text: serviceResult.text || context.text,
      audioUrl: serviceResult.url || serviceResult.audioUrl,
      filePath: serviceResult.filePath,
      fileName: serviceResult.fileName,
      provider: context.provider || serviceResult.provider,
      serviceType: context.serviceType || serviceResult.serviceType,
      serviceKey: context.serviceKey || null,
      voice: serviceResult.voice || context.voice,
      voiceCode: context.voiceCode || null,
      model: serviceResult.model || context.model,
      duration: serviceResult.duration,
      fileSize: serviceResult.size || serviceResult.fileSize,
      format: serviceResult.format || 'mp3',
      sampleRate: serviceResult.sampleRate,
      traceId: serviceResult.traceId,
      fromCache: serviceResult.fromCache || false
    });
  }

  /**
   * 转换为JSON
   */
  toJSON() {
    return {
      text: this.text,
      textLength: this.textLength,
      audioUrl: this.audioUrl,
      filePath: this.filePath,
      fileName: this.fileName,
      provider: this.provider,
      serviceType: this.serviceType,
      voice: this.voice,
      model: this.model,
      duration: this.duration,
      fileSize: this.fileSize,
      format: this.format,
      sampleRate: this.sampleRate,
      traceId: this.traceId,
      fromCache: this.fromCache,
      timestamp: this.timestamp
    };
  }

  /**
   * 转换为API响应格式
   */
  toApiResponse() {
    return this.toJSON();
  }
}

module.exports = AudioResult;