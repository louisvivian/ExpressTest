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
        
        // 启动导出任务（不等待完成）
        // 使用立即执行的 async IIFE 并添加错误处理
        const exportPromise = (async () => {
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
        })();
        
        // 捕获未处理的 Promise 拒绝
        exportPromise.catch(err => {
            console.error(`[${taskId}] 导出任务 Promise 未捕获的错误:`, err);
        });

        // 等待任务至少开始执行并更新状态为 processing
        // 这样可以确保在 Vercel 函数返回前，任务已经开始处理
        // 轮询检查任务状态，最多等待2秒
        let taskStarted = false;
        const maxWaitTime = 2000; // 2秒
        const checkInterval = 100; // 每100ms检查一次
        const startTime = Date.now();
        
        while (!taskStarted && (Date.now() - startTime) < maxWaitTime) {
            try {
                const task = await taskManager.getTask(taskId);
                if (task && task.status === 'processing') {
                    taskStarted = true;
                    console.log(`[${taskId}] 任务已开始处理，状态已更新为 processing`);
                    break;
                }
            } catch (checkError) {
                console.error(`[${taskId}] 检查任务状态时出错:`, checkError);
            }
            
            // 等待一段时间后再次检查
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
        
        if (!taskStarted) {
            console.warn(`[${taskId}] 等待超时，任务可能尚未开始处理，但已启动异步任务`);
            // 即使超时，也尝试手动更新一次状态，确保任务至少被标记为 processing
            try {
                await taskManager.updateTask(taskId, {
                    status: 'processing',
                    progress: 1
                });
                console.log(`[${taskId}] 手动更新任务状态为 processing`);
            } catch (manualUpdateError) {
                console.error(`[${taskId}] 手动更新任务状态失败:`, manualUpdateError);
            }
        }

        // 返回响应
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
const { createVercelHandler } = require('../utils/vercelHandler');
module.exports = createVercelHandler(server, '/api/export');

