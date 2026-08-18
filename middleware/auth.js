const jwt = require('jsonwebtoken');
const { db } = require('../db');

const SECRET = process.env.JWT_SECRET || 'change-approval-oa-secret-2024';

async function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '请先登录' });

  try {
    const payload = jwt.verify(token, SECRET);
    const user = await db.get(
      'SELECT id, name, phone, email, org_type, org_name, specialty, position, role, status FROM users WHERE id = ?',
      [payload.userId]
    );
    if (!user) return res.status(401).json({ error: '用户不存在' });
    if (user.status !== 'approved') return res.status(403).json({ error: '账号尚未审核通过' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '仅管理员可操作' });
  next();
}

function signToken(userId) {
  return jwt.sign({ userId }, SECRET, { expiresIn: '7d' });
}

module.exports = { auth, adminOnly, signToken, SECRET };
