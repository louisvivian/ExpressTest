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
        const taskId = await taskManager.createTask(format.toLowerCase(), searchName);
        console.log(`导出任务已创建: ${taskId}, 格式: ${format}, 搜索名称: ${searchName || '无'}`);
        
        // 在响应返回前，先启动导出任务
        // 在 Vercel 中，我们需要确保任务至少开始执行
        // 使用立即执行的 async IIFE 并添加错误处理
        (async () => {
            try {
                console.log(`[${taskId}] 开始执行导出任务...`);
                const result = await exportUsers(prisma, format.toLowerCase(), searchName, taskId);
                console.log(`[${taskId}] 导出任务完成: 文件=${result.fileName}, 记录数=${result.totalRecords}`);
            } catch (error) {
                console.error(`[${taskId}] 导出任务失败:`, error);
                console.error(`[${taskId}] 错误堆栈:`, error.stack);
                // 确保任务状态被更新为失败
                try {
                    await taskManager.updateTask(taskId, {
                        status: 'failed',
                        error: error.message || String(error)
                    });
                    console.log(`[${taskId}] 任务状态已更新为 failed`);
                } catch (updateError) {
                    console.error(`[${taskId}] 更新任务状态失败:`, updateError);
                }
            }
        })().catch(err => {
            // 捕获未处理的 Promise 拒绝
            console.error(`[${taskId}] 导出任务 Promise 未捕获的错误:`, err);
        });

        // 立即返回响应，不等待任务完成
        // 在 Vercel 中，函数会继续执行直到完成或超时（最多 60 秒）
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

