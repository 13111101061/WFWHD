/**
 * Core - 核心模块统一导出
 */

module.exports = {
  VoiceRegistry: require('./VoiceRegistry').VoiceRegistry,
  voiceRegistry: require('./VoiceRegistry').voiceRegistry,
  TtsException: require('./TtsException')
};
