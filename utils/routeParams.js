/**
 * 从请求中提取动态路由参数
 * 用于 Vercel serverless 环境中的动态路由处理
 */

/**
 * 从 URL 路径中提取参数
 * @param {Object} req - Express 请求对象
 * @param {string} pattern - 正则表达式模式，例如 /\/api\/export\/([^\/\?]+)\/status/
 * @param {string} fallbackPath - 备用路径模式，例如 'export' 和 'status' 之间的部分
 * @returns {string|null} 提取的参数值
 */
function extractParamFromUrl(req, pattern, fallbackPath = null) {
    // 尝试从多个可能的 URL 来源获取
    const possibleUrls = [
        req.url,
        req.path,
        req.originalUrl,
        req.headers && (req.headers['x-vercel-original-url'] || req.headers['x-invoke-path'])
    ].filter(Boolean);
    
    for (const originalUrl of possibleUrls) {
        if (!originalUrl) continue;
        
        // 方法1: 使用正则表达式匹配（最可靠）
        if (pattern) {
            const match = originalUrl.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        
        // 方法2: 从路径中解析（备用方法）
        if (fallbackPath) {
            const path = originalUrl.split('?')[0];
            const parts = path.split('/').filter(part => part);
            const [startPart, endPart] = fallbackPath.split('|');
            
            const startIndex = parts.indexOf(startPart);
            const endIndex = parts.indexOf(endPart);
            
            if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex + 1) {
                return parts[startIndex + 1];
            } else if (parts.length >= 2 && parts[parts.length - 1] === endPart) {
                // 如果路径是 /xxx/endPart，参数是倒数第二个部分
                return parts[parts.length - 2];
            }
        }
    }
    
    return null;
}

/**
 * 提取 taskId 从请求中
 * @param {Object} req - Express 请求对象
 * @param {string} routeType - 路由类型：'export' 或 'import'
 * @param {string} action - 动作：'status' 或 'download'
 * @returns {string|null} taskId
 */
function extractTaskId(req, routeType = 'export', action = 'status') {
    // 方法1: 从 req.query.taskId 获取
    if (req.query && req.query.taskId) {
        return req.query.taskId;
    }
    
    // 方法2: 从 Express 路由参数获取
    if (req.params && req.params.taskId) {
        return req.params.taskId;
    }
    
    // 方法3: 从 URL 路径中解析
    const pattern = new RegExp(`/api/${routeType}/([^/\\?]+)/${action}`);
    return extractParamFromUrl(req, pattern, `${routeType}|${action}`);
}

/**
 * 提取 format 从请求中
 * @param {Object} req - Express 请求对象
 * @returns {string|null} format
 */
function extractFormat(req) {
    // 方法1: 从 req.query.format 获取
    if (req.query && req.query.format) {
        return req.query.format;
    }
    
    // 方法2: 从 Express 路由参数获取
    if (req.params && req.params.format) {
        return req.params.format;
    }
    
    // 方法3: 从 URL 路径中解析
    const pattern = /\/api\/import\/template\/([^\/\?]+)/;
    const format = extractParamFromUrl(req, pattern, 'template|');
    
    if (format) {
        return format;
    }
    
    // 备用方法：从路径中解析
    if (req.url) {
        const path = req.url.split('?')[0];
        const parts = path.split('/').filter(part => part && part !== 'api' && part !== 'import' && part !== 'template');
        const templateIndex = parts.indexOf('template');
        if (templateIndex !== -1 && templateIndex + 1 < parts.length) {
            return parts[templateIndex + 1];
        } else if (parts.length > 0) {
            return parts[parts.length - 1];
        }
    }
    
    return null;
}

/**
 * 提取用户 ID 从请求中
 * @param {Object} req - Express 请求对象
 * @returns {string|null} 用户 ID
 */
function extractUserId(req) {
    // 方法1: 从 req.query.id 获取
    if (req.query && req.query.id) {
        return req.query.id;
    }
    
    // 方法2: 从 Express 路由参数获取
    if (req.params && req.params.id) {
        return req.params.id;
    }
    
    // 方法3: 从 URL 路径中解析
    const pattern = /\/api\/users\/(\d+)/;
    const id = extractParamFromUrl(req, pattern, 'users|');
    
    if (id && !isNaN(parseInt(id))) {
        return id;
    }
    
    // 备用方法：从路径中查找数字
    const possibleUrls = [
        req.url,
        req.path,
        req.originalUrl
    ].filter(Boolean);
    
    for (const originalUrl of possibleUrls) {
        const path = originalUrl.split('?')[0];
        const parts = path.split('/').filter(part => part);
        
        // 查找数字（用户 ID）
        for (let i = parts.length - 1; i >= 0; i--) {
            const part = parts[i];
            if (part && !isNaN(parseInt(part)) && part === String(parseInt(part))) {
                return part;
            }
        }
    }
    
    return null;
}

module.exports = {
    extractParamFromUrl,
    extractTaskId,
    extractFormat,
    extractUserId
};

