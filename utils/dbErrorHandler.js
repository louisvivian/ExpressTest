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
                    '3. 检查环境变量中的 DATABASE_URL 是否正确',
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
    
    // 其他数据库错误
    return null;
}

module.exports = { handleDatabaseError };

