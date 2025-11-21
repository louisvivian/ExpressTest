-- 创建 ExportTask 表
CREATE TABLE IF NOT EXISTS "export_task" (
    "taskId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "format" TEXT NOT NULL,
    "searchName" TEXT,
    "fileName" TEXT,
    "filePath" TEXT,
    "error" TEXT,
    "totalRecords" INTEGER NOT NULL DEFAULT 0,
    "processedRecords" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "export_task_pkey" PRIMARY KEY ("taskId")
);

