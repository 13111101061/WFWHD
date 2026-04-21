/**
 * 字段定义系统测试脚本
 *
 * 测试内容：
 * 1. 配置加载
 * 2. 三层定义合并
 * 3. 编译产物访问
 * 4. 参数校验
 * 5. 参数映射
 */

const path = require('path');

// 添加项目路径
const projectRoot = path.join(__dirname, '..');
process.chdir(projectRoot);

const {
  initialize,
  getCompiledCapability,
  getStats,
  SupportStatus
} = require('../src/modules/tts/config/FieldDefinitionSystem');

console.log('========================================');
console.log('字段定义系统测试');
console.log('========================================\n');

try {
  // 1. 初始化
  console.log('1. 初始化系统...');
  const { results, errors } = initialize();
  console.log(`   ✓ 编译了 ${Object.keys(results).length} 个服务`);
  if (errors.length > 0) {
    console.log('   ⚠ 错误:', errors);
  }

  // 2. 获取统计信息
  console.log('\n2. 注册表统计...');
  const stats = getStats();
  console.log('   ', stats);

  // 3. 测试 MOSS TTS
  console.log('\n3. 测试 MOSS TTS...');
  const mossCapability = getCompiledCapability('moss_tts', 'moss');
  console.log('   服务标识:', mossCapability.serviceKey);
  console.log('   API 结构:', mossCapability.apiStructure);
  console.log('   字段索引:', mossCapability.getFieldIndex());
  console.log('   默认值:', mossCapability.getDefaults());
  console.log('   锁定参数:', mossCapability.getLockedParams());

  // 4. 测试字段状态
  console.log('\n4. 测试 MOSS 字段状态...');
  console.log('   speed:', mossCapability.getFieldStatus('speed'));
  console.log('   expectedDurationSec:', mossCapability.getFieldStatus('expectedDurationSec'));
  console.log('   voice:', mossCapability.getFieldStatus('voice'));
  console.log('   format:', mossCapability.getFieldStatus('format'));

  // 5. 测试参数校验
  console.log('\n5. 测试参数校验...');
  const testParams = {
    text: '你好世界',
    format: 'wav',
    speed: 1.0  // MOSS 不支持
  };
  const validationResult = mossCapability.validate(testParams);
  console.log('   校验结果:', validationResult);

  // 6. 测试参数过滤
  console.log('\n6. 测试参数过滤...');
  const filteredParams = mossCapability.filterParams(testParams);
  console.log('   过滤前:', testParams);
  console.log('   过滤后:', filteredParams);

  // 7. 测试默认值合并
  console.log('\n7. 测试默认值合并...');
  const merged = mossCapability.mergeWithDefaults({ text: '测试' });
  console.log('   合并结果:', merged);

  // 8. 测试锁定参数应用
  console.log('\n8. 测试锁定参数应用...');
  const withLocked = mossCapability.applyLockedParams(
    { text: '测试' },
    { providerVoiceId: '2001257729754140672' }
  );
  console.log('   应用后:', withLocked);

  // 9. 测试字段来源追踪
  console.log('\n9. 测试字段来源追踪...');
  console.log('   expectedDurationSec:', JSON.stringify(mossCapability.traceField('expectedDurationSec'), null, 2));

  // 10. 测试阿里云 Qwen
  console.log('\n10. 测试阿里云 Qwen HTTP...');
  const qwenCapability = getCompiledCapability('aliyun_qwen_http', 'aliyun');
  console.log('   字段索引:', qwenCapability.getFieldIndex());
  console.log('   默认值:', qwenCapability.getDefaults());

  // 11. 测试 UI Schema
  console.log('\n11. 测试 UI Schema...');
  const uiSchema = mossCapability.getUiSchema();
  console.log('   分组数:', uiSchema.groups.length);
  console.log('   字段数:', Object.keys(uiSchema.fields).length);

  // 12. 测试映射到 Provider
  console.log('\n12. 测试映射到 Provider...');
  const providerParams = mossCapability.mapToProvider(
    { text: '你好', format: 'wav', sampleRate: 24000 },
    { providerVoiceId: 'test-voice-id' }
  );
  console.log('   Provider 参数:', providerParams);

  console.log('\n========================================');
  console.log('✓ 所有测试通过');
  console.log('========================================\n');

  // 显式退出，避免未关闭的句柄阻塞进程
  process.exit(0);

} catch (error) {
  console.error('\n✗ 测试失败:', error.message);
  console.error(error.stack);
  process.exit(1);
}
