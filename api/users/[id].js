require('dotenv').config();
const express = require('express');
const server = express();
const prisma = require('../../prisma/client');

// 中间件
server.use(express.json({ 
    limit: '10mb',
    type: 'application/json',
    charset: 'utf-8'
}));
server.use(express.urlencoded({ 
    extended: true, 
    limit: '10mb',
    charset: 'utf-8'
}));

// 设置请求和响应头，确保UTF-8编码
server.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.headers['content-type']) {
        req.headers['content-type'] = req.headers['content-type'].replace(/charset=[^;]*/, 'charset=utf-8');
    }
    next();
});

// 获取单个用户 - 在 Vercel 中，api/users/[id].js 对应 /api/users/:id 路径
// 使用通配符路由来捕获所有请求
server.get('*', async (req, res) => {
    try {
        // 从 URL 路径中解析 id
        // req.url 在 Vercel 中可能是 '/api/users/4' 或 '/4'
        // 我们需要提取最后一个数字部分
        let id = null;
        
        // 方法1: 从 req.query.id 获取（如果 Vercel 自动解析）
        if (req.query && req.query.id) {
            id = req.query.id;
        }
        
        // 方法2: 从 URL 路径中解析
        if (!id && req.url) {
            // 移除查询字符串
            const path = req.url.split('?')[0];
            // 分割路径并获取最后一部分
            const parts = path.split('/').filter(part => part && part !== 'api' && part !== 'users');
            if (parts.length > 0) {
                id = parts[parts.length - 1];
            }
        }
        
        // 方法3: 从 Express 路由参数获取
        if (!id && req.params && req.params.id) {
            id = req.params.id;
        }
        
        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({ error: '无效的用户ID参数' });
        }

        const user = await prisma.user.findUnique({
            where: { id: parseInt(id) }
        });

        if (!user) {
            return res.status(404).json({ error: '用户未找到' });
        }

        res.json(user);
    } catch (error) {
        console.error('获取用户失败:', error);
        res.status(500).json({ error: '获取用户失败' });
    }
});

// ⭐️ 关键：导出一个 handler 函数给 Vercel
module.exports = async (req, res) => {
    await server(req, res);
};

