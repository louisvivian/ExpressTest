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

// 获取所有用户
server.get('/users', async (req, res) => {
    try {
        const users = await prisma.user.findMany();
        res.json(users);
    } catch (error) {
        console.error('获取用户列表失败:', error);
        res.status(500).json({ error: '获取用户列表失败' });
    }
});

// 获取单个用户
server.get('/users/:id', async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: parseInt(req.params.id) }
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

// 添加新用户
server.post('/users', async (req, res) => {
    try {
        const { name } = req.body;
        
        console.log('接收到的请求体:', JSON.stringify(req.body));
        console.log('接收到的 name:', name);
        console.log('name 的 Buffer:', Buffer.from(name || '', 'utf8'));

        if (!name) {
            return res.status(400).json({ error: '用户名不能为空' });
        }

        const nameUtf8 = typeof name === 'string' ? name : String(name);

        const newUser = await prisma.user.create({
            data: { name: nameUtf8 }
        });
        
        console.log('创建的用户:', JSON.stringify(newUser));

        res.status(201).json(newUser);
    } catch (error) {
        console.error('创建用户失败:', error);
        res.status(500).json({ error: '创建用户失败' });
    }
});

// ⭐️ 关键：导出一个 handler 函数给 Vercel
module.exports = async (req, res) => {
    await server(req, res);
};

