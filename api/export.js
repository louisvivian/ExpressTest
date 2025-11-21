require('dotenv').config();
const prisma = require('../prisma/client');
const { createExpressMiddleware } = require('../utils/middleware');
const { exportUsers } = require('../utils/exportHandlers');
const taskManager = require('../utils/exportTaskManager');
const fs = require('fs');

// 创建 Express 服务器并配置中间件
const server = createExpressMiddleware();

// 创建导出任务 - POST /api/export
server.post('/', async (req, res) => {
    try {
        const { format = 'json', name: searchName } = req.body;
        
        // 验证格式
        const validFormats = ['json', 'excel', 'xlsx', 'csv'];
        if (!validFormats.includes(format.toLowerCase())) {
            return res.status(400).json({ error: '不支持的导出格式', validFormats });
        }

        // 创建任务
        const taskId = taskManager.createTask(format.toLowerCase(), searchName);
        
        // 异步执行导出任务
        exportUsers(prisma, format.toLowerCase(), searchName, taskId)
            .catch(error => {
                console.error('导出任务失败:', error);
            });

        res.json({
            taskId,
            message: '导出任务已创建',
            status: 'pending'
        });
    } catch (error) {
        console.error('创建导出任务失败:', error);
        res.status(500).json({ error: '创建导出任务失败', details: error.message });
    }
});

// ⭐️ 关键：导出一个 handler 函数给 Vercel
// 在 Vercel 中，请求会被路由到 /api/export，Express 会处理这个请求
module.exports = async (req, res) => {
    try {
        // 在 Vercel 中，req.url 可能是 /api/export 或 /api/export?query=value
        // 我们需要修改 req.url 为 / 或 /?query=value 以便 Express 路由能正确匹配
        const originalUrl = req.url || '';
        const [path, queryString] = originalUrl.split('?');
        const newPath = path.replace(/^\/api\/export\/?/, '/') || '/';
        req.url = queryString ? `${newPath}?${queryString}` : newPath;
        
        // 设置响应头
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        
        await server(req, res);
    } catch (error) {
        console.error('未处理的错误:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: '服务器内部错误', 
                details: error.message 
            });
        }
    }
};

