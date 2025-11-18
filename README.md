# ExpressTest

一个基于 Express.js 和 Prisma 的 RESTful API 项目。

## 技术栈

- **Node.js** - JavaScript 运行时环境
- **Express.js** - Web 应用框架
- **Prisma** - 现代化 ORM
- **PostgreSQL** - 关系型数据库

## 项目结构

```
ExpressTest/
├── server.js          # Express 服务器入口文件
├── routes.js          # API 路由定义
├── prisma/
│   ├── schema.prisma  # Prisma 数据模型定义
│   └── client.js      # Prisma 客户端
├── prisma.config.ts   # Prisma 配置文件
└── package.json       # 项目依赖配置
```

## 安装依赖

```bash
npm install
```

## 环境配置

创建 `.env` 文件并配置数据库连接：

```env
DATABASE_URL="postgresql://用户名:密码@localhost:5432/数据库名"
```

## 数据库设置

1. 生成 Prisma 客户端：
```bash
npm run prisma:generate
```

2. 运行数据库迁移：
```bash
npm run prisma:migrate
```

或者直接推送数据库架构：
```bash
npm run prisma:push
```

## 启动项目

```bash
node server.js
```

服务器将在 `http://localhost:3000` 启动。

## API 接口

### 用户相关接口

- `GET /api/users` - 获取所有用户列表
- `GET /api/users/:id` - 根据 ID 获取单个用户
- `POST /api/users` - 创建新用户
  - 请求体：`{ "name": "用户名" }`

### 信息视图接口

- `GET /api/infoViews` - 获取所有信息视图列表

## 可用脚本

- `npm run prisma:generate` - 生成 Prisma 客户端
- `npm run prisma:migrate` - 运行数据库迁移
- `npm run prisma:push` - 推送数据库架构变更
- `npm run prisma:studio` - 打开 Prisma Studio 数据库管理界面

