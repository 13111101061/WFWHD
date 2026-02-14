/**
 * 为音色添加中文名和音频预览链接
 */
const fs = require('fs');
const path = require('path');

// 音频CDN直链映射
const audioPreviews = {
  'Cherry': { displayName: '樱桃', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/cherry.wav' },
  'Serena': { displayName: '苏娜', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/serena.wav' },
  'Ethan': { displayName: '器宇', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/ethan.wav' },
  'Chelsie': { displayName: '车丽', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/chelsie.wav' },
  'Momo': { displayName: '墨墨', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Momo.wav' },
  'Vivian': { displayName: '十三', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Vivian.wav' },
  'Moon': { displayName: '月白', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Moon.wav' },
  'Maia': { displayName: '四月', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Maia.wav' },
  'Kai': { displayName: '凯', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Kai.wav' },
  'Nofish': { displayName: '不吃鱼', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Nofish.wav' },
  'Bella': { displayName: '萌宝', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Bella.wav' },
  'Jennifer': { displayName: '詹妮弗', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Jennifer.wav' },
  'Ryan': { displayName: '甜茶', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Ryan.wav' },
  'Katerina': { displayName: '卡捷琳娜', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Katerina.wav' },
  'Aiden': { displayName: '艾登', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Aiden.wav' },
  'Eldric Sage': { displayName: '沧明子', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Eldric+Sage.wav' },
  'Mia': { displayName: '乖小妹', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Mia.wav' },
  'Mochi': { displayName: '沙小弥', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Mochi.wav' },
  'Bellona': { displayName: '燕铮莺', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Bellona.wav' },
  'Vincent': { displayName: '田叔', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Vincent.wav' },
  'Bunny': { displayName: '萌小姬', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Bunny.wav' },
  'Neil': { displayName: '阿闻', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Neil.wav' },
  'Elias': { displayName: '墨讲师', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Elias.wav' },
  'Arthur': { displayName: '徐大爷', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Arthur.wav' },
  'Nini': { displayName: '邻家妹妹', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Nini.wav' },
  'Ebona': { displayName: '诡婆婆', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Ebona.wav' },
  'Seren': { displayName: '小婉', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Seren.wav' },
  'Pip': { displayName: '顽屁小孩', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Pip.wav' },
  'Stella': { displayName: '少女阿月', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Stella.wav' },
  'Bodega': { displayName: '博德加', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Bodega.wav' },
  'Sonrisa': { displayName: '索尼莎', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Sonrisa.wav' },
  'Alek': { displayName: '阿列克', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Alek.wav' },
  'Dolce': { displayName: '多尔切', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Dolce.wav' },
  'Sohee': { displayName: '素熙', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Sohee.wav' },
  'Ono Anna': { displayName: '小野杏', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Ono+Anna.wav' },
  'Lenn': { displayName: '莱恩', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Lenn.wav' },
  'Emilien': { displayName: '埃米尔安', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Emilien.wav' },
  'Andre': { displayName: '安德雷', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Andre.wav' },
  'Radio Gol': { displayName: '拉迪奥·戈尔', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Radio+Gol.wav' },
  'Jada': { displayName: '上海-阿珍', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Jada.wav' },
  'Dylan': { displayName: '北京-晓东', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Dylan.wav' },
  'Li': { displayName: '南京-老李', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Li.wav' },
  'Marcus': { displayName: '陕西-秦川', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Marcus.wav' },
  'Roy': { displayName: '闽南-阿杰', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Roy.wav' },
  'Peter': { displayName: '天津-李彼得', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Peter.wav' },
  'Sunny': { displayName: '四川-晴儿', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Sunny.wav' },
  'Eric': { displayName: '四川-程川', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Eric.wav' },
  'Rocky': { displayName: '粤语-阿强', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/Rocky.wav' },
  'Kiki': { displayName: '粤语-阿清', url: 'http://bf.9p.pw/YP-WJ/QWEN-LA/KiKi.wav' }
};

async function main() {
  const mappingPath = path.join(__dirname, 'voiceIdMapping.json');

  // 读取现有配置
  const data = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));

  let updatedCount = 0;
  let previewAddedCount = 0;

  // 更新每个音色
  data.voices.forEach(voice => {
    const preview = audioPreviews[voice.name];

    if (preview) {
      // 添加中文名
      if (!voice.displayName) {
        voice.displayName = preview.displayName;
        updatedCount++;
      }

      // 添加预览链接
      if (!voice.preview) {
        voice.preview = preview.url;
        previewAddedCount++;
      }
    }
  });

  // 更新时间戳
  data.lastUpdated = new Date().toISOString();

  // 写回文件
  fs.writeFileSync(mappingPath, JSON.stringify(data, null, 2), 'utf8');

  console.log(`✅ 更新完成！`);
  console.log(`   - 添加中文名: ${updatedCount} 个`);
  console.log(`   - 添加预览链接: ${previewAddedCount} 个`);
  console.log(`   - 总音色数: ${data.voices.length} 个`);
}

main().catch(console.error);
