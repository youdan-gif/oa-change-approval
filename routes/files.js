const express = require('express');
const multer = require('multer');
const { db } = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// 使用内存存储（Vercel无持久化文件系统）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB（Vercel限制）
});

// 上传附件
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  const { request_id, node_id, description } = req.body;

  if (!req.file) return res.status(400).json({ error: '未上传文件' });
  if (!request_id) return res.status(400).json({ error: '缺少审批单ID' });

  try {
    // 文件存入数据库（BYTEA字段）
    const result = await db.run(`
      INSERT INTO attachments (request_id, node_id, uploader_id, uploader_name, file_name, original_name, file_type, file_size, file_path, file_data, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      request_id,
      node_id || null,
      req.user.id,
      req.user.name,
      req.file.filename || `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
      req.file.originalname,
      req.file.mimetype,
      req.file.size,
      `db:${req.file.originalname}`,
      req.file.buffer,
      description || ''
    ]);

    res.json({
      id: result.lastInsertRowid,
      file_name: req.file.originalname,
      original_name: req.file.originalname,
      file_size: req.file.size,
      message: '上传成功'
    });
  } catch (e) {
    console.error('上传失败:', e.message);
    res.status(500).json({ error: '上传失败: ' + e.message });
  }
});

// 下载附件
router.get('/download/:id', auth, async (req, res) => {
  try {
    const attachment = await db.get('SELECT * FROM attachments WHERE id = ?', [req.params.id]);
    if (!attachment) return res.status(404).json({ error: '附件不存在' });

    // 从数据库获取文件内容
    if (attachment.file_data) {
      const buffer = Buffer.from(attachment.file_data);
      res.setHeader('Content-Type', attachment.file_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(attachment.original_name)}`);
      return res.send(buffer);
    }

    res.status(404).json({ error: '文件数据不存在' });
  } catch (e) {
    console.error('下载失败:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 删除附件
router.delete('/:id', auth, async (req, res) => {
  try {
    const attachment = await db.get('SELECT * FROM attachments WHERE id = ?', [req.params.id]);
    if (!attachment) return res.status(404).json({ error: '附件不存在' });
    if (attachment.uploader_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权删除' });
    }

    await db.run('DELETE FROM attachments WHERE id = ?', [req.params.id]);
    res.json({ message: '已删除' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
