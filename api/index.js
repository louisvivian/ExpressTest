require('dotenv').config();
const express = require('express');
const server = express();

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

// 测试路由：欢迎页面
server.get('/api', (req, res) => {
    res.send('欢迎使用我的API！');
});

// ⭐️ 关键：导出一个 handler 函数给 Vercel
module.exports = async (req, res) => {
    await server(req, res);
};

