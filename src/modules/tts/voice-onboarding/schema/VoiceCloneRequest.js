/**
 * VoiceCloneRequest - 音色克隆注册请求值对象
 *
 * 前端 form/multipart 提交 → 服务层统一入参。
 */

class VoiceCloneRequest {
  /**
   * @param {Object} params
   * @param {string} params.providerKey - 服务商标识 (e.g., 'moss')
   * @param {string} params.serviceType - 服务类型 (e.g., 'tts')
   * @param {string} params.displayName - 音色展示名称
   * @param {string} params.gender - male | female | neutral
   * @param {Object}  params.audioFile - multer file object
   * @param {string} [params.sourceId] - provider 本地命名（可选，默认用 displayName 转换）
   * @param {string[]} [params.tags] - 6 个标签
   * @param {string[]} [params.languages] - 语言列表（默认 ['中文']）
   * @param {string} [params.description] - 描述
   * @param {string} [params.testText] - 自定义测试文本（覆盖 manifest testPhrases）
   * @param {boolean} [params.skipTestSynthesis=false] - 跳过测试合成
   */
  constructor({
    providerKey,
    serviceType,
    displayName,
    gender,
    audioFile,
    sourceId = null,
    tags = [],
    languages = ['中文'],
    description = '',
    testText = null,
    skipTestSynthesis = false
  }) {
    if (!providerKey || !serviceType || !displayName || !gender || !audioFile) {
      throw new Error('providerKey, serviceType, displayName, gender, audioFile are required');
    }

    this.providerKey = providerKey;
    this.serviceType = serviceType;
    this.displayName = displayName;
    this.gender = gender;
    this.audioFile = audioFile;
    this.sourceId = sourceId || displayName;
    this.tags = tags;
    this.languages = languages;
    this.description = description;
    this.testText = testText;
    this.skipTestSynthesis = !!skipTestSynthesis;
  }

  /**
   * 从 Express req.body + req.file 构建
   */
  static fromHttp(req) {
    const body = req.body || {};
    const file = req.file;

    if (!file) {
      throw new Error('audioFile is required (multipart field name: "audioFile")');
    }

    return new VoiceCloneRequest({
      providerKey: body.providerKey || body.provider,
      serviceType: body.serviceType || body.service || 'tts',
      displayName: body.displayName,
      gender: body.gender,
      audioFile: file,
      sourceId: body.sourceId || null,
      tags: Array.isArray(body.tags) ? body.tags : (body.tags ? body.tags.split(',') : []),
      languages: Array.isArray(body.languages) ? body.languages : (body.languages ? body.languages.split(',') : ['中文']),
      description: body.description || '',
      testText: body.testText || null,
      skipTestSynthesis: body.skipTestSynthesis === 'true' || body.skipTestSynthesis === true
    });
  }
}

module.exports = VoiceCloneRequest;
