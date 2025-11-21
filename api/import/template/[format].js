require('dotenv').config();
const { createExpressMiddleware } = require('../../../../utils/middleware');
const { generateTemplate } = require('../../../../utils/importHandlers');
const fs = require('fs');

// 创建 Express 服务器并配置中间件
const server = createExpressMiddleware();

// 提取 format 的辅助函数
function extractFormat(req) {
    let format = null;
    
    // 方法1: 从 req.query.format 获取（如果 Vercel 自动解析）
    if (req.query && req.query.format) {
        format = req.query.format;
    }
    
    // 方法2: 从 URL 路径中解析
    if (!format && req.url) {
        const path = req.url.split('?')[0];
        const parts = path.split('/').filter(part => part && part !== 'api' && part !== 'import' && part !== 'template');
        // format 应该是 template 后面的部分
        const templateIndex = parts.indexOf('template');
        if (templateIndex !== -1 && templateIndex + 1 < parts.length) {
            format = parts[templateIndex + 1];
        } else if (parts.length > 0) {
            // 如果没有找到 template，可能是路径已经被处理过，取最后一个部分
            format = parts[parts.length - 1];
        }
    }
    
    // 方法3: 从 Express 路由参数获取
    if (!format && req.params && req.params.format) {
        format = req.params.format;
    }
    
    return format;
}

// 下载导入模板 - GET /api/import/template/:format
server.get('/', async (req, res) => {
    try {
        const format = extractFormat(req);
        
        if (!format) {
            return res.status(400).json({ error: '无效的格式参数' });
        }
        
        // 验证格式
        const validFormats = ['json', 'excel', 'xlsx', 'csv'];
        if (!validFormats.includes(format.toLowerCase())) {
            return res.status(400).json({ error: '不支持的模板格式', validFormats });
        }

        const { fileName, filePath } = generateTemplate(format.toLowerCase());

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: '模板文件不存在' });
        }

        // 设置下载响应头
        const mimeTypes = {
            'json': 'application/json',
            'excel': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'csv': 'text/csv'
        };

        const mimeType = mimeTypes[format.toLowerCase()] || 'application/octet-stream';
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

        // 发送文件
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

        fileStream.on('error', (error) => {
            console.error('读取模板文件失败:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: '读取模板文件失败' });
            }
        });
    } catch (error) {
        console.error('下载模板失败:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: '下载模板失败', details: error.message });
        }
    }
});

// ⭐️ 关键：导出一个 handler 函数给 Vercel
// 在 Vercel 中，请求会被路由到 /api/import/template/:format
module.exports = async (req, res) => {
    try {
        // 在 Vercel 中，动态路由参数在路径中
        // req.url 可能是 /api/import/template/json 或 /json
        // 我们需要从路径中提取 format
        const originalUrl = req.url || '';
        const [path, queryString] = originalUrl.split('?');
        const parts = path.split('/').filter(part => part);
        
        // 查找 format（通常是路径中 template 后面的部分）
        let format = null;
        const templateIndex = parts.indexOf('template');
        if (templateIndex !== -1 && templateIndex + 1 < parts.length) {
            format = parts[templateIndex + 1];
        }
        
        // 如果找到了 format，将其设置为查询参数
        if (format) {
            req.query = req.query || {};
            req.query.format = format;
        }
        
        // 修改 req.url 为 / 以便 Express 路由能正确匹配
        req.url = '/';
        
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

