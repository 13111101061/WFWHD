/**
 * TTS 中间件统一导出
 */

const { ttsErrorHandler, notFoundHandler } = require('./errorHandler');
const { requestLogger, simpleRequestLogger } = require('./requestLogger');

module.exports = {
  // 错误处理
  ttsErrorHandler,
  notFoundHandler,
  
  // 日志
  requestLogger,
  simpleRequestLogger,
  
  // 根据环境选择日志级别
  autoRequestLogger: process.env.NODE_ENV === 'production' ? simpleRequestLogger : requestLogger
};
