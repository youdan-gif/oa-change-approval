const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// 确保上传目录存在
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// multer配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const requestDir = path.join(uploadDir, `req-${req.body.request_id || 'temp'}`);
    if (!fs.existsSync(requestDir)) fs.mkdirSync(requestDir, { recursive: true });
    cb(null, requestDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    cb(null, true);
  }
});

// 上传附件
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  const { request_id, node_id, description } = req.body;

  if (!req.file) return res.status(400).json({ error: '未上传文件' });
  if (!request_id) return res.status(400).json({ error: '缺少审批单ID' });

  try {
    const filePath = path.relative(path.join(__dirname, '..'), req.file.path);

    const result = await db.run(`
      INSERT INTO attachments (request_id, node_id, uploader_id, uploader_name, file_name, original_name, file_type, file_size, file_path, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      request_id,
      node_id || null,
      req.user.id,
      req.user.name,
      req.file.filename,
      req.file.originalname,
      req.file.mimetype,
      req.file.size,
      filePath,
      description || ''
    ]);

    res.json({
      id: result.lastInsertRowid,
      file_name: req.file.filename,
      original_name: req.file.originalname,
      file_size: req.file.size,
      message: '上传成功'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 下载附件
router.get('/download/:id', auth, async (req, res) => {
  try {
    const attachment = await db.get('SELECT * FROM attachments WHERE id = ?', [req.params.id]);
    if (!attachment) return res.status(404).json({ error: '附件不存在' });

    const filePath = path.join(__dirname, '..', attachment.file_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件不存在' });

    res.download(filePath, attachment.original_name);
  } catch (e) {
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

    const filePath = path.join(__dirname, '..', attachment.file_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await db.run('DELETE FROM attachments WHERE id = ?', [req.params.id]);
    res.json({ message: '已删除' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
