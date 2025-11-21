require('dotenv').config();
const importTaskManager = require('../../../utils/importTaskManager');

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
            const match = originalUrl.match(/\/api\/import\/([^\/\?]+)\/status/);
            if (match && match[1]) {
                taskId = match[1];
                break;
            }
            
            // 备用方法：从路径中解析
            const path = originalUrl.split('?')[0];
            const parts = path.split('/').filter(part => part);
            
            // 查找 taskId（路径中 import 和 status 之间的部分）
            const importIndex = parts.indexOf('import');
            const statusIndex = parts.indexOf('status');
            
            if (importIndex !== -1 && statusIndex !== -1 && statusIndex > importIndex + 1) {
                taskId = parts[importIndex + 1];
                break;
            } else if (parts.length >= 2 && parts[parts.length - 1] === 'status') {
                // 如果路径是 /xxx/status，taskId 是倒数第二个部分
                taskId = parts[parts.length - 2];
                break;
            }
        }
    }
    
    return taskId;
}

// ⭐️ 关键：导出一个 handler 函数给 Vercel
// 在 Vercel 中，请求会被路由到 /api/import/:taskId/status
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
            console.error('请求头:', JSON.stringify(req.headers, null, 2));
            
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
        
        // 查询任务状态
        const task = importTaskManager.getTask(taskId);

        if (!task) {
            return res.status(404).json({ error: '任务不存在' });
        }

        // 设置响应头，禁用缓存（任务状态是实时变化的）
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        // 返回任务状态
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
        console.error('错误堆栈:', error.stack);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: '查询导入任务状态失败', 
                details: error.message 
            });
        }
    }
};

