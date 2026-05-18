/**
 * SynthesisContext — 合成请求内部上下文
 *
 * 串起 request → voice → capability → params → adapter → result 各个阶段。
 * 每个阶段只读写 context 的相关部分，避免隐性传参和多返回值拆包。
 *
 * Stages:
 *   1. request     → ctx.request
 *   2. resolve     → ctx.voiceIdentity, ctx.serviceDescriptor
 *   3. capability  → ctx.capabilityContext
 *   4. params      → ctx.resolvedParams
 *   5. map         → ctx.providerParams
 *   6. synthesize  → ctx.result
 */
class SynthesisContext {
  /**
   * @param {Object} opts
   * @param {SynthesisRequest} opts.request
   * @param {number} [opts.startTime]
   */
  constructor({ request, startTime } = {}) {
    this.request = request || null;

    this.voiceIdentity = null;
    this.serviceDescriptor = null;

    this.capabilityContext = null;

    this.resolvedParams = null;
    this.providerParams = null;

    this.normalizedInput = null;

    this.result = null;

    this.warnings = [];

    this.startTime = startTime || Date.now();
  }

  get serviceKey() {
    return this.serviceDescriptor?.key || null;
  }

  get latency() {
    return Date.now() - this.startTime;
  }

  addWarning(w) {
    this.warnings.push(w);
  }

  /**
   * 从上下文构建 AudioResult
   * @returns {AudioResult}
   */
  toAudioResult() {
    const AudioResult = require('./AudioResult');
    return AudioResult.fromServiceResult(this.result, {
      provider: this.serviceDescriptor?.provider,
      serviceType: this.serviceDescriptor?.serviceType,
      text: this.request?.text,
      latency: this.latency,
      serviceKey: this.serviceKey,
      voiceCode: this.voiceIdentity?.voiceCode || this.request?.voiceCode,
      voice: this.voiceIdentity?.providerVoiceId
    });
  }
}

module.exports = { SynthesisContext };
