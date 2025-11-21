/**
 * 创建 Vercel serverless handler
 * 处理 URL 路径转换，使 Express 路由能正确匹配
 * 
 * @param {Express} server - Express 应用实例
 * @param {string} basePath - API 基础路径，例如 '/api/users' 或 '/api/import'
 * @returns {Function} Vercel handler 函数
 */
function createVercelHandler(server, basePath) {
    return async (req, res) => {
        try {
            // 在 Vercel 中，req.url 可能包含完整路径
            // 我们需要修改 req.url 以便 Express 路由能正确匹配
            const originalUrl = req.url || '';
            const [path, queryString] = originalUrl.split('?');
            
            // 移除 basePath 前缀，保留查询参数
            // 例如：/api/users -> /, /api/users/123 -> /123
            const routePath = path.replace(new RegExp(`^${basePath}/?`), '/') || '/';
            req.url = queryString ? `${routePath}?${queryString}` : routePath;
            
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
}

module.exports = {
    createVercelHandler
};

