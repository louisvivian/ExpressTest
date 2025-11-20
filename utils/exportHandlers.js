const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const taskManager = require('./exportTaskManager');

/**
 * 导出用户数据
 */
async function exportUsers(prisma, format, searchName = null, taskId = null) {
    try {
        // 构建查询条件
        const where = {};
        if (searchName) {
            where.name = {
                contains: searchName,
                mode: 'insensitive'
            };
        }

        // 先获取总数
        const total = await prisma.executeWithRetry((p) => 
            p.user.count({ where })
        );

        if (taskId) {
            taskManager.updateTask(taskId, {
                status: 'processing',
                totalRecords: total,
                processedRecords: 0,
                progress: 0
            });
        }

        // 批量获取数据（每次1000条）
        const batchSize = 1000;
        const batches = Math.ceil(total / batchSize);
        let allUsers = [];

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

            // 更新进度
            if (taskId) {
                taskManager.updateTask(taskId, {
                    processedRecords: allUsers.length,
                    progress: Math.min(100, Math.round((allUsers.length / total) * 100))
                });
            }
        }

        // 准备导出目录
        const exportDir = path.join(__dirname, '../exports');
        if (!fs.existsSync(exportDir)) {
            fs.mkdirSync(exportDir, { recursive: true });
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

        if (taskId) {
            taskManager.updateTask(taskId, {
                status: 'completed',
                progress: 100,
                fileName,
                filePath,
                processedRecords: allUsers.length
            });
        }

        return { fileName, filePath, totalRecords: allUsers.length };
    } catch (error) {
        if (taskId) {
            taskManager.updateTask(taskId, {
                status: 'failed',
                error: error.message
            });
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

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

    return { fileName, filePath };
}

/**
 * 导出为Excel格式
 */
async function exportToExcel(users, exportDir, taskId) {
    const fileName = `users_${Date.now()}.xlsx`;
    const filePath = path.join(exportDir, fileName);

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
    XLSX.writeFile(workbook, filePath);

    return { fileName, filePath };
}

/**
 * 导出为CSV格式
 */
async function exportToCSV(users, exportDir, taskId) {
    const fileName = `users_${Date.now()}.csv`;
    const filePath = path.join(exportDir, fileName);

    // CSV头部（带BOM以支持Excel正确显示中文）
    const BOM = '\uFEFF';
    let csvContent = BOM + 'ID,用户名,创建时间,更新时间\n';

    users.forEach(user => {
        const name = user.name.replace(/"/g, '""'); // 转义双引号
        const createdAt = new Date(user.createdAt).toLocaleString('zh-CN');
        const updatedAt = new Date(user.updatedAt).toLocaleString('zh-CN');
        csvContent += `${user.id},"${name}","${createdAt}","${updatedAt}"\n`;
    });

    fs.writeFileSync(filePath, csvContent, 'utf8');

    return { fileName, filePath };
}

module.exports = {
    exportUsers
};

