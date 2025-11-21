const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const taskManager = require('./exportTaskManager');

/**
 * 导出用户数据
 */
async function exportUsers(prisma, format, searchName = null, taskId = null) {
    console.log(`[导出任务 ${taskId}] ========== 函数开始执行 ==========`);
    console.log(`[导出任务 ${taskId}] 参数: format=${format}, searchName=${searchName}, taskId=${taskId}`);
    
    try {
        // 立即更新任务状态为 processing，确认函数已被调用
        if (taskId) {
            try {
                console.log(`[导出任务 ${taskId}] 步骤1: 准备更新任务状态为 processing...`);
                console.log(`[导出任务 ${taskId}] taskManager 类型:`, typeof taskManager);
                console.log(`[导出任务 ${taskId}] taskManager.updateTask 类型:`, typeof taskManager.updateTask);
                
                const updatePromise = taskManager.updateTask(taskId, {
                    status: 'processing',
                    progress: 1
                });
                console.log(`[导出任务 ${taskId}] 步骤2: updateTask Promise 已创建，等待结果...`);
                
                await updatePromise;
                console.log(`[导出任务 ${taskId}] 步骤3: 任务状态已更新为 processing`);
            } catch (updateError) {
                console.error(`[导出任务 ${taskId}] ========== 更新任务状态失败 ==========`);
                console.error(`[导出任务 ${taskId}] 错误类型:`, updateError.constructor.name);
                console.error(`[导出任务 ${taskId}] 错误消息:`, updateError.message);
                console.error(`[导出任务 ${taskId}] 错误堆栈:`, updateError.stack);
                // 继续执行，不因为状态更新失败而中断
                // 但如果 Prisma 有问题，后续操作也会失败，所以这里记录详细错误
            }
        } else {
            console.log(`[导出任务 ${taskId}] 警告: taskId 为空，跳过状态更新`);
        }
        
        console.log(`[导出任务 ${taskId}] 格式: ${format}, 搜索名称: ${searchName || '无'}`);
        
        // 检查 prisma 对象
        if (!prisma) {
            console.error(`[导出任务 ${taskId}] Prisma Client 未初始化`);
            throw new Error('Prisma Client 未初始化');
        }
        
        console.log(`[导出任务 ${taskId}] Prisma Client 已初始化`);
        console.log(`[导出任务 ${taskId}] Prisma Client 类型:`, typeof prisma);
        console.log(`[导出任务 ${taskId}] Prisma Client 可用方法:`, Object.keys(prisma).filter(k => !k.startsWith('$')).slice(0, 10));
        
        // 检查 executeWithRetry 方法
        if (typeof prisma.executeWithRetry !== 'function') {
            console.error(`[导出任务 ${taskId}] prisma.executeWithRetry 不存在`);
            console.error(`[导出任务 ${taskId}] prisma 对象键:`, Object.keys(prisma));
            throw new Error('prisma.executeWithRetry 方法不可用。请检查 prisma/client.js 是否正确导出');
        }
        
        console.log(`[导出任务 ${taskId}] prisma.executeWithRetry 方法可用`);
        
        // 构建查询条件
        const where = {};
        if (searchName) {
            where.name = {
                contains: searchName,
                mode: 'insensitive'
            };
        }

        console.log(`[导出任务 ${taskId}] 查询条件:`, JSON.stringify(where));
        
        // 先获取总数
        console.log(`[导出任务 ${taskId}] 开始查询总数...`);
        const total = await prisma.executeWithRetry((p) => 
            p.user.count({ where })
        );
        
        console.log(`[导出任务 ${taskId}] 找到 ${total} 条记录`);

        if (taskId) {
            await taskManager.updateTask(taskId, {
                status: 'processing',
                totalRecords: total,
                processedRecords: 0,
                progress: 2
            });
        }

        // 批量获取数据（每次1000条）
        const batchSize = 1000;
        const batches = Math.ceil(total / batchSize);
        let allUsers = [];

        // 数据获取阶段占进度的 0-95%（参考导入逻辑，根据实际处理记录数计算）
        // 文件写入阶段占 95-100%
        const dataFetchProgressMax = 95;

        for (let i = 0; i < batches; i++) {
            const skip = i * batchSize;
            const users = await prisma.executeWithRetry((p) =>
                p.user.findMany({
                    where,
                    skip,
                    take: batchSize,
                    orderBy: {
                        createdAt: 'desc'
                    }
                })
            );

            allUsers = allUsers.concat(users);

            // 更新进度：只更新 processedRecords，让系统根据实际记录数自动计算进度
            // 进度限制在 0-95%（数据获取阶段）
            if (taskId) {
                // 计算实际进度（0-95%）
                const actualProgress = total > 0 
                    ? Math.min(dataFetchProgressMax, Math.round((allUsers.length / total) * dataFetchProgressMax))
                    : 0;
                
                await taskManager.updateTask(taskId, {
                    processedRecords: allUsers.length,
                    progress: actualProgress
                });
            }
        }

        // 准备导出目录
        // Vercel 环境使用 /tmp 目录，本地开发使用项目目录
        const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;
        const exportDir = isVercel 
            ? '/tmp/exports' 
            : path.join(__dirname, '../exports');
        if (!fs.existsSync(exportDir)) {
            fs.mkdirSync(exportDir, { recursive: true });
        }

        // 更新进度：开始文件写入阶段（95%）
        if (taskId) {
            await taskManager.updateTask(taskId, {
                progress: 95
            });
        }

        // 根据格式导出
        let fileName;
        let filePath;

        switch (format.toLowerCase()) {
            case 'json':
                ({ fileName, filePath } = await exportToJSON(allUsers, exportDir, taskId));
                break;
            case 'excel':
            case 'xlsx':
                ({ fileName, filePath } = await exportToExcel(allUsers, exportDir, taskId));
                break;
            case 'csv':
                ({ fileName, filePath } = await exportToCSV(allUsers, exportDir, taskId));
                break;
            default:
                throw new Error(`不支持的导出格式: ${format}`);
        }

        // 更新进度：文件写入完成（98%）
        if (taskId) {
            await taskManager.updateTask(taskId, {
                progress: 98
            });
        }

        if (taskId) {
            await taskManager.updateTask(taskId, {
                status: 'completed',
                progress: 100,
                fileName,
                filePath,
                processedRecords: allUsers.length
            });
        }

        console.log(`[导出任务 ${taskId}] 导出完成，文件: ${fileName}, 记录数: ${allUsers.length}`);
        return { fileName, filePath, totalRecords: allUsers.length };
    } catch (error) {
        console.error(`[导出任务 ${taskId}] 导出过程中发生错误:`, error);
        console.error(`[导出任务 ${taskId}] 错误堆栈:`, error.stack);
        
        if (taskId) {
            try {
                await taskManager.updateTask(taskId, {
                    status: 'failed',
                    error: error.message || String(error)
                });
                console.log(`[导出任务 ${taskId}] 任务状态已更新为 failed`);
            } catch (updateError) {
                console.error(`[导出任务 ${taskId}] 更新任务状态为失败时出错:`, updateError);
            }
        }
        throw error;
    }
}

