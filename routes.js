const express = require('express');
const router = express.Router();
const prisma = require('./prisma/client');

// 获取所有用户
router.get('/users', async (req, res) => {
    try {
        const users = await prisma.user.findMany();
        res.json(users);
    } catch (error) {
        console.error('获取用户列表失败:', error);
        // 检查是否是数据库连接错误
        if (error.message && error.message.includes('Can\'t reach database server')) {
            return res.status(503).json({ 
                error: '数据库连接失败',
                message: '无法连接到数据库服务器，请检查 DATABASE_URL 环境变量配置'
            });
        }
        res.status(500).json({ error: '获取用户列表失败', details: error.message });
    }
});

// 获取单个用户
router.get('/users/:id', async (req, res) => {
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
        // 检查是否是数据库连接错误
        if (error.message && error.message.includes('Can\'t reach database server')) {
            return res.status(503).json({ 
                error: '数据库连接失败',
                message: '无法连接到数据库服务器，请检查 DATABASE_URL 环境变量配置'
            });
        }
        res.status(500).json({ error: '获取用户失败', details: error.message });
    }
});

// 添加新用户
router.post('/users', async (req, res) => {
    try {
        // 1. 从请求体获取新用户数据
        const { name } = req.body;
        
        // 调试：打印接收到的原始数据
        console.log('接收到的请求体:', JSON.stringify(req.body));
        console.log('接收到的 name:', name);
        console.log('name 的 Buffer:', Buffer.from(name || '', 'utf8'));

        // 2. 简单验证：确保名字不为空
        if (!name) {
            return res.status(400).json({ error: '用户名不能为空' });
        }

        // 3. 确保 name 是字符串且使用 UTF-8 编码
        const nameUtf8 = typeof name === 'string' ? name : String(name);

        // 4. 创建新用户
        const newUser = await prisma.user.create({
            data: { name: nameUtf8 }
        });
        
        console.log('创建的用户:', JSON.stringify(newUser));

        // 5. 返回201状态码（表示创建成功）和新用户数据
        res.status(201).json(newUser);
    } catch (error) {
        console.error('创建用户失败:', error);
        // 检查是否是数据库连接错误
        if (error.message && error.message.includes('Can\'t reach database server')) {
            return res.status(503).json({ 
                error: '数据库连接失败',
                message: '无法连接到数据库服务器，请检查 DATABASE_URL 环境变量配置'
            });
        }
        res.status(500).json({ error: '创建用户失败', details: error.message });
    }
});

// 获取信息视图列表
router.get('/infoViews', async (req, res) => {
    try {
        const infoViews = await prisma.infoView.findMany();
        res.json(infoViews);
    } catch (error) {
        console.error('获取信息视图列表失败:', error);
        // 检查是否是数据库连接错误
        if (error.message && error.message.includes('Can\'t reach database server')) {
            return res.status(503).json({ 
                error: '数据库连接失败',
                message: '无法连接到数据库服务器，请检查 DATABASE_URL 环境变量配置'
            });
        }
        res.status(500).json({ error: '获取信息视图列表失败', details: error.message });
    }
});


module.exports = router;

