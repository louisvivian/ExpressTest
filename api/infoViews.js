require('dotenv').config();
const express = require('express');
const server = express();
const prisma = require('../prisma/client');

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

// 获取信息视图列表
server.get('/api/infoViews', async (req, res) => {
    try {
        const infoViews = await prisma.infoView.findMany();
        res.json(infoViews);
    } catch (error) {
        console.error('获取信息视图列表失败:', error);
        res.status(500).json({ error: '获取信息视图列表失败' });
    }
});

// ⭐️ 关键：导出一个 handler 函数给 Vercel
module.exports = async (req, res) => {
    await server(req, res);
};

