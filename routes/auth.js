const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { signToken, auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// 用户注册
router.post('/register', async (req, res) => {
  const { name, phone, email, password, org_type, org_name, specialty, position } = req.body;

  if (!name || !phone || !password || !org_type || !org_name) {
    return res.status(400).json({ error: '姓名、手机号、密码、单位类型、单位名称为必填' });
  }

  try {
    const existing = await db.get('SELECT id FROM users WHERE phone = ?', [phone]);
    if (existing) return res.status(409).json({ error: '该手机号已注册' });

    const hash = bcrypt.hashSync(password, 10);
    const result = await db.run(`
      INSERT INTO users (name, phone, email, password_hash, org_type, org_name, specialty, position, role, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'user', 'pending')
    `, [name, phone, email || null, hash, org_type, org_name, specialty || null, position || null]);

    res.json({ id: result.lastInsertRowid, message: '注册成功，请等待管理员审核' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 用户登录
router.post('/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ error: '请输入手机号和密码' });

  try {
    const user = await db.get('SELECT * FROM users WHERE phone = ?', [phone]);
    if (!user) return res.status(401).json({ error: '账号不存在' });
    if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: '密码错误' });
    if (user.status === 'pending') return res.status(403).json({ error: '账号待审核，请联系管理员' });
    if (user.status === 'disabled') return res.status(403).json({ error: '账号已被禁用' });

    const token = signToken(user.id);
    res.json({
      token,
      user: {
        id: user.id, name: user.name, phone: user.phone, email: user.email,
        org_type: user.org_type, org_name: user.org_name, specialty: user.specialty,
        position: user.position, role: user.role
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 获取当前用户信息
router.get('/me', auth, (req, res) => {
  res.json({ user: req.user });
});

// 获取所有用户（用于审批人选选择）
router.get('/users', auth, async (req, res) => {
  try {
    const users = await db.all(`
      SELECT id, name, phone, org_type, org_name, specialty, position, role, status
      FROM users WHERE status = 'approved' ORDER BY org_type, name
    `);
    res.json({ users });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 按条件搜索用户
router.get('/users/search', auth, async (req, res) => {
  const { org_type, keyword } = req.query;
  let sql = `SELECT id, name, phone, org_type, org_name, specialty, position FROM users WHERE status = 'approved'`;
  const params = [];
  if (org_type && org_type !== 'all') {
    sql += ` AND org_type = ?`;
    params.push(org_type);
  }
  if (keyword) {
    sql += ` AND (name ILIKE ? OR org_name ILIKE ? OR specialty ILIKE ?)`;
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }
  sql += ` ORDER BY org_type, name`;
  try {
    const users = await db.all(sql, params);
    res.json({ users });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// === 管理员接口 ===

// 获取待审核用户列表
router.get('/admin/pending', auth, adminOnly, async (req, res) => {
  try {
    const users = await db.all(`
      SELECT id, name, phone, email, org_type, org_name, specialty, position, created_at
      FROM users WHERE status = 'pending' ORDER BY created_at DESC
    `);
    res.json({ users });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 审核用户
router.post('/admin/review/:id', auth, adminOnly, async (req, res) => {
  const { action } = req.body;
  const userId = req.params.id;
  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  try {
    await db.run('UPDATE users SET status = ? WHERE id = ?', [newStatus, userId]);

    if (action === 'reject') {
      await db.run('DELETE FROM users WHERE id = ?', [userId]);
    }

    res.json({ message: action === 'approve' ? '已通过审核' : '已驳回注册' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 获取所有用户（管理员）
router.get('/admin/users', auth, adminOnly, async (req, res) => {
  try {
    const users = await db.all(`
      SELECT id, name, phone, email, org_type, org_name, specialty, position, role, status, created_at
      FROM users ORDER BY created_at DESC
    `);
    res.json({ users });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 切换用户状态
router.post('/admin/toggle-status/:id', auth, adminOnly, async (req, res) => {
  try {
    const user = await db.get('SELECT status FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    const newStatus = user.status === 'disabled' ? 'approved' : 'disabled';
    await db.run('UPDATE users SET status = ? WHERE id = ?', [newStatus, req.params.id]);
    res.json({ message: newStatus === 'disabled' ? '已禁用' : '已启用', status: newStatus });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
