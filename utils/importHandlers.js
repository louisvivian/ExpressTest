const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const taskManager = require('./importTaskManager');

/**
 * 快速统计文件中的数据条数（不解析完整数据）
 */
async function countRecords(filePath, format) {
    try {
        switch (format.toLowerCase()) {
            case 'json':
                const jsonContent = fs.readFileSync(filePath, 'utf8');
                const jsonData = JSON.parse(jsonContent);
                if (Array.isArray(jsonData)) {
                    return jsonData.length;
                } else if (jsonData.users && Array.isArray(jsonData.users)) {
                    return jsonData.users.length;
                }
                return 0;
            case 'excel':
            case 'xlsx':
                const workbook = XLSX.readFile(filePath);
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const data = XLSX.utils.sheet_to_json(worksheet);
                return data.length;
            case 'csv':
                const csvContent = fs.readFileSync(filePath, 'utf8');
                const lines = csvContent.split('\n').filter(line => line.trim() !== '');
                return Math.max(0, lines.length - 1); // 减去表头
            default:
                return 0;
        }
    } catch (error) {
        throw new Error(`统计数据条数失败: ${error.message}`);
    }
}

/**
 * 导入用户数据
 */
async function importUsers(prisma, filePath, format, taskId = null) {
    try {
        // 解析文件
        let users = [];
        
        switch (format.toLowerCase()) {
            case 'json':
                users = await parseJSONFile(filePath, taskId);
                break;
            case 'excel':
            case 'xlsx':
                users = await parseExcelFile(filePath, taskId);
                break;
            case 'csv':
                users = await parseCSVFile(filePath, taskId);
                break;
            default:
                throw new Error(`不支持的导入格式: ${format}`);
        }

        if (!users || users.length === 0) {
            throw new Error('文件中没有有效的数据');
        }

        const totalRecords = users.length;

        if (taskId) {
            taskManager.updateTask(taskId, {
                status: 'processing',
                totalRecords: totalRecords,
                processedRecords: 0,
                progress: 0
            });
        }

        // 批量导入数据
        const batchSize = 100;
        let successCount = 0;
        let failCount = 0;
        let processedCount = 0;

        for (let i = 0; i < users.length; i += batchSize) {
            const batch = users.slice(i, i + batchSize);
            
            for (let j = 0; j < batch.length; j++) {
                const userData = batch[j];
                processedCount++;
                
                try {
                    // 验证数据
                    if (!userData.name || typeof userData.name !== 'string' || userData.name.trim() === '') {
                        throw new Error('用户名不能为空');
                    }

                    // 创建用户
                    await prisma.executeWithRetry((p) =>
                        p.user.create({
                            data: {
                                name: userData.name.trim()
                            }
                        })
                    );

                    successCount++;
                } catch (error) {
                    failCount++;
                    const errorMsg = `第 ${processedCount} 行: ${error.message}`;
                    if (taskId) {
                        taskManager.addError(taskId, errorMsg);
                    }
                    console.error(`导入失败: ${errorMsg}`);
                }

                // 更新进度
                if (taskId) {
                    taskManager.updateTask(taskId, {
                        processedRecords: processedCount,
                        successRecords: successCount,
                        failedRecords: failCount
                    });
                }
            }
        }

        if (taskId) {
            taskManager.updateTask(taskId, {
                status: 'completed',
                progress: 100,
                processedRecords: totalRecords,
                successRecords: successCount,
                failedRecords: failCount
            });
        }

        return {
            totalRecords,
            successRecords: successCount,
            failedRecords: failCount
        };
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
 * 解析JSON文件
 */
async function parseJSONFile(filePath, taskId) {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(fileContent);

        // 支持两种格式：
        // 1. { users: [...] } - 导出格式
        // 2. [...] - 数组格式
        let users = [];
        if (Array.isArray(data)) {
            users = data;
        } else if (data.users && Array.isArray(data.users)) {
            users = data.users;
        } else {
            throw new Error('JSON格式不正确，需要数组或包含users字段的对象');
        }

        // 转换数据格式，过滤掉null和无效数据
        return users
            .map((item, index) => {
                // 如果已经是对象格式，直接使用
                if (typeof item === 'object' && item !== null) {
                    const name = item.name || item.用户名 || item['用户名'];
                    if (!name) {
                        throw new Error(`第 ${index + 1} 行缺少用户名字段`);
                    }
                    return {
                        name: String(name).trim()
                    };
                }
                throw new Error(`第 ${index + 1} 行数据格式不正确`);
            })
            .filter(item => item !== null && item.name); // 过滤掉无效项
    } catch (error) {
        throw new Error(`解析JSON文件失败: ${error.message}`);
    }
}

/**
 * 解析Excel文件
 */
async function parseExcelFile(filePath, taskId) {
    try {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // 转换为JSON格式
        const data = XLSX.utils.sheet_to_json(worksheet);

        if (!data || data.length === 0) {
            throw new Error('Excel文件中没有数据');
        }

        // 转换数据格式，支持中英文列名
        return data.map((row, index) => {
            const name = row.name || row.用户名 || row['用户名'] || row.Name || row['Name'];
            
            if (!name) {
                throw new Error(`第 ${index + 2} 行缺少用户名字段`);
            }

            return {
                name: String(name).trim()
            };
        });
    } catch (error) {
        throw new Error(`解析Excel文件失败: ${error.message}`);
    }
}

/**
 * 解析CSV文件
 */
async function parseCSVFile(filePath, taskId) {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.split('\n').filter(line => line.trim() !== '');
        
        if (lines.length < 2) {
            throw new Error('CSV文件至少需要包含表头和数据行');
        }

        // 解析表头
        const headerLine = lines[0];
        // 移除BOM（如果存在）
        const cleanHeader = headerLine.replace(/^\uFEFF/, '');
        const headers = parseCSVLine(cleanHeader);
        
        // 查找用户名列的索引
        const nameIndex = headers.findIndex(h => 
            h.toLowerCase() === 'name' || 
            h === '用户名' || 
            h === 'Name' ||
            h === 'NAME'
        );

        if (nameIndex === -1) {
            throw new Error('CSV文件中找不到用户名列（name或用户名）');
        }

        // 解析数据行
        const users = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            try {
                const values = parseCSVLine(line);
                const name = values[nameIndex];
                
                if (!name || name.trim() === '') {
                    throw new Error(`第 ${i + 1} 行用户名为空`);
                }

                users.push({
                    name: name.trim()
                });
            } catch (error) {
                throw new Error(`第 ${i + 1} 行数据解析失败: ${error.message}`);
            }
        }

        return users;
    } catch (error) {
        throw new Error(`解析CSV文件失败: ${error.message}`);
    }
}

