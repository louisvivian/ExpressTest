require('dotenv').config();
const prisma = require('../../prisma/client');
const { createExpressMiddleware } = require('../../utils/middleware');
const { getUserById, deleteUser, extractUserId } = require('../../utils/userHandlers');

// 创建 Express 服务器并配置中间件
const server = createExpressMiddleware();

// 获取单个用户 - 在 Vercel 中，api/users/[id].js 对应 /api/users/:id 路径
// 使用根路径路由来处理请求
server.get('/', async (req, res) => {
    const id = extractUserId(req);
    
    if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ error: '无效的用户ID参数' });
    }

    await getUserById(req, res, prisma, id);
});

// 删除用户
server.delete('/', async (req, res) => {
    const id = extractUserId(req);
    
    if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ error: '无效的用户ID参数' });
    }

    await deleteUser(req, res, prisma, id);
});

// ⭐️ 关键：导出一个 handler 函数给 Vercel
module.exports = async (req, res) => {
    try {
        // 在 Vercel 中，req.url 可能是 '/api/users/4' 或 '/4'
        // 我们需要从 URL 中提取 id 并修改 req.url 为 / 以便 Express 路由能正确匹配
        const originalUrl = req.url || req.path || '';
        
        // 从 URL 中提取 id
        // req.url 可能是 '/api/users/4' 或 '/4' 或 '/api/users/4?query=value'
        const path = originalUrl.split('?')[0];
        const parts = path.split('/').filter(part => part);
        
        // 查找 id（通常是路径的最后一部分数字）
        // 在 Vercel 中，动态路由参数可能在路径的任何位置
        let id = null;
        for (let i = parts.length - 1; i >= 0; i--) {
            const part = parts[i];
            // 检查是否是数字（用户 ID）
            if (part && !isNaN(parseInt(part)) && part === String(parseInt(part))) {
                id = part;
                break;
            }
        }
        
        // 如果找到了 id，将其设置为查询参数，以便路由处理函数能够访问
        if (id) {
            req.query = req.query || {};
            req.query.id = id;
        }
        
        // 修改 req.url 为 / 以便 Express 路由能正确匹配
        req.url = '/';
        
        await server(req, res);
    } catch (error) {
        console.error('处理请求失败:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: '服务器内部错误', 
                details: error.message 
            });
        }
    }
};

