/**
 * 调试ParameterMapper的行为
 */

const { parameterMapper } = require('../src/modules/tts/config/ParameterMapper');

async function debugParameterMapper() {
  console.log('========================================');
  console.log('   ParameterMapper调试测试');
  console.log('========================================\n');

  // 初始化
  await parameterMapper.initialize();

  // 测试1: 映射voice参数
  console.log('📝 测试1: 映射voice参数');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const input1 = { voice: 'Kai', language_type: 'Auto' };
  console.log('输入参数:', JSON.stringify(input1, null, 2));

  const result1 = parameterMapper.mapAndValidate('aliyun', 'qwen_http', input1);
  console.log('输出参数:', JSON.stringify(result1, null, 2));
  console.log('voice的值:', result1.input?.voice);
  console.log();

  // 测试2: 不传voice参数
  console.log('📝 测试2: 不传voice参数（检查默认值）');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const input2 = { language_type: 'Auto' };
  console.log('输入参数:', JSON.stringify(input2, null, 2));

  const result2 = parameterMapper.mapAndValidate('aliyun', 'qwen_http', input2);
  console.log('输出参数:', JSON.stringify(result2, null, 2));
  console.log('voice的值:', result2.input?.voice);
  console.log();

  // 测试3: 查看配置
  console.log('📝 测试3: 查看qwen_http的voice配置');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const voiceConfig = parameterMapper.getParameterConfig('aliyun', 'qwen_http', 'voice');
  console.log('voice配置:', JSON.stringify(voiceConfig, null, 2));
  console.log();

  // 测试4: 查看所有支持的参数
  console.log('📝 测试4: 查看qwen_http支持的所有参数');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const supportedParams = parameterMapper.getSupportedParameters('aliyun', 'qwen_http');
  console.log('支持的参数:');
  supportedParams.forEach(param => {
    console.log(`  - ${param.name}`);
    console.log(`    类型: ${param.type}`);
    console.log(`    API字段: ${param.name === 'voice' ? 'input.voice' : 'N/A'}`);
    console.log(`    必需: ${param.required ? '是' : '否'}`);
    console.log(`    默认值: ${param.defaultValue !== undefined ? param.defaultValue : '未定义'}`);
  });
  console.log();
}

debugParameterMapper()
  .then(() => {
    console.log('✅ 调试完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 调试失败:', error);
    process.exit(1);
  });
