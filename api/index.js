const express = require('express');
const path = require('path');
const { init, db, pool } = require('../db');

const app = express();

// 中间件
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true, limit: '4mb' }));

// 静态文件
app.use(express.static(path.join(__dirname, '..', 'public')));

// 数据库懒初始化中间件（仅首次请求时执行）
let dbInitialized = false;
app.use(async (req, res, next) => {
  if (!dbInitialized) {
    try {
      await init();
      console.log('数据库初始化完成');
    } catch (e) {
      console.error('数据库初始化失败:', e.message);
      // 即使失败也继续，表可能已存在
    }
    dbInitialized = true;
  }
  next();
});

// API路由
const authRoutes = require('../routes/auth');
const approvalRoutes = require('../routes/approval');
const fileRoutes = require('../routes/files');

app.use('/api/auth', authRoutes);
app.use('/api/approval', approvalRoutes);
app.use('/api/files', fileRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA支持：所有非API路由返回index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return;
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('未捕获错误:', err.message);
  res.status(500).json({ error: '服务器内部错误: ' + err.message });
});

module.exports = app;
