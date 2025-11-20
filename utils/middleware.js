const express = require('express');

// 创建并配置 Express 中间件
function createExpressMiddleware() {
    const app = express();
    
    // JSON 解析中间件
    app.use(express.json({ 
        limit: '10mb',
        type: 'application/json',
        charset: 'utf-8'
    }));
    
    // URL 编码解析中间件
    app.use(express.urlencoded({ 
        extended: true, 
        limit: '10mb',
        charset: 'utf-8'
    }));
    
    // 设置请求和响应头，确保UTF-8编码
    app.use((req, res, next) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (req.headers['content-type']) {
            req.headers['content-type'] = req.headers['content-type'].replace(/charset=[^;]*/, 'charset=utf-8');
        }
        next();
    });
    
    return app;
}

module.exports = { createExpressMiddleware };

