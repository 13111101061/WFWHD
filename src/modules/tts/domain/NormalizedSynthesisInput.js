/**
 * NormalizedSynthesisInput — 合成入口参数归一化
 *
 * 把 SynthesisRequest 中散装的 text / input.raw / input.segments / options
 * 归一成一个扁平结构，供 ParameterResolutionService + CompiledCapability.validate() 使用。
 *
 * 保证：text 一定存在（来自 request.text / input.raw / segments 拼接），
 *       其他参数从 request.options + 顶层字段 合并而来。
 *
 * 这是 SynthesisRequest 和 Capability 校验层之间的桥梁——
 * 前者是 HTTP 入口值对象（text 可能不在 options 里），
 * 后者是校验+映射层（期望所有参数在同一个 params 对象里）。
 */

class NormalizedSynthesisInput {
  /**
   * @param {SynthesisRequest} request - 已通过基本校验的请求对象
   */
  constructor(request) {
    this._text = this._extractText(request);
    this._params = this._buildParams(request);
  }

  /**
   * 归一化后的合成文本（保证非空）
   */
  get text() {
    return this._text;
  }

  /**
   * 供 ParameterResolutionService + Capability 校验使用的完整参数集
   * text 已注入其中，不会再丢失
   */
  get params() {
    return this._params;
  }

  /**
   * 供 _compileInput 使用的原始 input 对象（保留 segments/raw 等结构化信息）
   */
  get input() {
    return this._request?.input || null;
  }

  /**
   * 原始请求对象，保留用于 _callProvider 等
   */
  get request() {
    return this._request;
  }

  /**
   * 从三种文本来源提取有效文本
   *
   * 优先级：text > input.raw > input.segments 拼接
   */
  _extractText(request) {
    if (request.text) return request.text;
    if (request.input?.raw) return request.input.raw;
    if (request.input?.segments?.length) {
      return request.input.segments.map(s => s.text).join('\n');
    }
    return '';
  }

  /**
   * 合并 request.options + 顶层字段 + text
   *
   * text 必须出现在 params 里，供 CompiledCapability.validate() 校验 required 字段
   * 其他顶层字段（speed/pitch/volume 等）已在 fromJSON 时归入 options
   */
  _buildParams(request) {
    const params = {
      ...(request.options || {}),
      text: this._text,
    };

    this._request = request;
    return params;
  }
}

module.exports = NormalizedSynthesisInput;