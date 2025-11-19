const { PrismaClient } = require('@prisma/client');

// 单例模式：确保 Prisma Client 只被创建一次
// 这可以避免 "prepared statement already exists" 错误
let prismaInstance = null;

// 获取或创建 Prisma Client 实例
function getPrismaClient() {
  if (!prismaInstance) {
    let databaseUrl = process.env.DATABASE_URL;
    
    // 在开发环境中，修改 DATABASE_URL 以避免 prepared statement 冲突
    if (process.env.NODE_ENV !== 'production' && databaseUrl) {
      // 检查 URL 是否已经有查询参数
      const hasParams = databaseUrl.includes('?');
      const separator = hasParams ? '&' : '?';
      
      // 添加 connection_limit=1 来限制连接数，减少 prepared statement 冲突
      if (!databaseUrl.includes('connection_limit')) {
        databaseUrl = `${databaseUrl}${separator}connection_limit=1`;
      }
    }
    
    // 创建 Prisma Client，直接传入修改后的 URL
    prismaInstance = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      errorFormat: 'pretty',
      datasources: {
        db: {
          url: databaseUrl
        }
      }
    });
  }
  
  return prismaInstance;
}

// 创建并导出 Prisma Client 实例
const prisma = getPrismaClient();

// 处理 prepared statement 错误的辅助函数
async function handlePreparedStatementError() {
  try {
    // 断开当前连接
    await prisma.$disconnect();
    // 重置实例，强制重新创建
    prismaInstance = null;
    // 重新创建 Prisma Client
    const newPrisma = getPrismaClient();
    // 重新连接
    await newPrisma.$connect();
    console.log('已重新创建 Prisma Client 连接');
    return newPrisma;
  } catch (error) {
    console.error('重新创建 Prisma Client 时出错:', error);
    throw error;
  }
}

// 优雅关闭连接函数（导出供 server.js 使用）
// 注意：在 serverless 环境（如 Vercel）中，不要主动断开连接
// 连接会在函数执行完毕后自动管理
const disconnectPrisma = async () => {
  try {
    await prisma.$disconnect();
    console.log('数据库连接已关闭');
  } catch (error) {
    console.error('关闭数据库连接时出错:', error);
  }
};

// 导出 Prisma 实例、关闭函数和错误处理函数
module.exports = prisma;
module.exports.disconnectPrisma = disconnectPrisma;
module.exports.handlePreparedStatementError = handlePreparedStatementError;

