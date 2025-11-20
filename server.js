require('dotenv').config({ debug: true });
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const apiRoutes = require('./routes');
const { connectPrisma, disconnectPrisma } = require('./prisma/client');

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

// 设置请求和响应头，确保UTF-8编码（仅对API请求，排除文件上传）
app.use('/api', (req, res, next) => {
    // 如果是文件上传请求，不设置Content-Type，让multer处理
    if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
        return next();
    }
    // 设置响应头
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // 确保请求体使用 UTF-8 编码
    if (req.headers['content-type']) {
        req.headers['content-type'] = req.headers['content-type'].replace(/charset=[^;]*/, 'charset=utf-8');
    }
    next();
});

// 使用API路由（在静态文件之前）
app.use('/api', apiRoutes);

// 提供静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 根路由：提供前端页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 导出 Express 应用实例（用于服务器less环境）
module.exports = app;

// 本地开发环境：启动服务器
// Vercel 环境：不启动服务器（所有逻辑都在 api/ 目录下的文件中）
if (!process.env.VERCEL) {
    // 启动服务器前先建立数据库连接
    (async () => {
        try {
            await connectPrisma();
            const server = app.listen(PORT, () => {
                console.log(`API 服务器运行在 http://localhost:${PORT}`);
            });
            
            // 优雅关闭函数
            const gracefulShutdown = async (signal) => {
                console.log(`\n收到 ${signal} 信号，正在关闭服务器...`);
                
                // 先关闭数据库连接
                await disconnectPrisma();
                
                // 停止接受新连接
                server.close(() => {
                    console.log('HTTP 服务器已关闭');
                });
                
                // 强制关闭所有现有连接
                server.closeAllConnections && server.closeAllConnections();
                
                // 延迟退出进程，确保所有资源都已释放
                setTimeout(() => {
                    console.log('进程已退出');
                    process.exit(0);
                }, 100);
            };

            // 处理 Ctrl+C (SIGINT) 和 SIGTERM 信号
            process.on('SIGINT', () => {
                gracefulShutdown('SIGINT');
            });
            
            process.on('SIGTERM', () => {
                gracefulShutdown('SIGTERM');
            });

            // Windows 上处理 Ctrl+C 的备用方式
            if (process.platform === 'win32') {
                const readline = require('readline');
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                
                rl.on('SIGINT', () => {
                    rl.close();
                    gracefulShutdown('SIGINT');
                });
            }

            // 处理未捕获的异常，确保进程退出
            process.on('uncaughtException', (err) => {
                console.error('未捕获的异常:', err);
                gracefulShutdown('uncaughtException');
            });
            
            process.on('unhandledRejection', (reason, promise) => {
                console.error('未处理的 Promise 拒绝:', reason);
                gracefulShutdown('unhandledRejection');
            });
        } catch (error) {
            console.error('启动服务器失败:', error);
            process.exit(1);
        }
    })();

}