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
const { createVercelHandler } = require('../utils/vercelHandler');
module.exports = createVercelHandler(server, '/api/users');

