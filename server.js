require('dotenv').config();
const express = require('express');
const app = express();
const PORT = 3000;
const apiRoutes = require('./routes');

// 中间件：告诉Express处理JSON请求，确保UTF-8编码
app.use(express.json({ 
    limit: '10mb',
    type: 'application/json',
    charset: 'utf-8'
}));
app.use(express.urlencoded({ 
    extended: true, 
    limit: '10mb',
    charset: 'utf-8'
}));

// 设置请求和响应头，确保UTF-8编码
app.use((req, res, next) => {
    // 设置响应头
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // 确保请求体使用 UTF-8 编码
    if (req.headers['content-type']) {
        req.headers['content-type'] = req.headers['content-type'].replace(/charset=[^;]*/, 'charset=utf-8');
    }
    next();
});

// 测试路由：欢迎页面
app.get('/', (req, res) => {
  res.send('欢迎使用我的API！');
});

// 使用API路由
app.use('/api', apiRoutes);

// 启动服务器
app.listen(PORT, () => {
  console.log(`API 服务器运行在 http://localhost:${PORT}`);
});