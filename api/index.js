require('dotenv').config();
const express = require('express');
const server = express();
const apiRoutes = require('../routes');

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

// 设置请求和响应头，确保UTF-8编码（排除文件上传）
server.use((req, res, next) => {
    // 如果是文件上传请求，不设置Content-Type，让multer处理
    if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
        return next();
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.headers['content-type']) {
        req.headers['content-type'] = req.headers['content-type'].replace(/charset=[^;]*/, 'charset=utf-8');
    }
    next();
});

// 挂载 API 路由
server.use('/api', apiRoutes);

// 测试路由：欢迎页面
server.get('/api', (req, res) => {
    res.send('欢迎使用我的API！');
});

// ⭐️ 关键：导出一个 handler 函数给 Vercel
// 在 Vercel 中，请求会被路由到 /api/*，我们需要处理 URL 路径转换
module.exports = async (req, res) => {
    try {
        // 在 Vercel 中，req.url 可能包含 /api 前缀
        // 我们需要确保路由能正确匹配
        const originalUrl = req.url || '';
        const [path, queryString] = originalUrl.split('?');
        
        // 如果路径以 /api 开头，保留它（因为路由已经挂载在 /api 下）
        // 如果路径不以 /api 开头，添加 /api 前缀
        let newPath = path;
        if (!path.startsWith('/api')) {
            newPath = `/api${path}`;
        }
        
        req.url = queryString ? `${newPath}?${queryString}` : newPath;
        
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

