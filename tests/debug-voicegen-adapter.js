const serviceContainer = require('../src/config/ServiceContainer');

(async () => {
  await serviceContainer.initialize();
  const pms = serviceContainer.get('providerManagementService');

  // 直接用 adapter 调
  const adapter = pms.getAdapter('moss_voicegen');
  console.log('adapter class:', adapter.constructor.name);
  console.log('endpoint:', adapter._endpoint);
  console.log('bodyTemplate:', JSON.stringify(adapter._bodyTemplate));

  try {
    const result = await adapter.synthesize('窝在沙发上翻了半天手机', {
      model: 'moss-voice-generator',
      instruction: '一个御姐充满妩媚而又有磁性的声音',
      format: 'wav',
      sampleRate: 24000
    });

    console.log('✅ synthesize result keys:', Object.keys(result));
    console.log('format:', result.format);
    console.log('audio size:', result.audio?.length || 'N/A');

    const saved = await adapter.synthesizeAndSave('窝在沙发上翻了半天手机', {
      model: 'moss-voice-generator',
      instruction: '一个御姐充满妩媚而又有磁性的声音'
    });
    console.log('✅ synthesizeAndSave url:', saved.url);
  } catch (e) {
    console.error('❌', e.message);
    if (e.response) console.error('status:', e.response.status);
  }

  // 等一下确保异步操作完成
  setTimeout(() => process.exit(0), 1000);
})();
