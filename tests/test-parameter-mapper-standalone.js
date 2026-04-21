/**
 * Standalone ParameterMapper test - writes results to file
 */
const fs = require('fs');
const path = require('path');

async function runTest() {
  const results = [];
  const errors = [];

  function log(msg) {
    results.push(msg);
    console.log(msg);
  }

  function logError(msg) {
    errors.push(msg);
    console.error(msg);
  }

  try {
    const { parameterMapper } = require('../src/modules/tts/config/ParameterMapper');

    log('=== ParameterMapper 测试报告 ===\n');

    log('初始化 ParameterMapper...');
    await parameterMapper.initialize();
    log('✅ 初始化成功\n');

    // Test 1: Aliyun CosyVoice
    log('【测试 1】Aliyun CosyVoice - 基础映射');
    try {
      const result1 = parameterMapper.mapAndValidate('aliyun', 'cosyvoice', {
        voice: 'longxiaochun_v2',
        speed: 1.5,
        volume: 8
      });
      log('输入: {voice: "longxiaochun_v2", speed: 1.5, volume: 8}');
      log('输出: ' + JSON.stringify(result1, null, 2));
      log('✅ speed → rate: ' + result1.rate);
      log('✅ volume 标准化: 8 → ' + result1.volume + ' (8*10)');
      if (result1.rate === 1.5 && result1.volume === 80) {
        log('✅ 测试通过\n');
      } else {
        logError('❌ 测试失败: 期望 rate=1.5, volume=80\n');
      }
    } catch (error) {
      logError('❌ 测试失败: ' + error.message + '\n');
    }

    // Test 2: MiniMax 嵌套结构
    log('【测试 2】MiniMax TTS - 嵌套映射 + 标准化');
    try {
      const result2 = parameterMapper.mapAndValidate('minimax', 'minimax_tts', {
        voice: 'male-qn-qingse',
        speed: 1.2,
        volume: 8,
        pitch: 1.25
      });
      log('输入: {voice: "male-qn-qingse", speed: 1.2, volume: 8, pitch: 1.25}');
      log('输出: ' + JSON.stringify(result2, null, 2));

      const vol = result2.voice_setting?.vol;
      const pitch = result2.voice_setting?.pitch;
      log('✅ volume 标准化: 8 → ' + vol + ' (8/10)');
      log('✅ pitch 标准化: 1.25 → ' + pitch + ' ((1.25-1)*24)');

      if (vol === 0.8 && pitch === 6.0) {
        log('✅ 测试通过\n');
      } else {
        logError('❌ 测试失败: 期望 vol=0.8, pitch=6.0\n');
      }
    } catch (error) {
      logError('❌ 测试失败: ' + error.message + '\n');
    }

    // Test 3: Tencent TTS
    log('【测试 3】Tencent TTS - 类型转换');
    try {
      const result3 = parameterMapper.mapAndValidate('tencent', 'tts', {
        voice: 101001,
        volume: 7
      });
      log('输入: {voice: 101001, volume: 7}');
      log('输出: ' + JSON.stringify(result3, null, 2));
      log('✅ voice 字符串转整数: "101001" → ' + result3.VoiceType + ' (类型: ' + typeof result3.VoiceType + ')');

      if (result3.VoiceType === 101001 && result3.Volume === 7) {
        log('✅ 测试通过\n');
      } else {
        logError('❌ 测试失败: 期望 VoiceType=101001\n');
      }
    } catch (error) {
      logError('❌ 测试失败: ' + error.message + '\n');
    }

    // Test 4: Volcengine 嵌套结构
    log('【测试 4】Volcengine HTTP - 深层嵌套');
    try {
      const result4 = parameterMapper.mapAndValidate('volcengine', 'volcengine_http', {
        voice: 'zh_female_shuangkuaisisi_moon_bigtts',
        volume: 5
      });
      log('输入: {voice: "zh_female_shuangkuaisisi_moon_bigtts", volume: 5}');
      log('输出: ' + JSON.stringify(result4, null, 2));

      const vol = result4.audio?.volume_ratio;
      log('✅ volume 嵌套映射: audio.volume_ratio = ' + vol + ' (5/10)');

      if (vol === 0.5) {
        log('✅ 测试通过\n');
      } else {
        logError('❌ 测试失败: 期望 volume_ratio=0.5\n');
      }
    } catch (error) {
      logError('❌ 测试失败: ' + error.message + '\n');
    }

    // Test 5: 错误处理 - 不支持的参数
    log('【测试 5】错误处理 - Tencent 不支持 pitch');
    try {
      parameterMapper.mapAndValidate('tencent', 'tts', {
        voice: 101001,
        pitch: 1.2
      });
      logError('❌ 测试失败: 应该抛出异常但没有\n');
    } catch (error) {
      log('✅ 正确抛出异常: ' + error.message);
      log('✅ 测试通过\n');
    }

    // Test 6: 错误处理 - 范围验证
    log('【测试 6】错误处理 - speed 超出范围');
    try {
      parameterMapper.mapAndValidate('aliyun', 'cosyvoice', {
        voice: 'longxiaochun_v2',
        speed: 5.0
      });
      logError('❌ 测试失败: 应该抛出异常但没有\n');
    } catch (error) {
      log('✅ 正确抛出异常: ' + error.message);
      log('✅ 测试通过\n');
    }

    // Test 7: 默认值
    log('【测试 7】默认值应用');
    try {
      const result7 = parameterMapper.mapAndValidate('minimax', 'minimax_tts', {
        voice: 'male-qn-qingse'
      });
      log('输入: {voice: "male-qn-qingse"}');
      log('输出: ' + JSON.stringify(result7, null, 2));

      const speed = result7.voice_setting?.speed;
      const vol = result7.voice_setting?.vol;
      const pitch = result7.voice_setting?.pitch;

      log('✅ speed 默认值: ' + speed);
      log('✅ volume 默认值: ' + vol);
      log('✅ pitch 默认值: ' + pitch);

      if (speed === 1.0 && vol === 1.0 && pitch === 0) {
        log('✅ 测试通过\n');
      } else {
        logError('❌ 测试失败: 默认值不正确\n');
      }
    } catch (error) {
      logError('❌ 测试失败: ' + error.message + '\n');
    }

    // Test 8: Qwen 不支持多个参数
    log('【测试 8】Qwen - 参数支持检查');
    try {
      parameterMapper.mapAndValidate('aliyun', 'qwen_http', {
        voice: 'zhixiaobai',
        speed: 1.5
      });
      logError('❌ 测试失败: Qwen 不应该支持 speed\n');
    } catch (error) {
      log('✅ 正确拒绝 speed 参数: ' + error.message);
      log('✅ 测试通过\n');
    }

    // 总结
    log('========================================');
    log('测试总结');
    log('========================================');

    const errorCount = errors.length;
    const totalCount = 8;
    const successCount = totalCount - errorCount;
    const successRate = ((successCount / totalCount) * 100).toFixed(2);

    log('总测试数: ' + totalCount);
    log('通过: ' + successCount);
    log('失败: ' + errorCount);
    log('成功率: ' + successRate + '%');

    if (errorCount === 0) {
      log('\n🎉 所有测试通过！ParameterMapper 工作正常。');
    } else {
      log('\n⚠️  部分测试失败。');
      errors.forEach(err => log('  - ' + err));
    }

    // 写入文件
    const output = results.join('\n') + '\n\n错误:\n' + (errors.length > 0 ? errors.join('\n') : '无');
    const outputFile = path.join(__dirname, 'test-results.txt');
    fs.writeFileSync(outputFile, output, 'utf8');
    log('\n测试结果已保存到: ' + outputFile);

  } catch (error) {
    logError('\n❌ 严重错误: ' + error.message);
    logError(error.stack);
  }
}

runTest().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
