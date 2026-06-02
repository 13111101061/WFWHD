const serviceContainer = require('../src/config/ServiceContainer');
const TemplateResolver = require('../src/modules/tts/providers/TemplateResolver');
const credentials = require('../src/modules/credentials');

(async () => {
  await serviceContainer.initialize();
  const creds = credentials.getCredentials('moss');
  const r = new TemplateResolver();

  // 模拟 manifest bodyTemplate
  const bodyTemplate = {
    model: '${params.model}',
    text: '${text}',
    instruction: '${params.instruction}',
    sampling_params: '${params.sampling_params}',
    meta_info: true
  };

  const context = {
    text: '窝在沙发上翻了半天手机',
    params: {
      model: 'moss-voice-generator',
      instruction: '一个御姐充满妩媚而又有磁性的声音',
      format: 'wav',
      sampleRate: 24000
    },
    credential: creds
  };

  const body = r.resolve(bodyTemplate, context);
  console.log('resolved body:', JSON.stringify(body, null, 2));

  // 检查 sampling_params 的值
  const sp = body.sampling_params;
  console.log('sampling_params type:', typeof sp);
  console.log('sampling_params value:', sp);

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
