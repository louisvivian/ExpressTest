require('dotenv').config();
const { createExpressMiddleware } = require('../../../utils/middleware');
const importTaskManager = require('../../../utils/importTaskManager');

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
        
        // 查找 taskId（路径中 import 和 status 之间的部分）
        const importIndex = parts.indexOf('import');
        const statusIndex = parts.indexOf('status');
        
        if (importIndex !== -1 && statusIndex !== -1 && statusIndex > importIndex + 1) {
            taskId = parts[importIndex + 1];
        } else if (parts.length >= 2 && parts[parts.length - 1] === 'status') {
            // 如果路径是 /xxx/status，taskId 是倒数第二个部分
            taskId = parts[parts.length - 2];
        }
    }
    
    return taskId;
}

// 查询导入任务状态 - GET /api/import/:taskId/status
server.get('/', async (req, res) => {
    try {
        const taskId = extractTaskId(req);
        
        if (!taskId) {
            return res.status(400).json({ error: '无效的任务ID参数' });
        }
        
        const task = importTaskManager.getTask(taskId);

        if (!task) {
            return res.status(404).json({ error: '任务不存在' });
        }

        res.json({
            taskId: task.taskId,
            status: task.status,
            progress: task.progress,
            format: task.format,
            fileName: task.fileName,
            error: task.error,
            totalRecords: task.totalRecords,
            processedRecords: task.processedRecords,
            successRecords: task.successRecords,
            failedRecords: task.failedRecords,
            errors: task.errors
        });
    } catch (error) {
        console.error('查询导入任务状态失败:', error);
        res.status(500).json({ error: '查询导入任务状态失败', details: error.message });
    }
});

// ⭐️ 关键：导出一个 handler 函数给 Vercel
// 在 Vercel 中，请求会被路由到 /api/import/:taskId/status
module.exports = async (req, res) => {
    try {
        // 在 Vercel 中，动态路由参数可能在多个地方
        // 1. req.url 可能是完整的 /api/import/123/status 或只是 /status
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
            
            // 查找 taskId（路径中 import 和 status 之间的部分）
            const importIndex = parts.indexOf('import');
            const statusIndex = parts.indexOf('status');
            
            if (importIndex !== -1 && statusIndex !== -1 && statusIndex > importIndex + 1) {
                // 如果找到了 import 和 status，taskId 在它们之间
                taskId = parts[importIndex + 1];
            } else if (importIndex !== -1 && importIndex + 1 < parts.length) {
                // 如果只找到了 import，取它后面的第一个部分
                taskId = parts[importIndex + 1];
            } else if (parts.length >= 2 && parts[parts.length - 1] === 'status') {
                // 如果路径是 /xxx/status，taskId 是倒数第二个部分
                taskId = parts[parts.length - 2];
            }
        }
        
        // 方法3: 如果还是没有找到，尝试从完整的原始 URL 解析
        if (!taskId && req.url) {
            // 匹配 /api/import/{taskId}/status 模式
            const match = req.url.match(/\/api\/import\/([^\/]+)\/status/);
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
        
        // 设置响应头
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        
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

