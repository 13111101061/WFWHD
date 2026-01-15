const fs = require('fs');
const axios = require('axios');
const path = require('path');

async function uploadFile() {
  try {
    // 文件路径
    const filePath = path.join(__dirname, '..', 'API_DOCUMENTATION.md');
    
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      console.error('文件不存在:', filePath);
      return;
    }
    
    console.log('准备上传文件:', filePath);
    
    // 读取文件
    const fileBuffer = fs.readFileSync(filePath);
    
    // 创建表单数据
    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), 'API_DOCUMENTATION.md');
    
    // 上传URL（从测试脚本中获取）
    const uploadUrl = 'https://up.zz.node.snpan.cn/upload?d=158&s=JvS%2B5OirxXC4looBXmDNRzz9ppFpTHh8dzCbqeDh%2FjcbdfbevDU%2B0gCFktKk3ZWMX%2F%2FVIWm%2FW1htHEhkxiCk3cxiGpelCuu3buW117zcF5n6uuawHQsw1Nx%2B6I6EMOsRIfPHZoxM9MtlIeDh5Xla8w%3D%3D';
    
    console.log('开始上传...');
    
    // 发送上传请求
    const response = await axios.post(uploadUrl, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    console.log('上传成功!');
    console.log('响应数据:', response.data);
  } catch (error) {
    console.error('上传失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
  }
}

uploadFile();