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

// 从请求中提取用户 ID 的辅助函数
function extractUserId(req) {
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
    
    return id;
}

// 获取单个用户 - 在 Vercel 中，api/users/[id].js 对应 /api/users/:id 路径
// 使用根路径路由来处理请求
server.get('/', async (req, res) => {
    try {
        const id = extractUserId(req);
        
        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({ error: '无效的用户ID参数' });
        }

        // 使用带重试的查询函数来处理 prepared statement 错误
        const user = await prisma.executeWithRetry((p) => 
            p.user.findUnique({
                where: { id: parseInt(id) }
            })
        );

        if (!user) {
            return res.status(404).json({ error: '用户未找到' });
        }

        res.json(user);
    } catch (error) {
        const dbError = handleDatabaseError(error, res);
        if (dbError) return;
        console.error('获取用户失败:', error);
        res.status(500).json({ error: '获取用户失败', details: error.message });
    }
});

// 删除用户
server.delete('/', async (req, res) => {
    try {
        const id = extractUserId(req);
        
        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({ error: '无效的用户ID参数' });
        }

        const userId = parseInt(id);

        // 先检查用户是否存在
        const user = await prisma.executeWithRetry((p) => 
            p.user.findUnique({
                where: { id: userId }
            })
        );

        if (!user) {
            return res.status(404).json({ error: '用户未找到' });
        }

        // 删除用户
        await prisma.executeWithRetry((p) => 
            p.user.delete({
                where: { id: userId }
            })
        );

        console.log(`用户 ID ${userId} 已删除`);

        res.status(200).json({ 
            message: '用户删除成功',
            deletedUser: user
        });
    } catch (error) {
        const dbError = handleDatabaseError(error, res);
        if (dbError) return;
        console.error('删除用户失败:', error);
        res.status(500).json({ error: '删除用户失败', details: error.message });
    }
});

// ⭐️ 关键：导出一个 handler 函数给 Vercel
module.exports = async (req, res) => {
    try {
        // 在 Vercel 中，req.url 可能是 '/api/users/4' 或 '/4'
        // 我们需要从 URL 中提取 id 并修改 req.url 为 / 以便 Express 路由能正确匹配
        const originalUrl = req.url || req.path || '';
        
        // 从 URL 中提取 id
        // req.url 可能是 '/api/users/4' 或 '/4' 或 '/api/users/4?query=value'
        const path = originalUrl.split('?')[0];
        const parts = path.split('/').filter(part => part);
        
        // 查找 id（通常是路径的最后一部分数字）
        // 在 Vercel 中，动态路由参数可能在路径的任何位置
        let id = null;
        for (let i = parts.length - 1; i >= 0; i--) {
            const part = parts[i];
            // 检查是否是数字（用户 ID）
            if (part && !isNaN(parseInt(part)) && part === String(parseInt(part))) {
                id = part;
                break;
            }
        }
        
        // 如果找到了 id，将其设置为查询参数，以便路由处理函数能够访问
        if (id) {
            req.query = req.query || {};
            req.query.id = id;
        }
        
        // 修改 req.url 为 / 以便 Express 路由能正确匹配
        req.url = '/';
        
        await server(req, res);
    } catch (error) {
        console.error('处理请求失败:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: '服务器内部错误', 
                details: error.message 
            });
        }
    }
};

