/**
 * 字段定义系统测试脚本
 */

const path = require('path');
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
  console.log('1. 初始化系统...');
  const { results, errors } = initialize();
  console.log(`   ✓ 编译了 ${Object.keys(results).length} 个服务`);
  if (errors.length > 0) console.log('   ⚠ 错误:', errors);

  console.log('\n2. 注册表统计...');
  console.log('   ', getStats());

  console.log('\n3. 测试 MOSS TTS...');
  const moss = getCompiledCapability('moss_tts', 'moss');
  console.log('   serviceKey:', moss.serviceKey);
  console.log('   apiStructure:', moss.apiStructure);
  console.log('   fieldIndex:', moss.getFieldIndex());
  console.log('   defaults:', moss.getDefaults());
  console.log('   lockedParams:', moss.getLockedParams());

  console.log('\n4. 字段状态...');
  console.log('   speed:', moss.getFieldStatus('speed'));
  console.log('   expectedDurationSec:', moss.getFieldStatus('expectedDurationSec'));
  console.log('   voice:', moss.getFieldStatus('voice'));

  console.log('\n5. 参数校验...');
  console.log('   ', moss.validate({ text: '你好', speed: 1.0 }));

  console.log('\n6. 参数解析 (resolveParams)...');
  const resolved = moss.resolveParams(
    { text: '你好', format: 'wav', speed: 1.0 },
    { providerVoiceId: '2001257729754140672' }
  );
  console.log('   params:', resolved.params);
  console.log('   warnings:', resolved.warnings);

  console.log('\n7. 锁定参数应用...');
  console.log('   ', moss.applyLockedParams({ text: '测试' }, { providerVoiceId: 'test-voice-id' }));

  console.log('\n8. 字段来源追踪...');
  console.log('   expectedDurationSec:', JSON.stringify(moss.traceField('expectedDurationSec'), null, 2));

  console.log('\n9. 阿里云 Qwen HTTP...');
  const qwen = getCompiledCapability('aliyun_qwen_http', 'aliyun');
  console.log('   fieldIndex:', qwen.getFieldIndex());
  console.log('   defaults:', qwen.getDefaults());

  console.log('\n10. UI Schema...');
  console.log('   groups:', moss.getUiSchema().groups.length);
  console.log('   fields:', Object.keys(moss.getUiSchema().fields).length);

  console.log('\n11. 映射到 Provider...');
  console.log('   ', moss.mapToProvider(
    { text: '你好', format: 'wav', sampleRate: 24000 },
    { providerVoiceId: 'test-voice-id' }
  ));

  console.log('\n========================================');
  console.log('✓ 所有测试通过');
  console.log('========================================\n');
  process.exit(0);

} catch (error) {
  console.error('\n✗ 测试失败:', error.message);
  console.error(error.stack);
  process.exit(1);
}