/**
 * 导出为JSON格式
 */
async function exportToJSON(users, exportDir, taskId) {
    const fileName = `users_${Date.now()}.json`;
    const filePath = path.join(exportDir, fileName);

    // 更新进度：准备数据（96%）
    if (taskId) {
        await taskManager.updateTask(taskId, { progress: 96 });
    }

    const data = {
        exportTime: new Date().toISOString(),
        total: users.length,
        users: users.map(user => ({
            id: user.id,
            name: user.name,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        }))
    };

    // 更新进度：写入文件（98%）
    if (taskId) {
        await taskManager.updateTask(taskId, { progress: 98 });
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

    return { fileName, filePath };
}

/**
 * 导出为Excel格式
 */
async function exportToExcel(users, exportDir, taskId) {
    const fileName = `users_${Date.now()}.xlsx`;
    const filePath = path.join(exportDir, fileName);

    // 更新进度：准备数据（96%）
    if (taskId) {
        await taskManager.updateTask(taskId, { progress: 96 });
    }

    // 准备数据
    const worksheetData = [
        ['ID', '用户名', '创建时间', '更新时间']
    ];

    users.forEach(user => {
        worksheetData.push([
            user.id,
            user.name,
            new Date(user.createdAt).toLocaleString('zh-CN'),
            new Date(user.updatedAt).toLocaleString('zh-CN')
        ]);
    });

    // 更新进度：创建工作簿（97%）
    if (taskId) {
        await taskManager.updateTask(taskId, { progress: 97 });
    }

    // 创建工作簿和工作表
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    // 设置列宽
    worksheet['!cols'] = [
        { wch: 10 }, // ID
        { wch: 30 }, // 用户名
        { wch: 20 }, // 创建时间
        { wch: 20 }  // 更新时间
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, '用户列表');
    
    // 更新进度：写入文件（98%）
    if (taskId) {
        await taskManager.updateTask(taskId, { progress: 98 });
    }
    
    XLSX.writeFile(workbook, filePath);

    return { fileName, filePath };
}

/**
 * 导出为CSV格式
 */
async function exportToCSV(users, exportDir, taskId) {
    const fileName = `users_${Date.now()}.csv`;
    const filePath = path.join(exportDir, fileName);

    // 更新进度：准备数据（96%）
    if (taskId) {
        await taskManager.updateTask(taskId, { progress: 96 });
    }

    // CSV头部（带BOM以支持Excel正确显示中文）
    const BOM = '\uFEFF';
    let csvContent = BOM + 'ID,用户名,创建时间,更新时间\n';

    // 分批处理数据，更新进度
    const chunkSize = Math.max(100, Math.floor(users.length / 10)); // 至少分10批
    for (let i = 0; i < users.length; i += chunkSize) {
        const chunk = users.slice(i, i + chunkSize);
        chunk.forEach(user => {
            const name = user.name.replace(/"/g, '""'); // 转义双引号
            const createdAt = new Date(user.createdAt).toLocaleString('zh-CN');
            const updatedAt = new Date(user.updatedAt).toLocaleString('zh-CN');
            csvContent += `${user.id},"${name}","${createdAt}","${updatedAt}"\n`;
        });

        // 更新进度：处理数据（96-98%）
        if (taskId && i + chunkSize < users.length) {
            const progress = 96 + Math.round((i / users.length) * 2);
            await taskManager.updateTask(taskId, { progress });
        }
    }

    // 更新进度：写入文件（98%）
    if (taskId) {
        await taskManager.updateTask(taskId, { progress: 98 });
    }

    fs.writeFileSync(filePath, csvContent, 'utf8');

    return { fileName, filePath };
}

module.exports = {
    exportUsers
};

