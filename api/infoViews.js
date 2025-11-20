require('dotenv').config();
const prisma = require('../prisma/client');
const { createExpressMiddleware } = require('../utils/middleware');
const { handleDatabaseError } = require('../utils/dbErrorHandler');

// 创建 Express 服务器并配置中间件
const server = createExpressMiddleware();

// 获取信息视图列表
server.get('/api/infoViews', async (req, res) => {
    try {
        const infoViews = await prisma.executeWithRetry((p) => p.infoView.findMany());
        res.json(infoViews);
    } catch (error) {
        const dbError = handleDatabaseError(error, res);
        if (dbError) return;
        console.error('获取信息视图列表失败:', error);
        res.status(500).json({ error: '获取信息视图列表失败', details: error.message });
    }
});

// ⭐️ 关键：导出一个 handler 函数给 Vercel
module.exports = async (req, res) => {
    await server(req, res);
};

