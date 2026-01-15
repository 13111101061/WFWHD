/**
 * ParameterMapper 综合测试
 * 测试参数映射、验证、标准化转换等功能
 */

const { parameterMapper, ParameterMapper } = require('../src/modules/tts/config/ParameterMapper');
const TtsException = require('../src/modules/tts/core/TtsException');

// 测试结果统计
let passedTests = 0;
let failedTests = 0;

// 测试辅助函数
function assert(condition, testName) {
  if (condition) {
    console.log(`✅ ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ ${testName}`);
    failedTests++;
  }
}

function assertThrows(fn, testName) {
  try {
    fn();
    console.error(`❌ ${testName} - 应该抛出异常但没有`);
    failedTests++;
  } catch (error) {
    console.log(`✅ ${testName} - 正确抛出异常: ${error.message}`);
    passedTests++;
  }
}

function assertDeepEqual(actual, expected, testName) {
  const actualStr = JSON.stringify(actual, null, 2);
  const expectedStr = JSON.stringify(expected, null, 2);

  if (actualStr === expectedStr) {
    console.log(`✅ ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ ${testName}`);
    console.error(`   期望: ${expectedStr}`);
    console.error(`   实际: ${actualStr}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('\n========================================');
  console.log('ParameterMapper 综合测试');
  console.log('========================================\n');

  // 初始化 ParameterMapper
  await parameterMapper.initialize();

  // ========================================
  // 测试组 1: Aliyun CosyVoice
  // ========================================
  console.log('\n📋 测试组 1: Aliyun CosyVoice');
  console.log('----------------------------------------');

  try {
    // 测试 1.1: 基础参数映射
    const result1 = parameterMapper.mapAndValidate('aliyun', 'cosyvoice', {
      voice: 'longxiaochun_v2',
      speed: 1.5,
      volume: 8,
      format: 'mp3'
    });

    assert(result1.voice === 'longxiaochun_v2', '1.1 - voice 字段映射');
    assert(result1.rate === 1.5, '1.2 - speed → rate 映射');
    assert(result1.volume === 80, '1.3 - volume 标准化 (8*10=80)');
    assert(result1.format === 'mp3', '1.4 - format 字段映射');

    // 测试 1.2: 默认值
    const result2 = parameterMapper.mapAndValidate('aliyun', 'cosyvoice', {
      voice: 'longxiaochun_v2'
    });

    assert(result2.rate === 1.0, '1.5 - speed 默认值 1.0');
    assert(result2.volume === 50, '1.6 - volume 默认值 50');
    assert(result2.pitch === 1.0, '1.7 - pitch 默认值 1.0');
    assert(result2.format === 'mp3', '1.8 - format 默认值 mp3');

    // 测试 1.3: 范围验证
    assertThrows(
      () => parameterMapper.mapAndValidate('aliyun', 'cosyvoice', {
        voice: 'longxiaochun_v2',
        speed: 3.0
      }),
      '1.9 - speed 超出范围应抛出异常'
    );

    assertThrows(
      () => parameterMapper.mapAndValidate('aliyun', 'cosyvoice', {
        voice: 'longxiaochun_v2',
        volume: 15
      }),
      '1.10 - volume 超出范围应抛出异常'
    );

    // 测试 1.4: 枚举验证
    assertThrows(
      () => parameterMapper.mapAndValidate('aliyun', 'cosyvoice', {
        voice: 'longxiaochun_v2',
        format: 'ogg'
      }),
      '1.11 - 无效 format 枚举值应抛出异常'
    );

    console.log('✅ Aliyun CosyVoice 测试通过\n');
  } catch (error) {
    console.error('❌ Aliyun CosyVoice 测试失败:', error.message);
  }

  // ========================================
  // 测试组 2: Tencent TTS
  // ========================================
  console.log('\n📋 测试组 2: Tencent TTS');
  console.log('----------------------------------------');

  try {
    // 测试 2.1: 参数映射
    const result1 = parameterMapper.mapAndValidate('tencent', 'tts', {
      voice: '101001',
      speed: 1.2,
      volume: 7
    });

    assert(result1.VoiceType === 101001, '2.1 - voice → VoiceType 并转换为整数');
    assert(result1.Speed === 1.2, '2.2 - speed → Speed');
    assert(result1.Volume === 7, '2.3 - volume → Volume');

    // 测试 2.2: 不支持 pitch 参数
    assertThrows(
      () => parameterMapper.mapAndValidate('tencent', 'tts', {
        voice: '101001',
        pitch: 1.2
      }),
      '2.4 - Tencent 不支持 pitch 应抛出异常'
    );

    // 测试 2.3: 默认值
    const result2 = parameterMapper.mapAndValidate('tencent', 'tts', {
      voice: '101001'
    });

    assert(result2.Speed === 1.0, '2.5 - Speed 默认值 1.0');
    assert(result2.Volume === 5, '2.6 - Volume 默认值 5');
    assert(result2.Codec === 'wav', '2.7 - Codec 默认值 wav');

    console.log('✅ Tencent TTS 测试通过\n');
  } catch (error) {
    console.error('❌ Tencent TTS 测试失败:', error.message);
  }

  // ========================================
  // 测试组 3: Volcengine HTTP
  // ========================================
  console.log('\n📋 测试组 3: Volcengine HTTP');
  console.log('----------------------------------------');

  try {
    // 测试 3.1: 嵌套结构映射
    const result1 = parameterMapper.mapAndValidate('volcengine', 'http', {
      voice: 'zh_female_shuangkuaisisi_moon_bigtts',
      speed: 1.5,
      volume: 5
    });

    assert(result1.audio && result1.audio.voice_type === 'zh_female_shuangkuaisisi_moon_bigtts',
      '3.1 - voice 嵌套映射到 audio.voice_type');
    assert(result1.audio && result1.audio.speed_ratio === 1.5,
      '3.2 - speed 嵌套映射到 audio.speed_ratio');
    assert(result1.audio && result1.audio.volume_ratio === 0.5,
      '3.3 - volume 标准化 (5/10=0.5)');

    // 测试 3.2: 不支持 pitch
    assertThrows(
      () => parameterMapper.mapAndValidate('volcengine', 'http', {
        voice: 'zh_female_shuangkuaisisi_moon_bigtts',
        pitch: 1.2
      }),
      '3.4 - Volcengine 不支持 pitch 应抛出异常'
    );

    console.log('✅ Volcengine HTTP 测试通过\n');
  } catch (error) {
    console.error('❌ Volcengine HTTP 测试失败:', error.message);
  }

  // ========================================
  // 测试组 4: MiniMax TTS
  // ========================================
  console.log('\n📋 测试组 4: MiniMax TTS');
  console.log('----------------------------------------');

  try {
    // 测试 4.1: 复杂嵌套结构
    const result1 = parameterMapper.mapAndValidate('minimax', 'tts', {
      voice: 'male-qn-qingse',
      speed: 1.2,
      volume: 8,
      pitch: 1.25,
      emotion: 'happy'
    });

    assert(result1.voice_setting && result1.voice_setting.voice_id === 'male-qn-qingse',
      '4.1 - voice 映射到 voice_setting.voice_id');
    assert(result1.voice_setting && result1.voice_setting.speed === 1.2,
      '4.2 - speed 映射到 voice_setting.speed');
    assert(result1.voice_setting && result1.voice_setting.vol === 0.8,
      '4.3 - volume 标准化 (8/10=0.8) → vol');
    assert(result1.voice_setting && result1.voice_setting.pitch === 6.0,
      '4.4 - pitch 标准化 ((1.25-1)*24=6) → pitch');
    assert(result1.voice_setting && result1.voice_setting.emotion === 'happy',
      '4.5 - emotion 参数');

    // 测试 4.2: pitch 标准化公式
    const result2 = parameterMapper.mapAndValidate('minimax', 'tts', {
      voice: 'male-qn-qingse',
      pitch: 0.5
    });

    assert(result2.voice_setting && result2.voice_setting.pitch === -12,
      '4.6 - pitch 标准化 ((0.5-1)*24=-12)');

    const result3 = parameterMapper.mapAndValidate('minimax', 'tts', {
      voice: 'male-qn-qingse',
      pitch: 1.5
    });

    assert(result3.voice_setting && result3.voice_setting.pitch === 12,
      '4.7 - pitch 标准化 ((1.5-1)*24=12)');

    // 测试 4.3: 默认值
    const result4 = parameterMapper.mapAndValidate('minimax', 'tts', {
      voice: 'male-qn-qingse'
    });

    assert(result4.voice_setting && result4.voice_setting.speed === 1.0,
      '4.8 - speed 默认值 1.0');
    assert(result4.voice_setting && result4.voice_setting.vol === 1.0,
      '4.9 - vol 默认值 1.0');
    assert(result4.voice_setting && result4.voice_setting.pitch === 0,
      '4.10 - pitch 默认值 0');
    assert(result4.audio_setting && result4.audio_setting.format === 'mp3',
      '4.11 - format 默认值 mp3');

    console.log('✅ MiniMax TTS 测试通过\n');
  } catch (error) {
    console.error('❌ MiniMax TTS 测试失败:', error.message);
  }

  // ========================================
  // 测试组 5: Qwen TTS
  // ========================================
  console.log('\n📋 测试组 5: Qwen TTS');
  console.log('----------------------------------------');

  try {
    // 测试 5.1: 基础映射
    const result1 = parameterMapper.mapAndValidate('aliyun', 'qwen', {
      voice: 'zhixiaobai'
    });

    assert(result1.input && result1.input.voice === 'zhixiaobai',
      '5.1 - voice 映射到 input.voice');

    // 测试 5.2: 不支持多个参数
    assertThrows(
      () => parameterMapper.mapAndValidate('aliyun', 'qwen', {
        voice: 'zhixiaobai',
        speed: 1.5
      }),
      '5.2 - Qwen 不支持 speed 应抛出异常'
    );

    assertThrows(
      () => parameterMapper.mapAndValidate('aliyun', 'qwen', {
        voice: 'zhixiaobai',
        volume: 5
      }),
      '5.3 - Qwen 不支持 volume 应抛出异常'
    );

    assertThrows(
      () => parameterMapper.mapAndValidate('aliyun', 'qwen', {
        voice: 'zhixiaobai',
        pitch: 1.2
      }),
      '5.4 - Qwen 不支持 pitch 应抛出异常'
    );

    console.log('✅ Qwen TTS 测试通过\n');
  } catch (error) {
    console.error('❌ Qwen TTS 测试失败:', error.message);
  }

  // ========================================
  // 测试组 6: 边界情况
  // ========================================
  console.log('\n📋 测试组 6: 边界情况');
  console.log('----------------------------------------');

  try {
    // 测试 6.1: 无效服务商
    assertThrows(
      () => parameterMapper.mapAndValidate('invalid_provider', 'tts', {}),
      '6.1 - 无效服务商应抛出异常'
    );

    // 测试 6.2: 无效服务类型
    assertThrows(
      () => parameterMapper.mapAndValidate('aliyun', 'invalid_service', {}),
      '6.2 - 无效服务类型应抛出异常'
    );

    // 测试 6.3: 类型错误
    assertThrows(
      () => parameterMapper.mapAndValidate('aliyun', 'cosyvoice', {
        voice: 'longxiaochun_v2',
        speed: 'not a number'
      }),
      '6.3 - speed 类型错误应抛出异常'
    );

    // 测试 6.4: 未知参数（应被忽略）
    const result1 = parameterMapper.mapAndValidate('aliyun', 'cosyvoice', {
      voice: 'longxiaochun_v2',
      unknown_param: 'some_value'
    });

    assert(!result1.unknown_param, '6.4 - 未知参数应被忽略');

    // 测试 6.5: null 和 undefined 参数
    const result2 = parameterMapper.mapAndValidate('aliyun', 'cosyvoice', {
      voice: 'longxiaochun_v2',
      speed: null,
      volume: undefined
    });

    assert(result2.rate === 1.0, '6.5 - null 参数应使用默认值');

    console.log('✅ 边界情况测试通过\n');
  } catch (error) {
    console.error('❌ 边界情况测试失败:', error.message);
  }

  // ========================================
  // 测试组 7: getSupportedParameters
  // ========================================
  console.log('\n📋 测试组 7: getSupportedParameters');
  console.log('----------------------------------------');

  try {
    // 测试 7.1: Aliyun CosyVoice 参数列表
    const params1 = parameterMapper.getSupportedParameters('aliyun', 'cosyvoice');

    assert(Array.isArray(params1) && params1.length > 0, '7.1 - 应返回参数数组');
    assert(params1.find(p => p.name === 'speed'), '7.2 - 应包含 speed 参数');
    assert(params1.find(p => p.name === 'volume'), '7.3 - 应包含 volume 参数');

    // 测试 7.2: Tencent TTS 参数列表
    const params2 = parameterMapper.getSupportedParameters('tencent', 'tts');

    assert(params2.find(p => p.name === 'speed'), '7.4 - Tencent 应支持 speed');
    assert(!params2.find(p => p.name === 'pitch'), '7.5 - Tencent 不应支持 pitch');

    // 测试 7.3: 无效服务商返回空数组
    const params3 = parameterMapper.getSupportedParameters('invalid', 'tts');

    assert(Array.isArray(params3) && params3.length === 0, '7.6 - 无效服务商应返回空数组');

    console.log('✅ getSupportedParameters 测试通过\n');
  } catch (error) {
    console.error('❌ getSupportedParameters 测试失败:', error.message);
  }

  // ========================================
  // 测试总结
  // ========================================
  console.log('\n========================================');
  console.log('测试总结');
  console.log('========================================');
  console.log(`✅ 通过: ${passedTests} 个测试`);
  console.log(`❌ 失败: ${failedTests} 个测试`);
  console.log(`📊 总计: ${passedTests + failedTests} 个测试`);
  console.log(`🎯 成功率: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(2)}%`);

  if (failedTests === 0) {
    console.log('\n🎉 所有测试通过！ParameterMapper 工作正常。\n');
    return true;
  } else {
    console.log('\n⚠️  部分测试失败，请检查上述错误信息。\n');
    return false;
  }
}

// 运行测试
if (require.main === module) {
  runTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('测试运行出错:', error);
      process.exit(1);
    });
}

module.exports = { runTests };
