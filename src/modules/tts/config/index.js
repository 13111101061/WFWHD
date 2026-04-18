/**
 * Config - 配置模块统一导出
 */

module.exports = {
  ttsDefaults: require('./ttsDefaults'),
  ProviderConfig: require('./ProviderConfig.json'),
  ParameterMapper: require('./ParameterMapper').parameterMapper,
  ModelSchema: require('./ModelSchema'),
  // 新增 voiceCode 相关配置
  VoiceCodeConfig: require('./VoiceCodeConfig.json'),
  VoiceCodeGenerator: require('./VoiceCodeGenerator'),
  VoiceCodeCompatMap: require('./VoiceCodeCompatMap.json')
};
