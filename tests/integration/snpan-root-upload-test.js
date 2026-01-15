require('dotenv').config();
const SnpanService = require('../src/modules/snpan/services/snpanService');
const fs = require('fs');
const path = require('path');

async function snpanRootUploadTest() {
  console.log('=== SNPan网盘根目录音频文件上传测试 ===\n');
  
  try {
    // 初始化SNPan服务
    console.log('1. 初始化SNPan服务...');
    const snpanService = new SnpanService(
      process.env.SNPAN_ACCOUNT_AID,
      process.env.SNPAN_ACCOUNT_KEY,
      process.env.SNPAN_UPLOAD_AID,
      process.env.SNPAN_UPLOAD_KEY
    );
    
    // 等待认证初始化完成
    console.log('2. 等待认证初始化完成...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 检查认证状态
    console.log('3. 检查认证状态:');
    console.log(`   账户认证: ${snpanService.accountAuthcode ? '成功' : '失败'}`);
    console.log(`   上传认证: ${snpanService.uploadAuthcode ? '成功' : '失败'}\n`);
    
    if (!snpanService.accountAuthcode) {
      console.error('× 账户认证失败，无法继续');
      return;
    }
    
    // 获取根目录上传地址
    console.log('4. 获取根目录上传地址...');
    const uploadUrl = await snpanService.getUploadUrl('');
    
    if (!uploadUrl) {
      console.error('× 无法获取根目录上传地址');
      return;
    }
    
    console.log('√ 根目录上传地址获取成功\n');
    
    // 准备上传音频文件
    console.log('5. 准备上传音频文件...');
    const audioDir = path.join(__dirname, '..', 'src', 'storage', 'uploads', 'audio');
    const audioFiles = fs.readdirSync(audioDir).filter(file => 
      file.endsWith('.mp3') || file.endsWith('.wav') || file.endsWith('.flac') || file.endsWith('.m4a')
    );
    
    console.log(`   找到 ${audioFiles.length} 个音频文件\n`);
    
    if (audioFiles.length === 0) {
      console.log('× 未找到音频文件');
      return;
    }
    
    // 上传前3个文件作为示例
    const filesToUpload = audioFiles.slice(0, 3);
    console.log(`6. 开始上传前 ${filesToUpload.length} 个音频文件到根目录...`);
    
    for (let i = 0; i < filesToUpload.length; i++) {
      const fileName = filesToUpload[i];
      const filePath = path.join(audioDir, fileName);
      
      console.log(`\n   正在上传 (${i + 1}/${filesToUpload.length}): ${fileName}`);
      
      try {
        // 使用Node.js的https模块上传文件，避免FormData兼容性问题
        const https = require('https');
        const FormData = require('form-data');
        
        const form = new FormData();
        form.append('file', fs.createReadStream(filePath));
        
        // 创建上传请求
        const url = new URL(uploadUrl);
        const options = {
          hostname: url.hostname,
          port: 443,
          path: url.pathname + url.search,
          method: 'POST',
          headers: form.getHeaders()
        };
        
        // 发送请求
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              if (result.code === 200) {
                console.log(`   √ ${fileName} 上传成功`);
                if (result.data) {
                  console.log(`     文件链接: ${result.data}`);
                }
              } else {
                console.log(`   × ${fileName} 上传失败: ${result.msg}`);
              }
            } catch (parseError) {
              console.log(`   × ${fileName} 响应解析失败: ${parseError.message}`);
            }
          });
        });
        
        req.on('error', (error) => {
          console.log(`   × ${fileName} 上传出错: ${error.message}`);
        });
        
        // 将表单数据写入请求
        form.pipe(req);
        
        // 等待上传完成
        await new Promise(resolve => {
          req.on('close', resolve);
        });
        
      } catch (error) {
        console.log(`   × ${fileName} 上传出错: ${error.message}`);
      }
    }
    
    console.log('\n7. 验证上传结果...');
    const rootContents = await snpanService.getFileList('');
    
    if (rootContents && Array.isArray(rootContents)) {
      console.log(`\n√ 根目录文件列表:`);
      rootContents.forEach((item, index) => {
        console.log(`     ${index + 1}. ${item.c_name} (${item.c_type})`);
      });
    } else {
      console.log('× 无法获取根目录内容');
    }
    
    console.log('\n=== 测试完成 ===');
    
  } catch (error) {
    console.error('执行过程中出现错误:', error.message);
    console.error('错误堆栈:', error.stack);
  }
}

// 执行测试
snpanRootUploadTest();