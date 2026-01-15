// API配置
require('dotenv').config();

const config = {
  // 服务器配置
  server: {
    port: process.env.PORT || 3000,
    apiKeys: process.env.API_KEYS ? process.env.API_KEYS.split(',') : []
  },

  // API配置
  api: {
    // 自定义API密钥（用于保护后端API）
    secretKey: process.env.SECRET_KEY || (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('SECRET_KEY must be set in production');
      }
      return 'dev-secret-key';
    })(),

    // 阿里云TTS API配置
    tts: {
      apiKey: process.env.TTS_API_KEY || (() => {
        if (process.env.NODE_ENV === 'production') {
          console.warn('⚠️  Warning: TTS_API_KEY not set in production');
        }
        return 'dev-api-key';
      })()
    },

    // 阿里云千问TTS API配置
    qwen: {
      apiKey: process.env.QWEN_API_KEY || (() => {
        if (process.env.NODE_ENV === 'production') {
          console.warn('⚠️  Warning: QWEN_API_KEY not set in production');
        }
        return null; // 可选，可以回退到 TTS_API_KEY
      })()
    },

    // 腾讯云API配置
    tencent: {
      secretId: process.env.TENCENTCLOUD_SECRET_ID || null,
      secretKey: process.env.TENCENTCLOUD_SECRET_KEY || null
    },

    // 火山引擎API配置
    volcengine: {
      appId: process.env.VOLCENGINE_APP_ID || null,
      token: process.env.VOLCENGINE_TOKEN || null,
      secretKey: process.env.VOLCENGINE_SECRET_KEY || null
    },

    // MiniMax API配置
    minimax: {
      apiKey: process.env.MINIMAX_API_KEY || null
    },

    // Snpan SDK配置
    snpan: {
      aid: process.env.SNPAN_AID || null,
      key: process.env.SNPAN_KEY || null
    }
  },

  // 音频文件配置
  audio: {
    // 音频文件保存目录
    directory: process.env.AUDIO_STORAGE_DIR || 'src/storage/uploads/audio',
    // 音频文件URL前缀
    urlPrefix: process.env.AUDIO_URL_PREFIX || '/audio'
  },

  // 路径配置（向后兼容）
  paths: {
    // 音频存储路径（向后兼容）
    audioStorage: process.env.AUDIO_STORAGE_DIR || 'src/storage/uploads/audio',
    // 音频存储相对路径
    audioStorageRelative: process.env.AUDIO_URL_PREFIX || '/audio'
  }
};

/**
 * 验证配置
 * 在应用启动时调用，检查必需的配置项
 */
function validateConfig() {
  const errors = [];
  const warnings = [];

  // 检查服务器配置
  if (!config.server.apiKeys || config.server.apiKeys.length === 0) {
    if (process.env.NODE_ENV === 'production') {
      errors.push('API_KEYS environment variable must be set in production');
    } else {
      warnings.push('No API keys configured. Set API_KEYS environment variable.');
    }
  }

  // 检查是否有至少一个 TTS 提供商配置
  const hasAnyProvider =
    config.api.tts.apiKey ||
    config.api.tencent.secretId ||
    config.api.volcengine.appId ||
    config.api.minimax.apiKey;

  if (!hasAnyProvider) {
    errors.push('At least one TTS provider must be configured (TTS_API_KEY, TENCENTCLOUD_SECRET_ID, VOLCENGINE_APP_ID, or MINIMAX_API_KEY)');
  }

  // 检查腾讯云配置完整性
  if (config.api.tencent.secretId && !config.api.tencent.secretKey) {
    errors.push('TENCENTCLOUD_SECRET_KEY must be set when TENCENTCLOUD_SECRET_ID is provided');
  }
  if (config.api.tencent.secretKey && !config.api.tencent.secretId) {
    errors.push('TENCENTCLOUD_SECRET_ID must be set when TENCENTCLOUD_SECRET_KEY is provided');
  }

  // 检查火山引擎配置完整性
  if (config.api.volcengine.appId && !config.api.volcengine.secretKey) {
    errors.push('VOLCENGINE_SECRET_KEY must be set when VOLCENGINE_APP_ID is provided');
  }

  // 检查占位符密钥（仅在生产环境）
  if (process.env.NODE_ENV === 'production') {
    const placeholderPatterns = ['your-', 'placeholder', 'example', 'test-'];

    const checkForPlaceholder = (key, value) => {
      if (value && typeof value === 'string') {
        const lowerValue = value.toLowerCase();
        if (placeholderPatterns.some(pattern => lowerValue.includes(pattern))) {
          errors.push(`${key} appears to be a placeholder value: ${value}`);
        }
      }
    };

    checkForPlaceholder('SECRET_KEY', config.api.secretKey);
    checkForPlaceholder('TTS_API_KEY', config.api.tts.apiKey);
    checkForPlaceholder('TENCENTCLOUD_SECRET_ID', config.api.tencent.secretId);
    checkForPlaceholder('VOLCENGINE_APP_ID', config.api.volcengine.appId);
    checkForPlaceholder('MINIMAX_API_KEY', config.api.minimax.apiKey);
  }

  // 输出结果
  if (warnings.length > 0) {
    console.log('\n⚠️  Configuration Warnings:');
    warnings.forEach(warning => console.log(`   - ${warning}`));
  }

  if (errors.length > 0) {
    console.error('\n❌ Configuration Errors:');
    errors.forEach(error => console.error(`   - ${error}`));
    throw new Error('Configuration validation failed. Please fix the errors above.');
  }

  console.log('✅ Configuration validated successfully');
}

module.exports = config;
module.exports.validateConfig = validateConfig;