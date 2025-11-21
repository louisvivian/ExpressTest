require('dotenv').config();
const { createExpressMiddleware } = require('../../../utils/middleware');
const taskManager = require('../../../utils/exportTaskManager');
const fs = require('fs');

// 创建 Express 服务器并配置中间件
const server = createExpressMiddleware();

// 提取 taskId 的辅助函数
function extractTaskId(req) {
    let taskId = null;
    
    // 方法1: 从 req.query.taskId 获取（如果 Vercel 自动解析或我们手动设置）
    if (req.query && req.query.taskId) {
        taskId = req.query.taskId;
    }
    
    // 方法2: 从 Express 路由参数获取
    if (!taskId && req.params && req.params.taskId) {
        taskId = req.params.taskId;
    }
    
    // 方法3: 从 URL 路径中解析（备用方法）
    if (!taskId && req.url) {
        const path = req.url.split('?')[0];
        const parts = path.split('/').filter(part => part);
        
        // 查找 taskId（路径中 export 和 download 之间的部分）
        const exportIndex = parts.indexOf('export');
        const downloadIndex = parts.indexOf('download');
        
        if (exportIndex !== -1 && downloadIndex !== -1 && downloadIndex > exportIndex + 1) {
            taskId = parts[exportIndex + 1];
        } else if (parts.length >= 2 && parts[parts.length - 1] === 'download') {
            // 如果路径是 /xxx/download，taskId 是倒数第二个部分
            taskId = parts[parts.length - 2];
        }
    }
    
    return taskId;
}

// 下载导出文件 - GET /api/export/:taskId/download
server.get('/', async (req, res) => {
    try {
        const taskId = extractTaskId(req);
        
        if (!taskId) {
            return res.status(400).json({ error: '无效的任务ID参数' });
        }
        
        const task = taskManager.getTask(taskId);

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
        if (!res.headersSent) {
            res.status(500).json({ error: '下载文件失败', details: error.message });
        }
    }
});

// ⭐️ 关键：导出一个 handler 函数给 Vercel
// 在 Vercel 中，请求会被路由到 /api/export/:taskId/download
module.exports = async (req, res) => {
    try {
        // 在 Vercel 中，动态路由参数可能在多个地方
        // 1. req.url 可能是完整的 /api/export/123/download 或只是 /download
        // 2. Vercel 可能会将动态路由参数放在 req.query 中
        // 3. 也可能在 req.path 中
        
        let taskId = null;
        
        // 方法1: 检查 req.query（Vercel 可能会自动解析动态路由参数）
        if (req.query && req.query.taskId) {
            taskId = req.query.taskId;
        }
        
        // 方法2: 从完整的 URL 路径中提取
        if (!taskId) {
            const originalUrl = req.url || req.path || '';
            const [path] = originalUrl.split('?');
            const parts = path.split('/').filter(part => part);
            
            // 查找 taskId（路径中 export 和 download 之间的部分）
            const exportIndex = parts.indexOf('export');
            const downloadIndex = parts.indexOf('download');
            
            if (exportIndex !== -1 && downloadIndex !== -1 && downloadIndex > exportIndex + 1) {
                // 如果找到了 export 和 download，taskId 在它们之间
                taskId = parts[exportIndex + 1];
            } else if (exportIndex !== -1 && exportIndex + 1 < parts.length) {
                // 如果只找到了 export，取它后面的第一个部分
                taskId = parts[exportIndex + 1];
            } else if (parts.length >= 2 && parts[parts.length - 1] === 'download') {
                // 如果路径是 /xxx/download，taskId 是倒数第二个部分
                taskId = parts[parts.length - 2];
            }
        }
        
        // 方法3: 如果还是没有找到，尝试从完整的原始 URL 解析
        if (!taskId && req.url) {
            // 匹配 /api/export/{taskId}/download 模式
            const match = req.url.match(/\/api\/export\/([^\/]+)\/download/);
            if (match && match[1]) {
                taskId = match[1];
            }
        }
        
        // 如果找到了 taskId，将其设置为查询参数
        if (taskId) {
            req.query = req.query || {};
            req.query.taskId = taskId;
        }
        
        // 修改 req.url 为 / 以便 Express 路由能正确匹配
        req.url = '/';
        
        await server(req, res);
    } catch (error) {
        console.error('未处理的错误:', error);
        console.error('请求 URL:', req.url);
        console.error('请求路径:', req.path);
        console.error('查询参数:', req.query);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: '服务器内部错误', 
                details: error.message 
            });
        }
    }
};

