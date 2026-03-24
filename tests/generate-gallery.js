/**
 * 生成懒加载图片画廊 - 优化版
 */

const {
  S3Client,
  ListObjectsV2Command
} = require('@aws-sdk/client-s3');

const fs = require('fs');

const config = {
  apiEndpoint: 'http://zj.9p.pw',  // S3 API 端点
  imageDomains: ['http://zj.9p.pw', 'http://tp.9p.pw'],  // 图片访问域名（轮询）
  accessKey: 'lplj2ZZVOPFArOOSdBot',
  secretKey: 'u3O6pLuO1vZ6TQDRzs6RzCZMRiyzMbZlbcodPtpK',
  region: 'auto'
};

const s3Client = new S3Client({
  endpoint: config.apiEndpoint,
  region: config.region,
  credentials: {
    accessKeyId: config.accessKey,
    secretAccessKey: config.secretKey
  },
  forcePathStyle: true,
  tls: false
});

async function generateGallery() {
  const bucketName = 'tkkk';
  const prefix = '2/';

  console.log('获取文件列表...');

  const listResult = await s3Client.send(
    new ListObjectsV2Command({ Bucket: bucketName, Prefix: prefix, MaxKeys: 100 })
  );

  const files = (listResult.Contents || [])
    .filter(obj => !obj.Key.endsWith('/') && obj.Key !== prefix);

  console.log(`找到 ${files.length} 个文件`);

  const images = files.map((f, i) => ({
    url: `${config.imageDomains[i % config.imageDomains.length]}/${bucketName}/${f.Key}`,
    name: f.Key.split('/').pop(),
    size: formatBytes(f.Size)
  }));

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OSS 图片画廊</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #111;
      color: #eee;
    }
    .header {
      position: sticky;
      top: 0;
      background: rgba(17,17,17,0.95);
      backdrop-filter: blur(10px);
      padding: 15px 20px;
      border-bottom: 1px solid #333;
      z-index: 100;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h1 { font-size: 18px; }
    .stats { font-size: 13px; color: #888; }
    .stats span { margin-left: 15px; }
    .stats strong { color: #fff; }
    .gallery {
      column-count: 6;
      column-gap: 10px;
      padding: 10px;
    }
    @media (max-width: 1400px) { .gallery { column-count: 5; } }
    @media (max-width: 1000px) { .gallery { column-count: 4; } }
    @media (max-width: 700px) { .gallery { column-count: 3; } }
    @media (max-width: 500px) { .gallery { column-count: 2; } }
    .item {
      break-inside: avoid;
      margin-bottom: 10px;
      position: relative;
      border-radius: 6px;
      overflow: hidden;
      background: #1a1a1a;
    }
    .item .img-wrap {
      min-height: 100px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #1e1e1e;
    }
    .item img {
      width: 100%;
      display: block;
      opacity: 0;
      transition: opacity 0.3s;
    }
    .item img.loaded {
      opacity: 1;
    }
    .item .loading-text {
      color: #444;
      font-size: 12px;
      padding: 30px;
    }
    .item .overlay {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 30px 8px 8px;
      background: linear-gradient(transparent, rgba(0,0,0,0.75));
      opacity: 0;
      transition: opacity 0.2s;
    }
    .item:hover .overlay { opacity: 1; }
    .item .name {
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .item .meta {
      font-size: 10px;
      color: #888;
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>OSS 图片画廊</h1>
    <div class="stats">
      <span>总数: <strong id="total">${images.length}</strong></span>
      <span>已加载: <strong id="loaded">0</strong></span>
      <span>失败: <strong id="failed">0</strong></span>
    </div>
  </div>
  <div class="gallery" id="gallery"></div>

  <script>
    const images = ${JSON.stringify(images)};
    let loaded = 0, failed = 0;
    const gallery = document.getElementById('gallery');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          loadImage(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '200px' });

    function loadImage(item) {
      const img = item.querySelector('img');
      const src = img.dataset.src;

      img.onload = () => {
        img.classList.add('loaded');
        item.querySelector('.loading-text').style.display = 'none';
        loaded++;
        updateStats();
      };

      img.onerror = () => {
        item.querySelector('.loading-text').textContent = '加载失败';
        item.querySelector('.loading-text').style.color = '#f44336';
        failed++;
        updateStats();
      };

      img.src = src;
    }

    function updateStats() {
      document.getElementById('loaded').textContent = loaded;
      document.getElementById('failed').textContent = failed;
    }

    images.forEach((img, i) => {
      const item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = \`
        <div class="img-wrap">
          <span class="loading-text">...</span>
          <img data-src="\${img.url}" alt="">
        </div>
        <div class="overlay">
          <div class="name">\${img.name}</div>
          <div class="meta">\${img.size}</div>
        </div>
      \`;
      gallery.appendChild(item);
      observer.observe(item);
    });
  </script>
</body>
</html>`;

  const outputPath = 'E:/D G/H D/WFWHD/oss-gallery.html';
  fs.writeFileSync(outputPath, html, 'utf8');
  console.log(`\n已生成: ${outputPath}`);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

generateGallery().catch(console.error);