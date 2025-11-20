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

// 数据库错误处理辅助函数
function handleDatabaseError(error, res) {
    console.error('数据库错误:', error);
    
    const errorMessage = error.message || '';
    const errorCode = error.code || '';
    
    // 检查是否是数据库连接错误
    if (errorMessage.includes('Can\'t reach database server') || 
        errorMessage.includes('P1001') ||
        errorCode === 'P1001') {
        return res.status(503).json({ 
            error: '数据库连接失败',
            message: '无法连接到数据库服务器',
            details: {
                problem: '连接超时或无法访问数据库服务器',
                possibleCauses: [
                    'Supabase 项目可能被暂停（免费项目可能因不活跃而暂停）',
                    '网络连接问题或防火墙阻止',
                    'DATABASE_URL 配置错误',
                    '数据库服务器暂时不可用'
                ],
                solutions: [
                    '1. 登录 Supabase 控制台检查项目状态：https://app.supabase.com',
                    '2. 如果项目被暂停，需要恢复项目',
                    '3. 检查环境变量中的 DATABASE_URL 是否正确',
                    '4. 检查网络连接和防火墙设置'
                ]
            }
        });
    }
    
    // 认证错误
    if (errorMessage.includes('authentication failed') || 
        errorMessage.includes('P1000') ||
        errorCode === 'P1000') {
        return res.status(503).json({ 
            error: '数据库认证失败',
            message: '数据库用户名或密码错误',
            details: {
                problem: '无法使用提供的凭据连接到数据库',
                solutions: [
                    '1. 检查环境变量中的 DATABASE_URL 密码是否正确',
                    '2. 在 Supabase 控制台重置数据库密码',
                    '3. 更新环境变量中的 DATABASE_URL'
                ]
            }
        });
    }
    
    // 数据库不存在
    if (errorMessage.includes('does not exist') || 
        errorMessage.includes('P1003') ||
        errorCode === 'P1003') {
        return res.status(503).json({ 
            error: '数据库不存在',
            message: '指定的数据库不存在',
            details: {
                problem: 'DATABASE_URL 中指定的数据库名称不存在',
                solutions: [
                    '1. 检查环境变量中的 DATABASE_URL 数据库名称是否正确',
                    '2. 在 Supabase 控制台确认数据库名称'
                ]
            }
        });
    }
    
    return null;
}

// 获取所有用户（支持分页）- 在 Vercel 中，api/users.js 对应 /api/users 路径
server.get('/', async (req, res) => {
    try {
        // 获取分页参数
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        
        // 验证参数
        const pageNum = Math.max(1, page);
        const limitNum = Math.max(1, Math.min(100, limit)); // 限制每页最多100条
        const skip = (pageNum - 1) * limitNum;

        // 并行查询用户列表和总数
        const [users, total] = await Promise.all([
            prisma.executeWithRetry((p) => 
                p.user.findMany({
                    skip: skip,
                    take: limitNum,
                    orderBy: {
                        createdAt: 'desc' // 按创建时间倒序
                    }
                })
            ),
            prisma.executeWithRetry((p) => p.user.count())
        ]);

        const totalPages = Math.ceil(total / limitNum);

        // 返回分页结果
        res.json({
            data: users,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: total,
                totalPages: totalPages,
                hasNext: pageNum < totalPages,
                hasPrev: pageNum > 1
            }
        });
    } catch (error) {
        const dbError = handleDatabaseError(error, res);
        if (dbError) return;
        console.error('获取用户列表失败:', error);
        res.status(500).json({ 
            error: '获取用户列表失败', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// 添加新用户
server.post('/', async (req, res) => {
    try {
        const { name } = req.body;
        
        console.log('接收到的请求体:', JSON.stringify(req.body));
        console.log('接收到的 name:', name);
        console.log('name 的 Buffer:', Buffer.from(name || '', 'utf8'));

        if (!name) {
            return res.status(400).json({ error: '用户名不能为空' });
        }

        const nameUtf8 = typeof name === 'string' ? name : String(name);

        // 使用带重试的查询函数来处理 prepared statement 错误
        const newUser = await prisma.executeWithRetry((p) => 
            p.user.create({
                data: { name: nameUtf8 }
            })
        );
        
        console.log('创建的用户:', JSON.stringify(newUser));

        res.status(201).json(newUser);
    } catch (error) {
        const dbError = handleDatabaseError(error, res);
        if (dbError) return;
        console.error('创建用户失败:', error);
        res.status(500).json({ 
            error: '创建用户失败', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// ⭐️ 关键：导出一个 handler 函数给 Vercel
// 在 Vercel 中，请求会被路由到 /api/users，Express 会处理这个请求
module.exports = async (req, res) => {
    try {
        // 在 Vercel 中，req.url 可能是 /api/users 或 /api/users?page=1&limit=10
        // 我们需要修改 req.url 为 / 或 /?page=1&limit=10 以便 Express 路由能正确匹配
        const originalUrl = req.url || '';
        const [path, queryString] = originalUrl.split('?');
        const newPath = path.replace(/^\/api\/users\/?/, '/') || '/';
        req.url = queryString ? `${newPath}?${queryString}` : newPath;
        
        // 设置响应头
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        
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

