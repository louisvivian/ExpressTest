const { PrismaClient } = require('@prisma/client');

// 单例模式：确保 Prisma Client 只被创建一次
// 这可以避免 "prepared statement already exists" 错误
let prismaInstance = null;

// 获取或创建 Prisma Client 实例
function getPrismaClient() {
  if (!prismaInstance) {
    let databaseUrl = process.env.DATABASE_URL;
    
    // 检查是否在 Vercel 环境中（serverless 环境）
    const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;
    const isServerless = isVercel || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY;
    
    if (databaseUrl) {
      // 检查 URL 是否已经有查询参数
      const hasParams = databaseUrl.includes('?');
      let separator = hasParams ? '&' : '?';
      
      // 如果使用 Supabase 连接池（pgbouncer），需要特殊处理
      const isSupabasePooler = databaseUrl.includes('pooler.supabase.com');
      
      if (isSupabasePooler) {
        // Supabase 连接池：添加 pgbouncer 参数
        // 注意：Supabase 连接池使用事务模式，不支持 prepared statements
        if (!databaseUrl.includes('pgbouncer=true')) {
          databaseUrl = `${databaseUrl}${separator}pgbouncer=true`;
          separator = '&';
        }
        console.warn('⚠️  检测到 Supabase 连接池。如果遇到 prepared statement 错误，请考虑使用直接连接（db.supabase.com）');
      }
      
      // 在 serverless 环境中，建议使用较小的连接池
      if (isServerless) {
        // 添加连接池大小限制（serverless 环境建议使用较小的值）
        if (!databaseUrl.includes('connection_limit')) {
          databaseUrl = `${databaseUrl}${separator}connection_limit=1`;
          separator = '&';
        }
        // 添加连接超时参数
        if (!databaseUrl.includes('connect_timeout')) {
          databaseUrl = `${databaseUrl}${separator}connect_timeout=10`;
          separator = '&';
        }
        // 添加池超时参数
        if (!databaseUrl.includes('pool_timeout')) {
          databaseUrl = `${databaseUrl}${separator}pool_timeout=10`;
          separator = '&';
        }
      } else {
        // 非 serverless 环境：添加连接超时参数
        if (!databaseUrl.includes('connect_timeout')) {
          databaseUrl = `${databaseUrl}${separator}connect_timeout=10`;
          separator = '&';
        }
        // 添加连接池大小限制（避免连接过多）
        if (!databaseUrl.includes('connection_limit')) {
          databaseUrl = `${databaseUrl}${separator}connection_limit=10`;
          separator = '&';
        }
      }
    }
    
    // 在开发环境中，打印最终的连接 URL（隐藏密码）
    if (process.env.NODE_ENV === 'development') {
      const maskedUrl = databaseUrl.replace(/:([^:@]+)@/, ':****@');
      console.log('Prisma Client 连接配置:', maskedUrl);
    }
    
    // 创建 Prisma Client
    prismaInstance = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
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

// 验证 Prisma Client 是否正确生成
if (prisma) {
  console.log('[Prisma Client] 实例已创建');
  const modelKeys = Object.keys(prisma).filter(key => 
    !key.startsWith('$') && typeof prisma[key] === 'object' && prisma[key] !== null
  );
  console.log('[Prisma Client] 可用模型:', modelKeys);
  
  if (!prisma.exportTask) {
    console.warn('[Prisma Client] ⚠️  exportTask 模型不存在！');
    console.warn('[Prisma Client] 请确保已运行 "prisma generate"');
  } else {
    console.log('[Prisma Client] ✅ exportTask 模型可用');
  }
} else {
  console.error('[Prisma Client] ❌ 实例创建失败');
}

// 将 executeWithRetry 附加到 prisma 实例上，方便直接调用
// 注意：这需要在 executeWithRetry 函数定义之后执行
// 所以我们在文件末尾再次附加

// 创建一个新的 Prisma Client 实例（保留此函数以保持向后兼容，但不推荐使用）
function createNewPrismaClient() {
  // 直接返回单例实例，避免创建多个实例导致 prepared statement 冲突
  return getPrismaClient();
}

// 处理 prepared statement 错误的辅助函数
async function handlePreparedStatementError() {
  try {
    // 断开当前连接
    if (prismaInstance) {
      await prismaInstance.$disconnect().catch(() => {
        // 忽略断开连接时的错误
      });
    }
    
    // 重置实例，强制重新创建
    prismaInstance = null;
    
    // 等待一小段时间，确保连接完全关闭
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 重新创建 Prisma Client
    const newPrisma = getPrismaClient();
    
    // 重新连接
    await newPrisma.$connect();
    console.log('已重新创建 Prisma Client 连接（prepared statement 错误恢复）');
    return newPrisma;
  } catch (error) {
    console.error('重新创建 Prisma Client 时出错:', error);
    throw error;
  }
}

// 带重试的查询执行函数（用于处理 prepared statement 错误）
async function executeWithRetry(queryFn, maxRetries = 1) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const prisma = getPrismaClient();
      return await queryFn(prisma);
    } catch (error) {
      lastError = error;
      
      // 检查是否是 prepared statement 错误
      // Prisma 错误可能嵌套在 error.kind.QueryError.PostgresError 中
      const errorMessage = error.message || '';
      const errorCode = error.code || '';
      
      // 检查嵌套的错误结构（Prisma ConnectorError）
      let nestedErrorCode = '';
      let nestedErrorMessage = '';
      if (error.kind && error.kind.QueryError && error.kind.QueryError.PostgresError) {
        nestedErrorCode = error.kind.QueryError.PostgresError.code || '';
        nestedErrorMessage = error.kind.QueryError.PostgresError.message || '';
      }
      
      const isPreparedStatementError = 
        errorMessage.includes('prepared statement') ||
        errorMessage.includes('does not exist') ||
        nestedErrorMessage.includes('prepared statement') ||
        nestedErrorMessage.includes('does not exist') ||
        errorCode === '26000' ||
        nestedErrorCode === '26000';
      
      if (isPreparedStatementError && attempt < maxRetries) {
        console.warn(`Prepared statement 错误 (code: ${nestedErrorCode || errorCode})，尝试重新连接 (${attempt + 1}/${maxRetries + 1})`);
        await handlePreparedStatementError();
        // 继续重试
        continue;
      }
      
      // 如果不是 prepared statement 错误，或者已经重试完毕，抛出错误
      throw error;
    }
  }
  
  throw lastError;
}

// 预连接数据库函数（导出供 server.js 使用）
const connectPrisma = async () => {
  try {
    // Prisma Client 使用连接池，首次查询时会自动连接
    // 预连接可以确保连接池已初始化
    await prisma.$connect();
    console.log('数据库连接已建立');
  } catch (error) {
    console.error('建立数据库连接时出错:', error);
    throw error;
  }
};

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

// 将 executeWithRetry 附加到 prisma 实例上，方便直接调用
prisma.executeWithRetry = executeWithRetry;

// 导出 Prisma 实例、连接函数、关闭函数和错误处理函数
module.exports = prisma;
module.exports.connectPrisma = connectPrisma;
module.exports.disconnectPrisma = disconnectPrisma;
module.exports.handlePreparedStatementError = handlePreparedStatementError;
module.exports.createNewPrismaClient = createNewPrismaClient;
module.exports.executeWithRetry = executeWithRetry;

