/**
 * 生成瀑布流画廊 - 真正的往下追加
 */

const {
  S3Client,
  ListObjectsV2Command
} = require('@aws-sdk/client-s3');

const fs = require('fs');

const config = {
  apiEndpoint: 'http://zj.9p.pw',
  imageDomains: ['http://zj.9p.pw', 'http://zj.wwww.love'],
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
    new ListObjectsV2Command({ Bucket: bucketName, Prefix: prefix, MaxKeys: 500 })
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
      background: #0a0a0a;
      color: #eee;
    }
    .header {
      position: sticky;
      top: 0;
      background: rgba(10,10,10,0.95);
      backdrop-filter: blur(10px);
      padding: 12px 20px;
      border-bottom: 1px solid #222;
      z-index: 100;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h1 { font-size: 16px; font-weight: 500; }
    .stats { font-size: 12px; color: #666; }
    .stats span { margin-left: 12px; }
    .stats strong { color: #aaa; }

    .gallery {
      position: relative;
      padding: 8px;
    }

    .column {
      position: absolute;
      top: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .item {
      position: relative;
      border-radius: 4px;
      overflow: hidden;
      background: #151515;
      opacity: 0;
      transform: translateY(20px);
      animation: itemIn 0.4s ease forwards;
    }
    @keyframes itemIn {
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .item img {
      width: 100%;
      display: block;
      opacity: 0;
      filter: blur(8px);
      transition: opacity 0.5s ease, filter 0.5s ease;
    }
    .item img.loaded {
      opacity: 1;
      filter: blur(0);
    }

    .item .placeholder {
      min-height: 80px;
      background: linear-gradient(135deg, #1a1a1a, #222, #1a1a1a);
      background-size: 200% 200%;
      animation: pulse 1.5s ease infinite;
    }
    @keyframes pulse {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }

    .item .overlay {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 20px 6px 6px;
      background: linear-gradient(transparent, rgba(0,0,0,0.8));
      opacity: 0;
      transition: opacity 0.2s;
    }
    .item:hover .overlay { opacity: 1; }
    .item .name {
      font-size: 9px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .item .meta {
      font-size: 8px;
      color: #666;
      margin-top: 1px;
    }
    .item .domain {
      position: absolute;
      top: 6px;
      right: 6px;
      background: rgba(0,0,0,0.6);
      padding: 2px 5px;
      border-radius: 3px;
      font-size: 8px;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .item:hover .domain { opacity: 1; }

    .loader {
      text-align: center;
      padding: 30px;
      color: #444;
      font-size: 12px;
    }
    .loader .spinner {
      width: 20px;
      height: 20px;
      border: 2px solid #222;
      border-top-color: #555;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 8px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>OSS 图片画廊</h1>
    <div class="stats">
      <span>总数: <strong id="total">${images.length}</strong></span>
      <span>显示: <strong id="shown">0</strong></span>
      <span>加载: <strong id="loaded">0</strong></span>
    </div>
  </div>
  <div class="gallery" id="gallery"></div>
  <div class="loader" id="loader">
    <div class="spinner"></div>
    <div>滚动加载更多</div>
  </div>

  <script>
    const allImages = ${JSON.stringify(images)};
    const BATCH_SIZE = 12;
    const GAP = 8;
    let currentIndex = 0;
    let loadedCount = 0;
    const gallery = document.getElementById('gallery');
    const loader = document.getElementById('loader');

    // 列信息
    let columnCount = 6;
    let columns = [];
    let columnHeights = [];

    function initColumns() {
      const width = window.innerWidth;
      if (width > 1400) columnCount = 6;
      else if (width > 1000) columnCount = 5;
      else if (width > 700) columnCount = 4;
      else if (width > 500) columnCount = 3;
      else columnCount = 2;

      const containerWidth = gallery.clientWidth - GAP * 2;
      const colWidth = (containerWidth - GAP * (columnCount - 1)) / columnCount;

      // 清空重建
      gallery.innerHTML = '';
      columns = [];
      columnHeights = [];

      for (let i = 0; i < columnCount; i++) {
        const col = document.createElement('div');
        col.className = 'column';
        col.style.width = colWidth + 'px';
        col.style.left = (GAP + i * (colWidth + GAP)) + 'px';
        gallery.appendChild(col);
        columns.push(col);
        columnHeights.push(0);
      }
    }

    function findShortestColumn() {
      let minIdx = 0;
      let minH = columnHeights[0];
      for (let i = 1; i < columnHeights.length; i++) {
        if (columnHeights[i] < minH) {
          minH = columnHeights[i];
          minIdx = i;
        }
      }
      return minIdx;
    }

    const imgObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          loadImage(entry.target);
          imgObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '100px' });

    const scrollObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && currentIndex < allImages.length) {
          loadBatch();
        }
      });
    }, { rootMargin: '200px' });

    function loadImage(item) {
      const img = item.querySelector('img');
      const src = img.dataset.src;

      img.onload = () => {
        img.classList.add('loaded');
        item.querySelector('.placeholder').style.display = 'none';
        loadedCount++;
        updateStats();
      };

      img.onerror = () => {
        item.querySelector('.placeholder').innerHTML = '<div style="padding:20px;color:#444;text-align:center;">失败</div>';
      };

      img.src = src;
    }

    function loadBatch() {
      const end = Math.min(currentIndex + BATCH_SIZE, allImages.length);
      const domainNames = ['zj.9p.pw', 'zj.wwww.love'];

      for (let i = currentIndex; i < end; i++) {
        const imgData = allImages[i];
        const domainIdx = i % 2;
        const colIdx = findShortestColumn();

        const item = document.createElement('div');
        item.className = 'item';
        item.style.animationDelay = \`\${(i - currentIndex) * 30}ms\`;

        item.innerHTML = \`
          <div class="placeholder"></div>
          <img data-src="\${imgData.url}" alt="">
          <div class="overlay">
            <div class="name">\${imgData.name}</div>
            <div class="meta">\${imgData.size}</div>
          </div>
          <div class="domain">\${domainNames[domainIdx]}</div>
        \`;

        columns[colIdx].appendChild(item);
        imgObserver.observe(item);
      }

      currentIndex = end;
      updateStats();

      // 更新列高度
      setTimeout(() => {
        columns.forEach((col, i) => {
          columnHeights[i] = col.offsetHeight;
        });
        const maxH = Math.max(...columnHeights);
        gallery.style.height = (maxH + GAP) + 'px';
      }, 100);

      if (currentIndex >= allImages.length) {
        loader.innerHTML = '<div style="color:#555;">已全部加载</div>';
      }
    }

    function updateStats() {
      document.getElementById('shown').textContent = currentIndex;
      document.getElementById('loaded').textContent = loadedCount;
    }

    // 初始化
    initColumns();
    loadBatch();
    scrollObserver.observe(loader);

    // 窗口resize时重新布局
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        currentIndex = 0;
        loadedCount = 0;
        initColumns();
        loadBatch();
      }, 200);
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