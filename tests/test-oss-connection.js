/**
 * OSS/S3 连接测试脚本
 * 测试 S3v4 兼容的对象存储服务
 */

const {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadBucketCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// 配置信息
const config = {
  endpoint: 'http://zj.9p.pw',
  accessKey: 'lplj2ZZVOPFArOOSdBot',
  secretKey: 'u3O6pLuO1vZ6TQDRzs6RzCZMRiyzMbZlbcodPtpK',
  region: 'auto',
  api: 's3v4'
};

// 创建 S3 客户端
const s3Client = new S3Client({
  endpoint: config.endpoint,
  region: config.region,
  credentials: {
    accessKeyId: config.accessKey,
    secretAccessKey: config.secretKey
  },
  forcePathStyle: true, // 使用路径样式（兼容非AWS S3服务）
  tls: false // HTTP
});

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function generateDirectLink() {
  const bucketName = 'tkkk';
  const prefix = '2/';

  console.log('=== 生成OSS直链 ===\n');

  try {
    // 列出 tkkk/2 下的文件
    console.log(`列出 Bucket [${bucketName}] 路径 [${prefix}] 下的对象...`);
    const listResult = await s3Client.send(
      new ListObjectsV2Command({ Bucket: bucketName, Prefix: prefix, MaxKeys: 10 })
    );

    if (!listResult.Contents || listResult.Contents.length === 0) {
      console.log('没有找到文件');
      return;
    }

    // 过滤掉目录本身，只取文件
    const files = listResult.Contents.filter(obj => !obj.Key.endsWith('/'));
    console.log(`找到 ${files.length} 个文件:\n`);

    files.forEach((obj, i) => {
      console.log(`  ${i + 1}. ${obj.Key} (${formatBytes(obj.Size)})`);
    });

    // 取第一个文件生成直链
    const targetFile = files[0];
    console.log(`\n为文件生成直链: ${targetFile.Key}`);

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: targetFile.Key
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600
    });

    console.log(`\n√ 直链生成成功!`);
    console.log(`  文件大小: ${formatBytes(targetFile.Size)}`);
    console.log(`  有效期: 1小时\n`);
    console.log(`直链地址:\n${signedUrl}`);

    // 保存到txt文件
    const outputContent = `OSS直链信息
========================================
生成时间: ${new Date().toLocaleString('zh-CN')}
有效期: 1小时

文件信息:
  Bucket: ${bucketName}
  Key: ${targetFile.Key}
  大小: ${formatBytes(targetFile.Size)}

直链地址:
${signedUrl}
`;
    const fs = require('fs');
    const outputPath = 'E:/D G/H D/WFWHD/oss-direct-link.txt';
    fs.writeFileSync(outputPath, outputContent, 'utf8');
    console.log(`\n已保存到: ${outputPath}`);

  } catch (error) {
    console.error('× 操作失败:', error.message);
  }
}

// 执行
generateDirectLink();