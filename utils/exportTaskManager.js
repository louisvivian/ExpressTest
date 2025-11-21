/**
 * 导出任务管理器
 * 用于管理异步导出任务的状态和进度
 * 在 Vercel 无服务器环境中使用数据库存储任务，确保任务状态在不同实例间共享
 */

const prisma = require('../prisma/client');

class ExportTaskManager {
    /**
     * 确保 Prisma Client 已正确初始化
     */
    _ensurePrismaReady() {
        if (!prisma) {
            console.error('[任务管理器] Prisma Client 未初始化');
            throw new Error('Prisma Client 未初始化。请检查 prisma/client.js 是否正确导出');
        }
        
        console.log('[任务管理器] Prisma Client 已初始化');
        console.log('[任务管理器] Prisma Client 类型:', typeof prisma);
        console.log('[任务管理器] Prisma Client 键数量:', Object.keys(prisma).length);
        
        // 检查 exportTask 模型
        if (!prisma.exportTask) {
            const availableModels = Object.keys(prisma).filter(key => 
                !key.startsWith('$') && typeof prisma[key] === 'object' && prisma[key] !== null
            );
            console.error('[任务管理器] exportTask 模型不存在');
            console.error('[任务管理器] 可用模型:', availableModels);
            throw new Error(
                `Prisma Client 中未找到 exportTask 模型。` +
                `可用模型: ${availableModels.length > 0 ? availableModels.join(', ') : '无'}. ` +
                `请确保已运行 "prisma generate" 并且 schema.prisma 中包含 ExportTask 模型定义。`
            );
        }
        
        console.log('[任务管理器] exportTask 模型可用');
    }

    /**
     * 创建新任务
     */
    async createTask(format, searchName = null) {
        // 确保 Prisma Client 已准备好
        this._ensurePrismaReady();
        
        const taskId = `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const task = await prisma.exportTask.create({
            data: {
                taskId,
                status: 'pending', // pending, processing, completed, failed
                progress: 0,
                format,
                searchName,
                fileName: null,
                filePath: null,
                error: null,
                totalRecords: 0,
                processedRecords: 0
            }
        });
        
        return taskId;
    }

    /**
     * 获取任务信息
     */
    async getTask(taskId) {
        this._ensurePrismaReady();
        
        const task = await prisma.exportTask.findUnique({
            where: { taskId }
        });
        
        if (!task) {
            return null;
        }
        
        // 转换为普通对象，保持向后兼容
        return {
            taskId: task.taskId,
            status: task.status,
            progress: task.progress,
            format: task.format,
            searchName: task.searchName,
            fileName: task.fileName,
            filePath: task.filePath,
            error: task.error,
            createdAt: task.createdAt,
            totalRecords: task.totalRecords,
            processedRecords: task.processedRecords
        };
    }

    /**
     * 更新任务状态
     */
    async updateTask(taskId, updates) {
        try {
            this._ensurePrismaReady();
        } catch (error) {
            console.error(`[任务管理器] updateTask 检查失败 (taskId: ${taskId}):`, error);
            throw error;
        }
        
        // 如果明确指定了 progress，优先使用指定的值
        // 否则，如果更新了 processedRecords 或 totalRecords，自动计算进度百分比
        if (updates.progress === undefined && 
            (updates.processedRecords !== undefined || updates.totalRecords !== undefined)) {
            const currentTask = await prisma.exportTask.findUnique({
                where: { taskId },
                select: { totalRecords: true, processedRecords: true }
            });
            
            const totalRecords = updates.totalRecords !== undefined 
                ? updates.totalRecords 
                : (currentTask?.totalRecords || 0);
            const processedRecords = updates.processedRecords !== undefined 
                ? updates.processedRecords 
                : (currentTask?.processedRecords || 0);
            
            if (totalRecords > 0) {
                updates.progress = Math.min(100, Math.round((processedRecords / totalRecords) * 100));
            }
        }
        
        const task = await prisma.exportTask.update({
            where: { taskId },
            data: updates
        });
        
        // 转换为普通对象，保持向后兼容
        return {
            taskId: task.taskId,
            status: task.status,
            progress: task.progress,
            format: task.format,
            searchName: task.searchName,
            fileName: task.fileName,
            filePath: task.filePath,
            error: task.error,
            createdAt: task.createdAt,
            totalRecords: task.totalRecords,
            processedRecords: task.processedRecords
        };
    }

    /**
     * 清理过期任务（24小时）
     */
    async cleanupExpiredTasks() {
        this._ensurePrismaReady();
        
        const expireTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24小时前
        
        await prisma.exportTask.deleteMany({
            where: {
                createdAt: {
                    lt: expireTime
                }
            }
        });
    }

    /**
     * 销毁管理器（无操作，因为不再使用定时器）
     */
    destroy() {
        // 不再需要清理定时器
    }
}

// 单例模式
const taskManager = new ExportTaskManager();

module.exports = taskManager;

