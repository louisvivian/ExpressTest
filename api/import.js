require('dotenv').config();
const prisma = require('../prisma/client');
const express = require('express');
const path = require('path');
const fs = require('fs');
const { importUsers, countRecords } = require('../utils/importHandlers');
const importTaskManager = require('../utils/importTaskManager');
const { createUploadMiddleware } = require('../utils/uploadConfig');
const { createVercelHandler } = require('../utils/vercelHandler');

// 创建 Express 服务器（不包含 json/urlencoded 中间件，避免与 multer 冲突）
const server = express();

// 配置multer用于文件上传
const upload = createUploadMiddleware();

// 上传文件并创建导入任务 - POST /api/import
server.post('/', upload.single('file'), async (req, res) => {
    try {
        // 处理 multer 错误
        if (req.fileValidationError) {
            return res.status(400).json({ error: req.fileValidationError });
        }

        if (!req.file) {
            return res.status(400).json({ error: '请选择要上传的文件' });
        }

        // 确保文件对象完整
        if (!req.file.path || !req.file.originalname) {
            return res.status(400).json({ error: '文件上传不完整，请重试' });
        }

        const filePath = req.file.path;
        const originalName = req.file.originalname || 'unknown';
        const ext = path.extname(originalName).toLowerCase();

        // 根据文件扩展名确定格式
        let format = 'json';
        if (ext === '.xlsx' || ext === '.xls') {
            format = 'xlsx';
        } else if (ext === '.csv') {
            format = 'csv';
        } else if (ext === '.json') {
            format = 'json';
        } else {
            // 删除上传的文件
            fs.unlinkSync(filePath);
            return res.status(400).json({ error: '不支持的文件格式，仅支持 JSON、CSV、Excel 格式' });
        }

        // 快速统计数据条数
        let recordCount = 0;
        try {
            recordCount = await countRecords(filePath, format);
            console.log(`文件统计完成，共 ${recordCount} 条记录`);
        } catch (error) {
            console.error('统计记录数失败:', error);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            return res.status(400).json({ 
                error: `文件解析失败: ${error.message}`,
                details: error.stack 
            });
        }

        // 所有导入都使用异步方式（无论数据量多少）
        // 创建导入任务
        const taskId = importTaskManager.createTask(format, originalName);
        console.log(`创建导入任务: ${taskId}, 记录数: ${recordCount}`);

        // 异步执行导入任务
        importUsers(prisma, filePath, format, taskId)
            .then(() => {
                // 导入完成后删除上传的文件
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            })
            .catch(error => {
                console.error('导入任务失败:', error);
                // 导入失败也删除文件
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });

        // 立即返回任务ID，不等待导入完成
        res.json({
            taskId,
            message: '导入任务已创建（异步导入）',
            status: 'pending',
            format: format,
            recordCount: recordCount
        });
    } catch (error) {
        console.error('创建导入任务失败:', error);
        console.error('错误详情:', error.stack);
        // 如果文件已上传，删除它
        if (req.file && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkError) {
                console.error('删除文件失败:', unlinkError);
            }
        }
        const { isDevelopment } = require('../utils/envConfig');
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ 
            error: error.message || '创建导入任务失败', 
            details: error.message,
            stack: isDevelopment() ? error.stack : undefined
        });
    }
});

// ⭐️ 关键：导出一个 handler 函数给 Vercel
// 在 Vercel 中，请求会被路由到 /api/import，Express 会处理这个请求
module.exports = createVercelHandler(server, '/api/import');

