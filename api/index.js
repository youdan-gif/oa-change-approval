const express = require('express');
const path = require('path');
const { init, db } = require('../db');
const { auth, adminOnly, signToken } = require('../middleware/auth');

const app = express();

// 中间件
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true, limit: '4mb' }));

// 静态文件（Vercel会自动处理public目录，这里作为备用）
app.use(express.static(path.join(__dirname, '..', 'public')));

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

// 数据库初始化标记
let dbInitialized = false;

// Vercel serverless 入口
module.exports = async (req, res) => {
  if (!dbInitialized) {
    try {
      await init();
      dbInitialized = true;
      console.log('数据库初始化完成（Vercel）');
    } catch (e) {
      console.error('数据库初始化失败:', e.message);
      // 即使初始化失败也继续，表可能已存在
      dbInitialized = true;
    }
  }
  return app(req, res);
};
