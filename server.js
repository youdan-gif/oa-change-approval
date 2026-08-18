const express = require('express');
const path = require('path');
const fs = require('fs');
const { init } = require('./db');
const { auth, adminOnly } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json({ limit: '120mb' }));
app.use(express.urlencoded({ extended: true, limit: '120mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));

// API路由
const authRoutes = require('./routes/auth');
const approvalRoutes = require('./routes/approval');
const fileRoutes = require('./routes/files');

app.use('/api/auth', authRoutes);
app.use('/api/approval', approvalRoutes);
app.use('/api/files', fileRoutes);

// 所有非API路由返回index.html（SPA支持）
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return;
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动服务
async function start() {
  try {
    // 初始化数据库
    await init();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n  变更审批OA系统已启动`);
      console.log(`  访问地址: http://localhost:${PORT}`);
      console.log(`  管理员账号: admin / admin123\n`);
    });
  } catch (e) {
    console.error('启动失败:', e.message);
    process.exit(1);
  }
}

start();
