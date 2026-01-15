require('dotenv').config();
const SnpanService = require('../src/modules/snpan/services/snpanService');
const fs = require('fs');
const path = require('path');

async function snpanFolderUploadTest() {
  console.log('=== SNPan网盘文件夹创建和上传测试 ===\n');
  
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
    
    // 创建"网站上传"文件夹
    console.log('4. 创建"网站上传"文件夹...');
    const folderName = '网站上传';
    const newFolder = await snpanService.addPath('', folderName);
    
    let folderId = null;
    if (newFolder) {
      console.log('√ 文件夹创建成功');
      console.log('   文件夹详情:');
      console.log(`     名称: ${newFolder.c_name}`);
      console.log(`     ID: ${newFolder.id}`);
      console.log(`     时间: ${newFolder.c_time}`);
      folderId = newFolder.id;
    } else {
      console.log('× 文件夹创建失败');
      console.log('   尝试查找是否已存在该文件夹...');
      
      // 查找是否已存在该文件夹
      const fileList = await snpanService.getFileList('');
      if (fileList && Array.isArray(fileList)) {
        const existingFolder = fileList.find(item => item.c_name === folderName && item.c_type === 'folder');
        if (existingFolder) {
          console.log('√ 找到已存在的文件夹');
          console.log(`   文件夹ID: ${existingFolder.id}`);
          folderId = existingFolder.id;
        } else {
          console.log('× 未找到已存在的文件夹');
          return;
        }
      }
    }
    
    if (!folderId) {
      console.log('× 无法获取文件夹ID，无法继续上传文件');
      return;
    }
    
    // 获取文件夹的上传地址
    console.log('\n5. 获取文件夹上传地址...');
    const uploadUrl = await snpanService.getUploadUrl(folderId.toString());
    
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
    
    // 上传前3个文件作为示例
    const filesToUpload = audioFiles.slice(0, 3);
    console.log(`7. 开始上传前 ${filesToUpload.length} 个音频文件到"网站上传"文件夹...`);
    
    for (let i = 0; i < filesToUpload.length; i++) {
      const fileName = filesToUpload[i];
      const filePath = path.join(audioDir, fileName);
      
      console.log(`\n   正在上传 (${i + 1}/${filesToUpload.length}): ${fileName}`);
      
      try {
        // 读取文件
        const fileBuffer = fs.readFileSync(filePath);
        
        // 创建表单数据
        const formData = new FormData();
        formData.append('file', new Blob([fileBuffer]), fileName);
        
        // 发送上传请求
        const response = await fetch(uploadUrl, {
          method: 'POST',
          body: formData
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log(`   √ ${fileName} 上传成功`);
          if (result.data) {
            console.log(`     文件链接: ${result.data}`);
          }
        } else {
          console.log(`   × ${fileName} 上传失败，状态码: ${response.status}`);
        }
      } catch (error) {
        console.log(`   × ${fileName} 上传出错: ${error.message}`);
      }
    }
    
    console.log('\n8. 验证上传结果...');
    const folderContents = await snpanService.getFileList(folderId.toString());
    
    if (folderContents && Array.isArray(folderContents)) {
      console.log(`√ "网站上传"文件夹中现有 ${folderContents.length} 个文件:`);
      folderContents.forEach((item, index) => {
        console.log(`     ${index + 1}. ${item.c_name} (${item.c_type})`);
      });
    } else {
      console.log('× 无法获取文件夹内容');
    }
    
    console.log('\n=== 测试完成 ===');
    
  } catch (error) {
    console.error('执行过程中出现错误:', error.message);
    console.error('错误堆栈:', error.stack);
  }
}

// 执行测试
snpanFolderUploadTest();