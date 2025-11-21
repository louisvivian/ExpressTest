require('dotenv').config();
const taskManager = require('../../../utils/exportTaskManager');
const fs = require('fs');
const { extractTaskId } = require('../../../utils/routeParams');

// ⭐️ 关键：导出一个 handler 函数给 Vercel
// 在 Vercel 中，请求会被路由到 /api/export/:taskId/download
// 直接处理请求，不通过 Express 路由，以避免嵌套动态路由的问题
module.exports = async (req, res) => {
    try {
        // 只处理 GET 请求
        if (req.method !== 'GET') {
            return res.status(405).json({ error: '方法不允许' });
        }
        
        // 提取 taskId
        const taskId = extractTaskId(req, 'export', 'download');
        
        if (!taskId) {
            // 记录调试信息
            console.error('无法提取 taskId');
            console.error('请求方法:', req.method);
            console.error('请求 URL:', req.url);
            console.error('请求路径:', req.path);
            console.error('原始 URL:', req.originalUrl);
            console.error('查询参数:', req.query);
            
            return res.status(400).json({ 
                error: '无效的任务ID参数',
                debug: {
                    method: req.method,
                    url: req.url,
                    path: req.path,
                    originalUrl: req.originalUrl,
                    query: req.query
                }
            });
        }
        
        // 查询任务
        const task = await taskManager.getTask(taskId);

        if (!task) {
            return res.status(404).json({ error: '任务不存在' });
        }

        if (task.status !== 'completed') {
            return res.status(400).json({ 
                error: '任务尚未完成', 
                status: task.status,
                progress: task.progress 
            });
        }

        if (!task.filePath || !fs.existsSync(task.filePath)) {
            return res.status(404).json({ error: '导出文件不存在' });
        }

        // 设置下载响应头
        const mimeTypes = {
            'json': 'application/json',
            'excel': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'csv': 'text/csv'
        };

        const mimeType = mimeTypes[task.format] || 'application/octet-stream';
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(task.fileName)}"`);

        // 发送文件
        const fileStream = fs.createReadStream(task.filePath);
        fileStream.pipe(res);

        fileStream.on('error', (error) => {
            console.error('读取文件失败:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: '读取文件失败' });
            }
        });
    } catch (error) {
        console.error('下载文件失败:', error);
        console.error('错误堆栈:', error.stack);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: '下载文件失败', 
                details: error.message 
            });
        }
    }
};

