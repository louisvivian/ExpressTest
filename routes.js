const express = require('express');
const router = express.Router();
const prisma = require('./prisma/client');
const { getUsersList, getUserById, createUser, deleteUser } = require('./utils/userHandlers');
const { handleDatabaseError } = require('./utils/dbErrorHandler');

// 获取所有用户（支持分页）
router.get('/users', async (req, res) => {
    await getUsersList(req, res, prisma);
});

// 获取单个用户
router.get('/users/:id', async (req, res) => {
    await getUserById(req, res, prisma, req.params.id);
});

// 添加新用户
router.post('/users', async (req, res) => {
    await createUser(req, res, prisma);
});

// 删除用户
router.delete('/users/:id', async (req, res) => {
    await deleteUser(req, res, prisma, req.params.id);
});

// 获取信息视图列表
router.get('/infoViews', async (req, res) => {
    try {
        const infoViews = await prisma.executeWithRetry((p) => p.infoView.findMany());
        res.json(infoViews);
    } catch (error) {
        const dbError = handleDatabaseError(error, res);
        if (dbError) return;
        res.status(500).json({ error: '获取信息视图列表失败', details: error.message });
    }
});


module.exports = router;