/**
 * 解析CSV行（处理引号和逗号）
 */
function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // 转义的双引号
                current += '"';
                i++; // 跳过下一个引号
            } else {
                // 切换引号状态
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // 字段分隔符
            values.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    // 添加最后一个字段
    values.push(current);

    // 移除字段两端的引号
    return values.map(v => v.replace(/^"|"$/g, ''));
}

/**
 * 生成导入模板文件
 */
function generateTemplate(format) {
    const templateDir = path.join(__dirname, '../templates');
    if (!fs.existsSync(templateDir)) {
        fs.mkdirSync(templateDir, { recursive: true });
    }

    const sampleData = [
        { name: '张三' },
        { name: '李四' },
        { name: '王五' }
    ];

    let fileName;
    let filePath;

    switch (format.toLowerCase()) {
        case 'json':
            fileName = 'import_template.json';
            filePath = path.join(templateDir, fileName);
            const jsonData = {
                users: sampleData
            };
            fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf8');
            break;

        case 'excel':
        case 'xlsx':
            fileName = 'import_template.xlsx';
            filePath = path.join(templateDir, fileName);
            const workbook = XLSX.utils.book_new();
            const worksheetData = [
                ['用户名'], // 表头
                ...sampleData.map(item => [item.name])
            ];
            const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
            worksheet['!cols'] = [{ wch: 30 }];
            XLSX.utils.book_append_sheet(workbook, worksheet, '用户列表');
            XLSX.writeFile(workbook, filePath);
            break;

        case 'csv':
            fileName = 'import_template.csv';
            filePath = path.join(templateDir, fileName);
            const BOM = '\uFEFF';
            let csvContent = BOM + '用户名\n';
            sampleData.forEach(item => {
                csvContent += `"${item.name}"\n`;
            });
            fs.writeFileSync(filePath, csvContent, 'utf8');
            break;

        default:
            throw new Error(`不支持的模板格式: ${format}`);
    }

    return { fileName, filePath };
}

module.exports = {
    importUsers,
    generateTemplate,
    countRecords
};

