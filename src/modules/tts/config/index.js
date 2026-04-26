/**
 * Config - 配置模块统一导出
 */

module.exports = {
  ttsDefaults: require('./ttsDefaults'),
  ParameterMapper: require('./ParameterMapper').parameterMapper,
  ModelSchema: require('./ModelSchema'),
  VoiceCodeConfig: require('./VoiceCodeConfig.json'),
  VoiceCodeGenerator: require('./VoiceCodeGenerator'),
  VoiceCodeCompatMap: require('./VoiceCodeCompatMap.json')
};
