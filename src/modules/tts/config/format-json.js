const fs = require('fs');
const path = require('path');

// 读取 JSON 文件
const jsonPath = path.join(__dirname, 'voiceIdMapping.json');
const jsonStr = fs.readFileSync(jsonPath, 'utf8');

// 解析 JSON
const data = JSON.parse(jsonStr);

// 自定义序列化函数，控制数组的格式
function formatJSON(obj, indent = 0) {
  const spaces = '  '.repeat(indent);
  const nextSpaces = '  '.repeat(indent + 1);

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    // 对于 languages 和 tags 数组，使用单行格式
    return '[\n' + obj.map(item =>
      nextSpaces + JSON.stringify(item)
    ).join(',\n') + '\n' + spaces + ']';
  } else if (typeof obj === 'object' && obj !== null) {
    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';

    let result = '{\n';
    keys.forEach((key, index) => {
      const value = obj[key];
      const isLast = index === keys.length - 1;

      // 判断是否是需要特殊处理的字段
      if (key === 'languages' || key === 'tags') {
        // languages 和 tags 使用紧凑的数组格式
        const arrayStr = JSON.stringify(value);
        result += nextSpaces + JSON.stringify(key) + ': ' + arrayStr;
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // 嵌套对象继续格式化
        result += nextSpaces + JSON.stringify(key) + ': ' + formatJSON(value, indent + 1);
      } else if (Array.isArray(value)) {
        // 其他数组也格式化
        result += nextSpaces + JSON.stringify(key) + ': ' + formatJSON(value, indent + 1);
      } else {
        // 基本类型直接使用 JSON.stringify
        result += nextSpaces + JSON.stringify(key) + ': ' + JSON.stringify(value);
      }

      if (!isLast) result += ',';
      result += '\n';
    });
    result += spaces + '}';
    return result;
  } else {
    return JSON.stringify(obj);
  }
}

// 使用 Node.js 的 JSON.stringify 但替换数组格式
const formatted = JSON.stringify(data, null, 2)
  // 将 languages 和 tags 的多行数组格式改为单行
  .replace(/"languages": \[\s*\n([\s\S]*?)\n\s*\]/g, (match, content) => {
    const items = content.trim().split('\n').map(line => line.trim().replace(/,$/, '')).filter(l => l);
    return '"languages": [' + items.join(', ') + ']';
  })
  .replace(/"tags": \[\s*\n([\s\S]*?)\n\s*\]/g, (match, content) => {
    const items = content.trim().split('\n').map(line => line.trim().replace(/,$/, '')).filter(l => l);
    return '"tags": [' + items.join(', ') + ']';
  });

// 写回文件
fs.writeFileSync(jsonPath, formatted, 'utf8');

console.log('✅ JSON 格式化完成！');
