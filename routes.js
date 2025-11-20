const express = require('express');
const router = express.Router();
let prisma = require('./prisma/client');
const { handlePreparedStatementError, createNewPrismaClient } = require('./prisma/client');

// 包装 Prisma 操作，自动处理 prepared statement 错误
// prismaOperation 应该是一个函数工厂，返回 Prisma 操作 Promise
async function executeWithRetry(prismaOperationFactory) {
    let retryCount = 0;
    const maxRetries = 2;
    
    while (retryCount <= maxRetries) {
        try {
            // 使用单例 Prisma Client 实例（推荐做法）
            // Prisma Client 会自动管理连接池，无需手动连接/断开
            const result = await prismaOperationFactory(prisma);
            return result;
        } catch (error) {
            // 检查是否是 prepared statement 错误
            const errorMessage = error.message || '';
            const errorCode = error.code || '';
            const isPreparedStatementError = 
                (errorMessage.includes('prepared statement') && errorMessage.includes('already exists')) ||
                errorCode === '42P05';
            
            // 如果是 prepared statement 错误，尝试重置 Prisma Client 实例并重试
            if (isPreparedStatementError && retryCount < maxRetries) {
                retryCount++;
                console.log(`检测到 prepared statement 错误，正在重置 Prisma Client... (重试 ${retryCount}/${maxRetries})`);
                
                try {
                    // 使用 handlePreparedStatementError 函数完全重置实例
                    const { handlePreparedStatementError } = require('./prisma/client');
                    const newPrisma = await handlePreparedStatementError();
                    
                    // 更新 routes.js 中的 prisma 引用
                    prisma = newPrisma;
                    
                    // 等待更长时间确保连接完全重置
                    await new Promise(resolve => setTimeout(resolve, 300));
                    
                    // 继续循环重试
                    continue;
                } catch (resetError) {
                    console.error('重置 Prisma Client 失败:', resetError);
                    // 如果重置失败，等待后继续重试
                    await new Promise(resolve => setTimeout(resolve, 500));
                    continue;
                }
            } else {
                // 不是 prepared statement 错误，或者重试次数已用完，直接抛出
                throw error;
            }
        }
    }
    
    // 理论上不会到达这里，但为了类型安全
    throw new Error('执行失败：重试次数已用完');
}

// 数据库连接错误处理辅助函数
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
                    '3. 检查 .env 文件中的 DATABASE_URL 是否正确',
                    '4. 运行诊断脚本：node diagnose-db.js',
                    '5. 检查网络连接和防火墙设置'
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
                    '1. 检查 .env 文件中的 DATABASE_URL 密码是否正确',
                    '2. 在 Supabase 控制台重置数据库密码',
                    '3. 更新 .env 文件中的 DATABASE_URL'
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
                    '1. 检查 .env 文件中的 DATABASE_URL 数据库名称是否正确',
                    '2. 在 Supabase 控制台确认数据库名称'
                ]
            }
        });
    }
    
    // 其他数据库错误
    return null;
}

// 获取所有用户（支持分页）
router.get('/users', async (req, res) => {
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
            executeWithRetry((p) => 
                p.user.findMany({
                    skip: skip,
                    take: limitNum,
                    orderBy: {
                        createdAt: 'desc' // 按创建时间倒序
                    }
                })
            ),
            executeWithRetry((p) => p.user.count())
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
        res.status(500).json({ error: '获取用户列表失败', details: error.message });
    }
});

// 获取单个用户
router.get('/users/:id', async (req, res) => {
    try {
        const user = await executeWithRetry((p) => 
            p.user.findUnique({
                where: { id: parseInt(req.params.id) }
            })
        );

        if (!user) {
            return res.status(404).json({ error: '用户未找到' });
        }

        res.json(user);
    } catch (error) {
        const dbError = handleDatabaseError(error, res);
        if (dbError) return;
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
        const newUser = await executeWithRetry((p) => 
            p.user.create({
                data: { name: nameUtf8 }
            })
        );
        
        console.log('创建的用户:', JSON.stringify(newUser));

        // 5. 返回201状态码（表示创建成功）和新用户数据
        res.status(201).json(newUser);
    } catch (error) {
        const dbError = handleDatabaseError(error, res);
        if (dbError) return;
        res.status(500).json({ error: '创建用户失败', details: error.message });
    }
});

// 删除用户
router.delete('/users/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);

        if (isNaN(userId)) {
            return res.status(400).json({ error: '无效的用户ID' });
        }

        // 先检查用户是否存在
        const user = await executeWithRetry((p) => 
            p.user.findUnique({
                where: { id: userId }
            })
        );

        if (!user) {
            return res.status(404).json({ error: '用户未找到' });
        }

        // 删除用户
        await executeWithRetry((p) => 
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

// 获取信息视图列表
router.get('/infoViews', async (req, res) => {
    try {
        const infoViews = await executeWithRetry((p) => p.infoView.findMany());
        res.json(infoViews);
    } catch (error) {
        const dbError = handleDatabaseError(error, res);
        if (dbError) return;
        res.status(500).json({ error: '获取信息视图列表失败', details: error.message });
    }
});


module.exports = router;

