const { handleDatabaseError } = require('./dbErrorHandler');

/**
 * 获取用户列表（支持分页）
 */
async function getUsersList(req, res, prisma) {
    try {
        // 获取分页参数
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        // 获取搜索参数
        const searchName = req.query.name ? req.query.name.trim() : null;
        
        // 验证参数
        const pageNum = Math.max(1, page);
        const limitNum = Math.max(1, Math.min(100, limit)); // 限制每页最多100条
        const skip = (pageNum - 1) * limitNum;

        // 构建查询条件
        const where = {};
        if (searchName) {
            where.name = {
                contains: searchName,
                mode: 'insensitive' // 不区分大小写（如果数据库支持）
            };
        }

        // 并行查询用户列表和总数
        const [users, total] = await Promise.all([
            prisma.executeWithRetry((p) => 
                p.user.findMany({
                    where: where,
                    skip: skip,
                    take: limitNum,
                    orderBy: {
                        createdAt: 'desc' // 按创建时间倒序
                    }
                })
            ),
            prisma.executeWithRetry((p) => p.user.count({ where: where }))
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
}

/**
 * 获取单个用户
 */
async function getUserById(req, res, prisma, userId) {
    try {
        const user = await prisma.executeWithRetry((p) => 
            p.user.findUnique({
                where: { id: parseInt(userId) }
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
}

/**
 * 创建新用户
 */
async function createUser(req, res, prisma) {
    try {
        const { name } = req.body;
        
        console.log('接收到的请求体:', JSON.stringify(req.body));
        console.log('接收到的 name:', name);
        console.log('name 的 Buffer:', Buffer.from(name || '', 'utf8'));

        if (!name) {
            return res.status(400).json({ error: '用户名不能为空' });
        }

        const nameUtf8 = typeof name === 'string' ? name : String(name);

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
        res.status(500).json({ error: '创建用户失败', details: error.message });
    }
}

/**
 * 删除用户
 */
async function deleteUser(req, res, prisma, userId) {
    try {
        const userIdNum = parseInt(userId);

        if (isNaN(userIdNum)) {
            return res.status(400).json({ error: '无效的用户ID' });
        }

        // 先检查用户是否存在
        const user = await prisma.executeWithRetry((p) => 
            p.user.findUnique({
                where: { id: userIdNum }
            })
        );

        if (!user) {
            return res.status(404).json({ error: '用户未找到' });
        }

        // 删除用户
        await prisma.executeWithRetry((p) => 
            p.user.delete({
                where: { id: userIdNum }
            })
        );

        console.log(`用户 ID ${userIdNum} 已删除`);

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
}

/**
 * 从请求中提取用户 ID（用于 Vercel serverless 环境）
 */
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

module.exports = {
    getUsersList,
    getUserById,
    createUser,
    deleteUser,
    extractUserId
};

