const express = require('express');
const router = express.Router();
const SnpanService = require('../services/snpanService');
const config = require('../../../shared/config/config');

// 初始化SDK实例（保持与现有环境变量一致）
const snpanService = new SnpanService(
  process.env.SNPAN_ACCOUNT_AID || 'your-snpan-account-aid-here',
  process.env.SNPAN_ACCOUNT_KEY || 'your-snpan-account-key-here',
  process.env.SNPAN_UPLOAD_AID || 'your-snpan-upload-aid-here',
  process.env.SNPAN_UPLOAD_KEY || 'your-snpan-upload-key-here'
);

// 简单测试端点（保留）
router.get('/test', async (req, res) => {
  try {
    // 等待初始化完成
    await new Promise(resolve => setTimeout(resolve, 2000));
    res.json({
      success: true,
      message: 'SNPan SDK测试',
      accountInitialized: !!snpanService.accountAuthcode,
      uploadInitialized: !!snpanService.uploadAuthcode,
      accountAuthcode: snpanService.accountAuthcode ? '已获取' : '未获取',
      uploadAuthcode: snpanService.uploadAuthcode ? '已获取' : '未获取'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取上传地址（回退为简单返回：字符串直传地址）
 */
router.get('/upload-url', async (req, res) => {
  try {
    const { fid } = req.query;
    const url = await snpanService.getUploadUrl(fid);

    if (!url) {
      return res.status(500).json({
        success: false,
        error: '获取上传地址失败'
      });
    }

    return res.json({
      success: true,
      data: { uploadUrl: url },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('获取上传地址错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
      message: error.message
    });
  }
});

// 获取文件列表
router.get('/files', async (req, res) => {
  try {
    const { fid, type, sortname, sorttype, page, pagesize } = req.query;
    const fileList = await snpanService.getFileList(
      fid, 
      type ? parseInt(type) : 1, 
      sortname, 
      sorttype, 
      page ? parseInt(page) : 1, 
      pagesize ? parseInt(pagesize) : 20
    );
    
    if (fileList) {
      res.json({
        success: true,
        data: fileList
      });
    } else {
      res.status(500).json({
        success: false,
        error: '获取文件列表失败'
      });
    }
  } catch (error) {
    console.error('获取文件列表错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
      message: error.message
    });
  }
});

// 新增文件夹
router.post('/folder', async (req, res) => {
  try {
    const { fid, name } = req.body;
    const result = await snpanService.addPath(fid, name);
    
    if (result) {
      res.json({
        success: true,
        data: result
      });
    } else {
      res.status(500).json({
        success: false,
        error: '新增文件夹失败'
      });
    }
  } catch (error) {
    console.error('新增文件夹错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
      message: error.message
    });
  }
});

// 编辑文件信息
router.put('/file/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, key } = req.body;
    const result = await snpanService.editPath(id, name, key);
    
    if (result) {
      res.json({
        success: true,
        data: result
      });
    } else {
      res.status(500).json({
        success: false,
        error: '编辑文件失败'
      });
    }
  } catch (error) {
    console.error('编辑文件错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
      message: error.message
    });
  }
});

// 转移文件/文件夹
router.post('/transfer/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { fid } = req.body;
    const result = await snpanService.transferPath(id, fid);
    
    if (result) {
      res.json({
        success: true,
        data: result
      });
    } else {
      res.status(500).json({
        success: false,
        error: '转移文件失败'
      });
    }
  } catch (error) {
    console.error('转移文件错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
      message: error.message
    });
  }
});

// 删除文件/文件夹
router.delete('/file/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await snpanService.delPath(id);
    
    if (result) {
      res.json({
        success: true,
        data: result
      });
    } else {
      res.status(500).json({
        success: false,
        error: '删除文件失败'
      });
    }
  } catch (error) {
    console.error('删除文件错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
      message: error.message
    });
  }
});

// 获取鉴权链接
router.get('/sign', async (req, res) => {
  try {
    const { file } = req.query;
    if (!file) {
      return res.status(400).json({
        success: false,
        error: '缺少file参数'
      });
    }
    
    const signUrl = await snpanService.getSign(file);
    
    if (signUrl) {
      res.json({
        success: true,
        data: signUrl
      });
    } else {
      res.status(500).json({
        success: false,
        error: '获取鉴权链接失败'
      });
    }
  } catch (error) {
    console.error('获取鉴权链接错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
      message: error.message
    });
  }
});

module.exports = router;