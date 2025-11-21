const path = require('path');
const fs = require('fs');

/**
 * 检查是否在 Vercel 环境中
 */
function isVercel() {
    return process.env.VERCEL === '1' || !!process.env.VERCEL_ENV;
}

/**
 * 检查是否在 serverless 环境中
 */
function isServerless() {
    return isVercel() || !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.NETLIFY;
}

/**
 * 检查是否在开发环境中
 */
function isDevelopment() {
    return process.env.NODE_ENV === 'development';
}

/**
 * 获取上传文件目录路径
 */
function getUploadsDir() {
    const uploadsDir = isVercel() 
        ? '/tmp/uploads' 
        : path.join(__dirname, '../uploads');
    
    // 确保目录存在
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    return uploadsDir;
}

/**
 * 获取导出文件目录路径
 */
function getExportsDir() {
    const exportsDir = isVercel() 
        ? '/tmp/exports' 
        : path.join(__dirname, '../exports');
    
    // 确保目录存在
    if (!fs.existsSync(exportsDir)) {
        fs.mkdirSync(exportsDir, { recursive: true });
    }
    
    return exportsDir;
}

/**
 * 获取模板文件目录路径
 */
function getTemplatesDir() {
    const templatesDir = isVercel() 
        ? '/tmp/templates' 
        : path.join(__dirname, '../templates');
    
    // 确保目录存在
    if (!fs.existsSync(templatesDir)) {
        fs.mkdirSync(templatesDir, { recursive: true });
    }
    
    return templatesDir;
}

module.exports = {
    isVercel,
    isServerless,
    isDevelopment,
    getUploadsDir,
    getExportsDir,
    getTemplatesDir
};

