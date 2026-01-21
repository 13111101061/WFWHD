const { VoiceCategoryGenerator } = require('./generate-voice-categories.js');

async function main() {
  try {
    const generator = new VoiceCategoryGenerator();
    await generator.generate();
    console.log('生成完成！');
  } catch (error) {
    console.error('生成失败:', error.message);
    process.exit(1);
  }
}

main();
