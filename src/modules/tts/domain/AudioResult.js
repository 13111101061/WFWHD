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
   */
  constructor({
    text,
    audioUrl,
    filePath,
    fileName,
    provider,
    serviceType,
    voice,
    model,
    duration,
    fileSize,
    format = 'mp3',
    sampleRate = 32000,
    traceId,
    fromCache = false
  }) {
    this.text = text;
    this.audioUrl = audioUrl;
    this.filePath = filePath;
    this.fileName = fileName;
    this.provider = provider;
    this.serviceType = serviceType;
    this.voice = voice;
    this.model = model;
    this.duration = duration;
    this.fileSize = fileSize;
    this.format = format;
    this.sampleRate = sampleRate;
    this.traceId = traceId;
    this.fromCache = fromCache;
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
      voice: serviceResult.voice,
      model: serviceResult.model,
      duration: serviceResult.duration,
      fileSize: serviceResult.size || serviceResult.fileSize,
      format: serviceResult.format || 'mp3',
      sampleRate: serviceResult.sampleRate || 32000,
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