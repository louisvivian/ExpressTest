const { PrismaClient } = require('@prisma/client');

// Prisma 客户端配置
// Prisma 会自动从环境变量 DATABASE_URL 读取数据库连接
// 在 serverless 环境中，Prisma 会管理连接池
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  errorFormat: 'pretty',
});

// 优雅关闭连接
// 注意：在 serverless 环境（如 Vercel）中，不要主动断开连接
// 连接会在函数执行完毕后自动管理
const gracefulShutdown = async () => {
  try {
    await prisma.$disconnect();
    console.log('数据库连接已关闭');
  } catch (error) {
    console.error('关闭数据库连接时出错:', error);
  }
};

// 只在非 serverless 环境中注册退出处理程序
// beforeExit 在 serverless 环境中可能会过早触发，导致连接被关闭
if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  // 移除 beforeExit，因为它可能在 serverless 环境中过早触发
  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

module.exports = prisma;

