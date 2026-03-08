/**
 * TTS 路由统一入口
 * 聚合所有 TTS 相关路由
 */

const express = require('express');
const router = express.Router();

// 导入子路由
const voicesRouter = require('./voices');
const healthRouter = require('./health');
const unifiedTtsRoutes = require('./unifiedTtsRoutes');

// 音色管理路由
router.use('/voices', voicesRouter);

// 健康检查路由
router.use('/health', healthRouter);

// 统一 TTS API（合成等操作）
router.use('/synthesize', unifiedTtsRoutes);

// 兼容旧路由 - 音色模型管理
router.use('/models', require('./voiceRoutes'));

// 兼容旧路由 - 统一TTS（保持兼容）
router.use('/unified', unifiedTtsRoutes);

module.exports = router;
