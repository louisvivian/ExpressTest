require('dotenv').config();
const taskManager = require('../../../utils/exportTaskManager');
const fs = require('fs');

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
    if (!taskId) {
        // 尝试从多个可能的 URL 来源获取
        const possibleUrls = [
            req.url,
            req.path,
            req.originalUrl,
            req.headers && (req.headers['x-vercel-original-url'] || req.headers['x-invoke-path'])
        ].filter(Boolean);
        
        for (const originalUrl of possibleUrls) {
            if (!originalUrl) continue;
            
            // 使用正则表达式匹配完整路径（最可靠的方法）
            const match = originalUrl.match(/\/api\/export\/([^\/\?]+)\/download/);
            if (match && match[1]) {
                taskId = match[1];
                break;
            }
            
            // 备用方法：从路径中解析
            const path = originalUrl.split('?')[0];
            const parts = path.split('/').filter(part => part);
            
            // 查找 taskId（路径中 export 和 download 之间的部分）
            const exportIndex = parts.indexOf('export');
            const downloadIndex = parts.indexOf('download');
            
            if (exportIndex !== -1 && downloadIndex !== -1 && downloadIndex > exportIndex + 1) {
                taskId = parts[exportIndex + 1];
                break;
            } else if (parts.length >= 2 && parts[parts.length - 1] === 'download') {
                // 如果路径是 /xxx/download，taskId 是倒数第二个部分
                taskId = parts[parts.length - 2];
                break;
            }
        }
    }
    
    return taskId;
}

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
        const taskId = extractTaskId(req);
        
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

