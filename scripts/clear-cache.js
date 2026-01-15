#!/usr/bin/env node

/**
 * 清除TTS缓存脚本
 */

const fs = require('fs').promises;
const path = require('path');

const CACHE_DIR = path.join(__dirname, 'src', 'storage', 'cache', 'audio_cache');

async function clearCache() {
    try {
        console.log('🧹 清除TTS缓存...');

        // 检查缓存目录是否存在
        try {
            await fs.access(CACHE_DIR);
            console.log(`📁 缓存目录: ${CACHE_DIR}`);

            // 读取目录内容
            const files = await fs.readdir(CACHE_DIR);

            if (files.length === 0) {
                console.log('✅ 缓存目录已经是空的');
                return;
            }

            console.log(`📄 发现 ${files.length} 个缓存文件，正在删除...`);

            // 删除所有文件
            for (const file of files) {
                const filePath = path.join(CACHE_DIR, file);
                await fs.unlink(filePath);
                console.log(`  🗑️  已删除: ${file}`);
            }

            console.log('✅ 缓存清理完成！');

        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('✅ 缓存目录不存在，无需清理');
            } else {
                throw error;
            }
        }

    } catch (error) {
        console.error('❌ 清理缓存失败:', error.message);
        process.exit(1);
    }
}

clearCache();