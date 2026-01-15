require('dotenv').config();
const SnpanService = require('../src/modules/snpan/services/snpanService');
const fs = require('fs');
const path = require('path');

async function uploadToExistingFolder() {
  console.log('=== 上传文件到现有文件夹测试 ===\n');
  
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
    
    // 查找现有文件夹
    console.log('4. 查找现有文件夹...');
    const fileList = await snpanService.getFileList('');
    
    if (fileList && Array.isArray(fileList)) {
      console.log('√ 成功获取文件列表');
      
      // 查找"网站上传"文件夹，如果没有则使用"测试"文件夹
      let targetFolder = fileList.find(item => item.c_name === '网站上传' && item.c_type === 'folder');
      
      if (!targetFolder) {
        targetFolder = fileList.find(item => item.c_name === '测试' && item.c_type === 'folder');
        if (targetFolder) {
          console.log('√ 找到"测试"文件夹，将在其中上传文件');
        } else {
          console.log('× 未找到合适的文件夹，将在根目录上传文件');
          targetFolder = { id: '', c_name: '根目录' };
        }
      } else {
        console.log('√ 找到"网站上传"文件夹');
      }
      
      console.log('   文件夹详情:');
      console.log(`     名称: ${targetFolder.c_name}`);
      console.log(`     ID: ${targetFolder.id || '根目录'}`);
      
      // 获取文件夹上传地址
      console.log('\n5. 获取文件夹上传地址...');
      const uploadUrl = await snpanService.getUploadUrl(targetFolder.id.toString());
      
      if (!uploadUrl) {
        console.error('× 无法获取文件夹上传地址');
        return;
      }
      
      console.log('√ 文件夹上传地址获取成功\n');
      
      // 准备上传音频文件
      console.log('6. 准备上传音频文件...');
      const audioDir = path.join(__dirname, '..', 'src', 'storage', 'uploads', 'audio');
      const audioFiles = fs.readdirSync(audioDir).filter(file => 
        file.endsWith('.mp3') || file.endsWith('.wav') || file.endsWith('.flac') || file.endsWith('.m4a')
      );
      
      console.log(`   找到 ${audioFiles.length} 个音频文件\n`);
      
      if (audioFiles.length === 0) {
        console.log('× 未找到音频文件');
        return;
      }
      
      // 上传前2个文件作为示例
      const filesToUpload = audioFiles.slice(3, 5); // 选择不同的文件避免重复
      console.log(`7. 开始上传 ${filesToUpload.length} 个音频文件到"${targetFolder.c_name}"文件夹...`);
      
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
      
      console.log('\n8. 验证上传结果...');
      const folderContents = await snpanService.getFileList(targetFolder.id.toString());
      
      if (folderContents && Array.isArray(folderContents)) {
        console.log(`√ "${targetFolder.c_name}"文件夹内容:`);
        folderContents.forEach((item, index) => {
          console.log(`     ${index + 1}. ${item.c_name} (${item.c_type})`);
        });
      } else {
        console.log('× 无法获取文件夹内容');
      }
    } else {
      console.log('× 获取文件列表失败');
    }
    
    console.log('\n=== 测试完成 ===');
    
  } catch (error) {
    console.error('执行过程中出现错误:', error.message);
    console.error('错误堆栈:', error.stack);
  }
}

// 执行测试
uploadToExistingFolder();