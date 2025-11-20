/**
 * 导出任务管理器
 * 用于管理异步导出任务的状态和进度
 */

class ExportTaskManager {
    constructor() {
        // 存储任务信息：{ taskId: { status, progress, format, fileName, filePath, error, createdAt } }
        this.tasks = new Map();
        // 清理过期任务（24小时后）
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredTasks();
        }, 60 * 60 * 1000); // 每小时清理一次
    }

    /**
     * 创建新任务
     */
    createTask(format, searchName = null) {
        const taskId = `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const task = {
            taskId,
            status: 'pending', // pending, processing, completed, failed
            progress: 0,
            format,
            searchName,
            fileName: null,
            filePath: null,
            error: null,
            createdAt: new Date(),
            totalRecords: 0,
            processedRecords: 0
        };
        this.tasks.set(taskId, task);
        return taskId;
    }

    /**
     * 获取任务信息
     */
    getTask(taskId) {
        return this.tasks.get(taskId);
    }

    /**
     * 更新任务状态
     */
    updateTask(taskId, updates) {
        const task = this.tasks.get(taskId);
        if (task) {
            Object.assign(task, updates);
            // 计算进度百分比
            if (task.totalRecords > 0) {
                task.progress = Math.min(100, Math.round((task.processedRecords / task.totalRecords) * 100));
            }
        }
        return task;
    }

    /**
     * 清理过期任务（24小时）
     */
    cleanupExpiredTasks() {
        const now = new Date();
        const expireTime = 24 * 60 * 60 * 1000; // 24小时

        for (const [taskId, task] of this.tasks.entries()) {
            if (now - task.createdAt > expireTime) {
                this.tasks.delete(taskId);
            }
        }
    }

    /**
     * 销毁管理器（清理定时器）
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}

// 单例模式
const taskManager = new ExportTaskManager();

module.exports = taskManager;

