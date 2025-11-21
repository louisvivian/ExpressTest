require('dotenv').config();
const importTaskManager = require('../../../utils/importTaskManager');
const { extractTaskId } = require('../../../utils/routeParams');

// ⭐️ 关键：导出一个 handler 函数给 Vercel
// 在 Vercel 中，请求会被路由到 /api/import/:taskId/status
// 直接处理请求，不通过 Express 路由，以避免嵌套动态路由的问题
module.exports = async (req, res) => {
    try {
        // 只处理 GET 请求
        if (req.method !== 'GET') {
            return res.status(405).json({ error: '方法不允许' });
        }
        
        // 在 Vercel 中，动态路由参数可能通过多种方式传递
        // 1. req.query.taskId (Vercel 会将 [taskId] 映射到 query.taskId)
        // 2. 从 URL 路径中解析
        let taskId = null;
        
        // 方法1: 从 Vercel 的查询参数获取（Vercel 会将动态路由参数放在 query 中）
        if (req.query && req.query.taskId) {
            taskId = req.query.taskId;
        }
        
        // 方法2: 从 URL 路径中提取
        if (!taskId) {
            taskId = extractTaskId(req, 'import', 'status');
        }
        
        // 方法3: 如果还是没有，尝试从 req.url 直接解析
        if (!taskId && req.url) {
            // 匹配 /api/import/{taskId}/status 格式
            const match = req.url.match(/\/api\/import\/([^\/\?]+)\/status/);
            if (match && match[1]) {
                taskId = match[1];
            }
        }
        
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

