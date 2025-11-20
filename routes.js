const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const prisma = require('./prisma/client');
const { getUsersList, getUserById, createUser, deleteUser } = require('./utils/userHandlers');
const { handleDatabaseError } = require('./utils/dbErrorHandler');
const { exportUsers } = require('./utils/exportHandlers');
const taskManager = require('./utils/exportTaskManager');
const { importUsers, generateTemplate, countRecords } = require('./utils/importHandlers');
const importTaskManager = require('./utils/importTaskManager');

// 获取所有用户（支持分页）
router.get('/users', async (req, res) => {
    await getUsersList(req, res, prisma);
});

// 获取单个用户
router.get('/users/:id', async (req, res) => {
    await getUserById(req, res, prisma, req.params.id);
});

// 添加新用户
router.post('/users', async (req, res) => {
    await createUser(req, res, prisma);
});

// 删除用户
router.delete('/users/:id', async (req, res) => {
    await deleteUser(req, res, prisma, req.params.id);
});

// 获取信息视图列表
router.get('/infoViews', async (req, res) => {
    try {
        const infoViews = await prisma.executeWithRetry((p) => p.infoView.findMany());
        res.json(infoViews);
    } catch (error) {
        const dbError = handleDatabaseError(error, res);
        if (dbError) return;
        res.status(500).json({ error: '获取信息视图列表失败', details: error.message });
    }
});

// 导出相关路由
// 创建导出任务
router.post('/export', async (req, res) => {
    try {
        const { format = 'json', name: searchName } = req.body;
        
        // 验证格式
        const validFormats = ['json', 'excel', 'xlsx', 'csv'];
        if (!validFormats.includes(format.toLowerCase())) {
            return res.status(400).json({ error: '不支持的导出格式', validFormats });
        }

        // 创建任务
        const taskId = taskManager.createTask(format.toLowerCase(), searchName);
        
        // 异步执行导出任务
        exportUsers(prisma, format.toLowerCase(), searchName, taskId)
            .catch(error => {
                console.error('导出任务失败:', error);
            });

        res.json({
            taskId,
            message: '导出任务已创建',
            status: 'pending'
        });
    } catch (error) {
        console.error('创建导出任务失败:', error);
        res.status(500).json({ error: '创建导出任务失败', details: error.message });
    }
});

// 查询导出任务状态
router.get('/export/:taskId/status', async (req, res) => {
    try {
        const { taskId } = req.params;
        const task = taskManager.getTask(taskId);

        if (!task) {
            return res.status(404).json({ error: '任务不存在' });
        }

        res.json({
            taskId: task.taskId,
            status: task.status,
            progress: task.progress,
            format: task.format,
            fileName: task.fileName,
            error: task.error,
            totalRecords: task.totalRecords,
            processedRecords: task.processedRecords
        });
    } catch (error) {
        console.error('查询任务状态失败:', error);
        res.status(500).json({ error: '查询任务状态失败', details: error.message });
    }
});

// 下载导出文件
router.get('/export/:taskId/download', async (req, res) => {
    try {
        const { taskId } = req.params;
        const task = taskManager.getTask(taskId);

        if (!task) {
            return res.status(404).json({ error: '任务不存在' });
        }

        if (task.status !== 'completed') {
            return res.status(400).json({ 
                error: '任务尚未完成', 
                status: task.status,
                progress: task.progress 
            });
        }

        if (!task.filePath || !fs.existsSync(task.filePath)) {
            return res.status(404).json({ error: '导出文件不存在' });
        }

        // 设置下载响应头
        const mimeTypes = {
            'json': 'application/json',
            'excel': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'csv': 'text/csv'
        };

        const mimeType = mimeTypes[task.format] || 'application/octet-stream';
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(task.fileName)}"`);

        // 发送文件
        const fileStream = fs.createReadStream(task.filePath);
        fileStream.pipe(res);

        fileStream.on('error', (error) => {
            console.error('读取文件失败:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: '读取文件失败' });
            }
        });
    } catch (error) {
        console.error('下载文件失败:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: '下载文件失败', details: error.message });
        }
    }
});

