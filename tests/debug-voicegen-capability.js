const serviceContainer = require('../src/config/ServiceContainer');

(async () => {
  await serviceContainer.initialize();
  const capResolver = serviceContainer.get('capabilityResolver');
  const ctx = capResolver.resolve({ serviceKey: 'moss_voicegen' });
  const compiled = ctx.compiled;

  // 看 instruction 字段的编译结果
  const instField = compiled.getField('instruction');
  console.log('instruction field:');
  console.log('  status:', instField.status);
  console.log('  required:', instField.required);
  console.log('  mapTo:', instField.mapTo);
  console.log('  has mapper:', !!instField.mapper);

  // 看 voice 字段的编译结果
  const voiceField = compiled.getField('voice');
  console.log('\nvoice field:');
  console.log('  status:', voiceField.status);
  console.log('  required:', voiceField.required);

  // 模拟参数映射
  const defaults = compiled.getDefaults();
  console.log('\ndefaults:', JSON.stringify(defaults));

  const userParams = { instruction: '一个测试描述' };
  const params = { ...defaults, ...userParams };
  console.log('\nmerged params:', JSON.stringify(params));

  const mapped = compiled.mapToProvider(params, { providerVoiceId: null });
  console.log('\nmapped:', JSON.stringify(mapped));

  // 看 schema 中所有字段
  console.log('\nAll fields:');
  const schema = compiled.getSchema();
  for (const [key, field] of Object.entries(schema)) {
    console.log(`  ${key}: status=${field.status} required=${field.required} mapTo=${field.mapTo} hasMapper=${!!field.mapper}`);
  }

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
