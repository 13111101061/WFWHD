/**
 * 批量更新音色标签和描述
 */
const fs = require('fs');
const path = require('path');

// 音色数据映射（根据文件中的表格）
const voiceUpdates = {
  'Cherry': {
    tags: ["舒缓", "亲切", "自然", "治愈", "温柔", "温暖"],
    description: "阳光积极的邻家姐姐，用亲切自然的话语予人最贴心的治愈。"
  },
  'Serena': {
    tags: ["阳光", "明亮", "亲切", "清澈", "活泼", "温柔"],
    description: "温柔而充满阳光的声音，如同明亮清泉，带来清澈亲切的听觉体验。"
  },
  'Ethan': {
    tags: ["阳光", "温暖", "活力", "朝气", "磁性", "可靠"],
    description: "充满朝气与活力的青年之声，温暖有力，尽显北方口音的爽朗与可靠。"
  },
  'Chelsie': {
    tags: ["二次元", "软萌", "甜美", "娇憨", "亲密", "心动"],
    description: "甜美软萌的二次元虚拟女友，声音亲密无间，带着一丝娇憨与心动。"
  },
  'Momo': {
    tags: ["搞怪", "撒娇", "活泼", "俏皮", "灵动", "元气少女"],
    description: "古灵精怪的开心果，声音多变搞怪，擅长用撒娇和俏皮逗你开心。"
  },
  'Vivian': {
    tags: ["傲娇", "帅气", "个性", "小暴躁", "叛逆", "反差萌"],
    description: "外表帅气、拽拽的傲娇少女，偶尔的可爱小暴躁下藏着一颗柔软的心。"
  },
  'Moon': {
    tags: ["清冷", "帅气", "洒脱", "磁性", "冷静", "少年感"],
    description: "率性帅气的清冷少年音，语调从容洒脱，如月光般皎洁而有磁性。"
  },
  'Maia': {
    tags: ["知性", "温柔", "御姐", "气质", "陪伴", "成熟"],
    description: "知性与温柔并存的御姐，如月光般优雅迷人。"
  },
  'Kai': {
    tags: ["低沉", "磁性", "专业", "评述", "冷静", "深度"],
    description: "声线低沉磁性，如同专业的音乐评述人，冷静而富有深度。"
  },
  'Nofish': {
    tags: ["清新", "文艺", "少年音", "平舌", "自然", "个性"],
    description: "不会翘舌的清新少年音，自然率性，如同文艺范的设计师。"
  },
  'Bella': {
    tags: ["萝莉", "奶萌", "俏皮", "活泼", "酒鬼", "个性"],
    description: "奶萌俏皮的小萝莉，声音里带着不打醉拳的狡黠与活泼。"
  },
  'Jennifer': {
    tags: ["英语", "专业", "高级", "优雅", "成熟", "广告"],
    description: "品牌级英语广告女声，质感优雅，尽显高级与专业。"
  },
  'Ryan': {
    tags: ["英语", "电影感", "张力", "情感丰富", "沉浸", "演技派"],
    description: "戏感炸裂的英语电影男声，节奏与张力十足，极具沉浸感。"
  },
  'Katerina': {
    tags: ["英语", "御姐", "韵律", "成熟", "优雅", "气场"],
    description: "韵律十足的英语御姐音，成熟优雅，气场全开。"
  },
  'Aiden': {
    tags: ["英语", "青年", "腼腆", "干净", "阳光", "邻家"],
    description: "精通美语的腼腆大男孩，声音干净，带着邻家般的阳光感。"
  },
  'Eldric Sage': {
    tags: ["长者", "睿智", "沉稳", "沧桑", "故事感", "哲学"],
    description: "沉稳睿智的老者，声音历经沧桑，心明如镜，充满故事感。"
  },
  'Mia': {
    tags: ["乖巧", "温顺", "甜美", "软糯", "年轻女性", "治愈"],
    description: "温顺乖巧的邻家小妹，声音甜美软糯，治愈力十足。"
  },
  'Mochi': {
    tags: ["正太", "聪明", "小大人", "童真", "清秀", "早慧"],
    description: "聪明伶俐的小大人，童真未泯，声音清秀又透着一丝早慧。"
  },
  'Bellona': {
    tags: ["洪亮", "清晰", "戏剧性", "说书人", "江湖", "热血"],
    description: "声音洪亮清晰的江湖说书人，节奏感强，字正腔圆，一听就让人热血沸腾。"
  },
  'Vincent': {
    tags: ["沙哑", "烟嗓", "说书人", "沧桑", "豪情", "故事"],
    description: "一口独特的沙哑烟嗓，是道尽江湖豪情与千军万马的传奇说书人。"
  },
  'Bunny': {
    tags: ["萝莉", "萌", "甜美", "软糯", "可爱", "儿童"],
    description: "萌属性爆棚的小萝莉音，甜美可爱，让人瞬间心化。"
  },
  'Neil': {
    tags: ["专业", "新闻", "客观", "字正腔圆", "权威", "沉稳"],
    description: "字正腔圆的专业新闻主持人，语调平直客观，极具权威感。"
  },
  'Elias': {
    tags: ["教育", "知识", "清晰", "条理", "女性", "治愈"],
    description: "将复杂知识通俗化的解惑者，声音清晰条理，兼具学科严谨与叙事温情。"
  },
  'Arthur': {
    tags: ["乡土", "质朴", "故事", "慢节奏", "沧桑", "长者"],
    description: "被岁月沉淀的质朴之声，不疾不徐地讲述着村里的奇闻异事。"
  },
  'Nini': {
    tags: ["撒娇", "软糯", "甜美", "甜蜜", "年轻女性", "萝莉音"],
    description: "糯米糍一样软又黏的嗓音，那一声\"哥哥\"甜到骨子里。"
  },
  'Ebona': {
    tags: ["神秘", "黑暗", "低语", "疗愈", "哥特", "气声"],
    description: "伴随幽暗与恐惧的低语，如同生锈的钥匙，缓缓开启你内心深处。"
  },
  'Seren': {
    tags: ["舒缓", "助眠", "温柔", "治愈", "ASMR", "晚安"],
    description: "温和舒缓的助眠师，用温柔的声线伴你安然入梦。"
  },
  'Pip': {
    tags: ["顽皮", "活泼", "童真", "搞笑", "正太", "个性"],
    description: "调皮捣蛋又充满童真的小新，声音里全是古灵精怪的快乐。"
  },
  'Stella': {
    tags: ["双重人格", "动漫", "元气", "甜美", "帅气", "战斗少女"],
    description: "平时是甜美的迷糊少女，关键时刻能瞬间变身充满正义的战斗少女。"
  },
  'Bodega': {
    tags: ["西班牙语", "热情", "大叔", "阳光", "活力"],
    description: "热情洋溢的西班牙大叔，声音里满是阳光与拉丁式的活力。"
  },
  'Sonrisa': {
    tags: ["西班牙语", "热情", "开朗", "大姐姐", "活力"],
    description: "热情开朗的拉美大姐，声音极具感染力，仿佛能驱散所有阴霾。"
  },
  'Alek': {
    tags: ["俄语", "战斗民族", "硬朗", "冷酷", "低沉"],
    description: "一开口就是典型的俄罗斯硬朗口音，自带战斗民族的冷峻气场。"
  },
  'Dolce': {
    tags: ["意大利语", "慵懒", "浪漫", "磁性", "随性"],
    description: "如同午后阳光般慵懒的意大利大叔，声音随性而充满浪漫。"
  },
  'Sohee': {
    tags: ["韩语", "温柔", "开朗", "欧尼", "甜美", "情绪丰富"],
    description: "温柔开朗的韩国欧尼，声音甜美，情绪表达丰富而真诚。"
  },
  'Ono Anna': {
    tags: ["日语", "鬼马", "活泼", "娇俏", "邻家", "青梅竹马"],
    description: "鬼灵精怪的日语青梅竹马，声音娇俏活泼，充满邻家少女感。"
  },
  'Lenn': {
    tags: ["德语", "理性", "叛逆", "青年", "冷静", "个性"],
    description: "理性是底色的德国青年，细节中藏着不羁的叛逆，声音冷静而独特。"
  },
  'Emilien': {
    tags: ["法语", "浪漫", "温柔", "大哥哥", "磁性", "优雅"],
    description: "浪漫的法国大哥哥，声音优雅温柔，充满了迷人的绅士风度。"
  },
  'Andre': {
    tags: ["西班牙语", "稳重", "理性", "科学家", "丈夫", "成熟"],
    description: "稳重可靠的西班牙科学家，声音沉静理性，是值得信赖的伴侣与学者。"
  },
  'Radio Gol': {
    tags: ["体育", "解说", "激情", "诗人", "西班牙语", "活力"],
    description: "赛场上的足球诗人，用充满激情的西班牙语为你解说每一场精彩对决。"
  },
  'Jada': {
    tags: ["阿姐", "干练", "活泼", "爽朗"],
    description: "风风火火的沪上阿姐，做事干练，性格爽朗。"
  },
  'Dylan': {
    tags: ["少年", "活力", "地道", "胡同"],
    description: "从北京胡同里长大的少年，充满活力，口音地道。"
  },
  'Li': {
    tags: ["老师", "耐心", "沉稳", "温柔"],
    description: "语气温和的瑜伽老师，声音沉稳，极具耐心。"
  },
  'Marcus': {
    tags: ["长者", "淳朴", "沉稳", "憨厚"],
    description: "心实声沉的老陕，话音里透着西北汉子的淳朴与沉稳。"
  },
  'Roy': {
    tags: ["台哥", "诙谐", "直爽", "活泼"],
    description: "诙谐直爽的台湾哥仔，声音市井活泼，充满生活气息。"
  },
  'Peter': {
    tags: ["相声", "幽默", "捧哏", "诙谐"],
    description: "天津相声专业捧哏，一开口就自带幽默效果。"
  },
  'Sunny': {
    tags: ["川妹子", "甜美", "活泼", "娇媚"],
    description: "甜到心里的川妹子，声音活泼娇媚，感染力十足。"
  },
  'Eric': {
    tags: ["成都", "个性", "洒脱", "风趣"],
    description: "跳脱市井的成都男子，声音里带着风趣与洒脱。"
  },
  'Rocky': {
    tags: ["广仔", "幽默", "风趣", "陪聊"],
    description: "幽默风趣的粤语阿强，是你的在线陪聊好朋友。"
  },
  'Kiki': {
    tags: ["港妹", "甜美", "闺蜜", "少女"],
    description: "声音甜美的港妹闺蜜，亲切可爱，如同少女在耳边低语。"
  }
};

async function main() {
  const mappingPath = path.join(__dirname, 'voiceIdMapping.json');

  // 读取现有配置
  const data = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));

  let updatedCount = 0;
  let descAddedCount = 0;

  // 更新每个音色
  data.voices.forEach(voice => {
    const update = voiceUpdates[voice.name];

    if (update) {
      // 更新标签
      if (update.tags) {
        voice.tags = update.tags;
        updatedCount++;
      }

      // 添加描述
      if (update.description && !voice.description) {
        voice.description = update.description;
        descAddedCount++;
      }
    }
  });

  // 更新时间戳
  data.lastUpdated = new Date().toISOString();

  // 写回文件
  fs.writeFileSync(mappingPath, JSON.stringify(data, null, 2), 'utf8');

  console.log(`✅ 更新完成！`);
  console.log(`   - 更新标签: ${updatedCount} 个`);
  console.log(`   - 添加描述: ${descAddedCount} 个`);
  console.log(`   - 总音色数: ${data.voices.length} 个`);
}

main().catch(console.error);
