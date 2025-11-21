const multer = require('multer');
const path = require('path');
const { getUploadsDir } = require('./envConfig');

/**
 * 创建 multer 存储配置
 */
function createMulterStorage() {
    return multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, getUploadsDir());
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname);
            cb(null, `import_${uniqueSuffix}${ext}`);
        }
    });
}

/**
 * 文件过滤器：验证文件格式
 */
function fileFilter(req, file, cb) {
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

/**
 * 创建配置好的 multer 实例
 */
function createUploadMiddleware() {
    return multer({
        storage: createMulterStorage(),
        limits: {
            fileSize: 50 * 1024 * 1024 // 50MB
        },
        fileFilter: fileFilter
    });
}

module.exports = {
    createMulterStorage,
    fileFilter,
    createUploadMiddleware
};

