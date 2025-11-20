require('dotenv').config();
const prisma = require('../prisma/client');
const { createExpressMiddleware } = require('../utils/middleware');
const { getUsersList, createUser } = require('../utils/userHandlers');

// 创建 Express 服务器并配置中间件
const server = createExpressMiddleware();

// 获取所有用户（支持分页）- 在 Vercel 中，api/users.js 对应 /api/users 路径
server.get('/', async (req, res) => {
    await getUsersList(req, res, prisma);
});

// 添加新用户
server.post('/', async (req, res) => {
    await createUser(req, res, prisma);
});

// ⭐️ 关键：导出一个 handler 函数给 Vercel
// 在 Vercel 中，请求会被路由到 /api/users，Express 会处理这个请求
module.exports = async (req, res) => {
    try {
        // 在 Vercel 中，req.url 可能是 /api/users 或 /api/users?page=1&limit=10
        // 我们需要修改 req.url 为 / 或 /?page=1&limit=10 以便 Express 路由能正确匹配
        const originalUrl = req.url || '';
        const [path, queryString] = originalUrl.split('?');
        const newPath = path.replace(/^\/api\/users\/?/, '/') || '/';
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

