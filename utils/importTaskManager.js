/**
 * 导入任务管理器
 * 用于管理异步导入任务的状态和进度
 * 使用文件系统存储任务状态，确保在 Vercel 无服务器环境中可以跨实例访问
 */

const fs = require('fs');
const path = require('path');
const { isVercel } = require('./envConfig');

class ImportTaskManager {
    constructor() {
        // 内存缓存（快速访问）
        this.tasks = new Map();
        
        // 任务存储目录
        this.tasksDir = isVercel() 
            ? '/tmp/import_tasks' 
            : path.join(__dirname, '../tmp/import_tasks');
        
        // 确保目录存在
        this._ensureTasksDir();
        
        // 清理过期任务（24小时后）
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredTasks();
        }, 60 * 60 * 1000); // 每小时清理一次
    }

    /**
     * 确保任务目录存在
     */
    _ensureTasksDir() {
        try {
            if (!fs.existsSync(this.tasksDir)) {
                fs.mkdirSync(this.tasksDir, { recursive: true });
            }
        } catch (error) {
            console.error('创建任务目录失败:', error);
        }
    }

    /**
     * 获取任务文件路径
     */
    _getTaskFilePath(taskId) {
        const safeTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
        return path.join(this.tasksDir, `${safeTaskId}.json`);
    }

    /**
     * 从文件系统读取任务
     */
    _readTaskFromFile(taskId) {
        try {
            const filePath = this._getTaskFilePath(taskId);
            if (!fs.existsSync(filePath)) {
                return null;
            }
            const content = fs.readFileSync(filePath, 'utf8');
            const task = JSON.parse(content);
            // 转换日期字符串回 Date 对象
            if (task.createdAt && typeof task.createdAt === 'string') {
                task.createdAt = new Date(task.createdAt);
            }
            return task;
        } catch (error) {
            console.error(`读取任务文件失败 (taskId: ${taskId}):`, error);
            return null;
        }
    }

    /**
     * 写入任务到文件系统
     */
    _writeTaskToFile(task) {
        try {
            this._ensureTasksDir();
            const filePath = this._getTaskFilePath(task.taskId);
            const taskToSave = {
                ...task,
                createdAt: task.createdAt instanceof Date 
                    ? task.createdAt.toISOString() 
                    : task.createdAt
            };
            fs.writeFileSync(filePath, JSON.stringify(taskToSave, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error(`写入任务文件失败 (taskId: ${task.taskId}):`, error);
            return false;
        }
    }

    /**
     * 创建新任务
     */
    createTask(format, fileName) {
        const taskId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const task = {
            taskId,
            status: 'pending', // pending, processing, completed, failed
            progress: 0,
            format,
            fileName,
            totalRecords: 0,
            processedRecords: 0,
            successRecords: 0,
            failedRecords: 0,
            errors: [],
            createdAt: new Date()
        };
        // 同时存储到内存和文件系统
        this.tasks.set(taskId, task);
        this._writeTaskToFile(task);
        return taskId;
    }

    /**
     * 获取任务信息
     * 优先从内存读取，如果内存没有，则从文件系统读取
     */
    getTask(taskId) {
        // 先从内存读取
        let task = this.tasks.get(taskId);
        if (task) {
            return task;
        }
        
        // 内存没有，从文件系统读取
        task = this._readTaskFromFile(taskId);
        if (task) {
            // 加载到内存缓存
            this.tasks.set(taskId, task);
        }
        return task;
    }

    /**
     * 更新任务状态
     */
    updateTask(taskId, updates) {
        // 先从内存或文件系统获取任务
        let task = this.tasks.get(taskId);
        if (!task) {
            task = this._readTaskFromFile(taskId);
            if (task) {
                this.tasks.set(taskId, task);
            }
        }
        
        if (task) {
            Object.assign(task, updates);
            // 计算进度百分比
            if (task.totalRecords > 0) {
                task.progress = Math.min(100, Math.round((task.processedRecords / task.totalRecords) * 100));
            }
            // 同步更新到文件系统
            this._writeTaskToFile(task);
        }
        return task;
    }

    /**
     * 添加错误信息
     */
    addError(taskId, error) {
        // 先从内存或文件系统获取任务
        let task = this.tasks.get(taskId);
        if (!task) {
            task = this._readTaskFromFile(taskId);
            if (task) {
                this.tasks.set(taskId, task);
            }
        }
        
        if (task) {
            task.errors.push(error);
            task.failedRecords++;
            // 同步更新到文件系统
            this._writeTaskToFile(task);
        }
        return task;
    }

    /**
     * 清理过期任务（24小时）
     */
    cleanupExpiredTasks() {
        const now = new Date();
        const expireTime = 24 * 60 * 60 * 1000; // 24小时

        // 清理内存中的过期任务
        for (const [taskId, task] of this.tasks.entries()) {
            if (now - task.createdAt > expireTime) {
                this.tasks.delete(taskId);
            }
        }

        // 清理文件系统中的过期任务
        try {
            if (!fs.existsSync(this.tasksDir)) {
                return;
            }
            const files = fs.readdirSync(this.tasksDir);
            for (const file of files) {
                if (!file.endsWith('.json')) {
                    continue;
                }
                const filePath = path.join(this.tasksDir, file);
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const task = JSON.parse(content);
                    const createdAt = task.createdAt 
                        ? (typeof task.createdAt === 'string' ? new Date(task.createdAt) : task.createdAt)
                        : null;
                    
                    if (createdAt && (now - createdAt > expireTime)) {
                        fs.unlinkSync(filePath);
                        console.log(`已删除过期任务文件: ${file}`);
                    }
                } catch (error) {
                    console.error(`处理任务文件失败 (${file}):`, error);
                    // 如果文件损坏，也删除它
                    try {
                        fs.unlinkSync(filePath);
                    } catch (unlinkError) {
                        console.error(`删除损坏的任务文件失败 (${file}):`, unlinkError);
                    }
                }
            }
        } catch (error) {
            console.error('清理文件系统过期任务失败:', error);
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
const taskManager = new ImportTaskManager();

module.exports = taskManager;