// 导入相关路由
// 配置multer用于文件上传
// Vercel 环境使用 /tmp 目录，本地开发使用项目目录
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;
const uploadsDir = isVercel 
    ? '/tmp/uploads' 
    : path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `import_${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'application/json',
            'text/csv',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/octet-stream' // 某些浏览器可能发送这个MIME类型
        ];
        const allowedExts = ['.json', '.csv', '.xlsx', '.xls'];
        const ext = path.extname(file.originalname).toLowerCase();
        
        // 优先检查文件扩展名
        if (allowedExts.includes(ext)) {
            cb(null, true);
        } else if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            const error = new Error('不支持的文件格式，仅支持 JSON、CSV、Excel 格式');
            req.fileValidationError = error.message;
            cb(error);
        }
    }
});

// 下载导入模板
router.get('/import/template/:format', async (req, res) => {
    try {
        const { format } = req.params;
        
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

// 上传文件并创建导入任务
router.post('/import', (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            // multer错误处理
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ error: '文件大小超过限制，最大支持50MB' });
                }
                return res.status(400).json({ error: `文件上传错误: ${err.message}` });
            }
            // 其他错误
            if (err.message) {
                return res.status(400).json({ error: err.message });
            }
            return res.status(400).json({ error: '文件上传失败' });
        }
        next();
    });
}, async (req, res) => {
    try {
        // 检查是否有文件上传错误
        if (req.fileValidationError) {
            return res.status(400).json({ error: req.fileValidationError });
        }

        if (!req.file) {
            return res.status(400).json({ error: '请选择要上传的文件' });
        }

        // 确保文件对象完整
        if (!req.file.path || !req.file.originalname) {
            return res.status(400).json({ error: '文件上传不完整，请重试' });
        }

        const filePath = req.file.path;
        const originalName = req.file.originalname || 'unknown';
        const ext = path.extname(originalName).toLowerCase();

        // 根据文件扩展名确定格式
        let format = 'json';
        if (ext === '.xlsx' || ext === '.xls') {
            format = 'xlsx';
        } else if (ext === '.csv') {
            format = 'csv';
        } else if (ext === '.json') {
            format = 'json';
        } else {
            // 删除上传的文件
            fs.unlinkSync(filePath);
            return res.status(400).json({ error: '不支持的文件格式，仅支持 JSON、CSV、Excel 格式' });
        }

        // 快速统计数据条数
        let recordCount = 0;
        try {
            recordCount = await countRecords(filePath, format);
            console.log(`文件统计完成，共 ${recordCount} 条记录`);
        } catch (error) {
            console.error('统计记录数失败:', error);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            return res.status(400).json({ 
                error: `文件解析失败: ${error.message}`,
                details: error.stack 
            });
        }

        // 所有导入都使用异步方式（无论数据量多少）
        // 创建导入任务
        const taskId = importTaskManager.createTask(format, originalName);
        console.log(`创建导入任务: ${taskId}, 记录数: ${recordCount}`);

        // 异步执行导入任务
        importUsers(prisma, filePath, format, taskId)
            .then(() => {
                // 导入完成后删除上传的文件
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            })
            .catch(error => {
                console.error('导入任务失败:', error);
                // 导入失败也删除文件
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });

        // 立即返回任务ID，不等待导入完成
        res.json({
            taskId,
            message: '导入任务已创建（异步导入）',
            status: 'pending',
            format: format,
            recordCount: recordCount
        });
    } catch (error) {
        console.error('创建导入任务失败:', error);
        console.error('错误详情:', error.stack);
        // 如果文件已上传，删除它
        if (req.file && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkError) {
                console.error('删除文件失败:', unlinkError);
            }
        }
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ 
            error: error.message || '创建导入任务失败', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// 查询导入任务状态
router.get('/import/:taskId/status', async (req, res) => {
    try {
        const { taskId } = req.params;
        const task = importTaskManager.getTask(taskId);

        if (!task) {
            return res.status(404).json({ error: '任务不存在' });
        }

        res.json({
            taskId: task.taskId,
            status: task.status,
            progress: task.progress,
            format: task.format,
            fileName: task.fileName,
            error: task.error,
            totalRecords: task.totalRecords,
            processedRecords: task.processedRecords,
            successRecords: task.successRecords,
            failedRecords: task.failedRecords,
            errors: task.errors
        });
    } catch (error) {
        console.error('查询导入任务状态失败:', error);
        res.status(500).json({ error: '查询导入任务状态失败', details: error.message });
    }
});

module.exports = router;

