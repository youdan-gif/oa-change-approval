const express = require('express');
const { db } = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// 创建变更审批单
router.post('/create', auth, async (req, res) => {
  const { title, description, change_type, workflow_config } = req.body;

  if (!title || !workflow_config || !Array.isArray(workflow_config) || workflow_config.length === 0) {
    return res.status(400).json({ error: '标题和审批流程为必填' });
  }

  try {
    const requestId = await db.transaction(async (tx) => {
      const result = await tx.run(`
        INSERT INTO change_requests (initiator_id, title, description, change_type, workflow_config, current_node_index, status)
        VALUES (?, ?, ?, ?, ?, 0, 'active')
      `, [req.user.id, title, description || '', change_type || '其他', JSON.stringify(workflow_config)]);

      const reqId = result.lastInsertRowid;

      // 创建所有节点
      for (let index = 0; index < workflow_config.length; index++) {
        const node = workflow_config[index];
        await tx.run(`
          INSERT INTO workflow_nodes (request_id, node_index, node_type, assignee_id, assignee_name, node_desc, status)
          VALUES (?, ?, ?, ?, ?, ?, 'pending')
        `, [reqId, index, node.node_type, node.assignee_id, node.assignee_name, node.node_desc || '']);

        // 第一个节点的处理人收到通知
        if (index === 0) {
          await tx.run(`
            INSERT INTO notifications (request_id, receiver_id, title, content)
            VALUES (?, ?, ?, ?)
          `, [reqId, node.assignee_id, `新审批待办: ${title}`,
            `${req.user.name} 发起了变更审批"${title}"，请处理第1步: ${node.node_desc || node.node_type}`]);
        }
      }

      // 记录发起操作
      await tx.run(`
        INSERT INTO approval_records (request_id, node_id, user_id, user_name, action, opinion, client_ip)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [reqId, null, req.user.id, req.user.name, 'create', `发起变更审批: ${title}`, req.ip]);

      return reqId;
    });

    res.json({ id: requestId, message: '审批单创建成功' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 获取我发起的审批单
router.get('/my-initiated', auth, async (req, res) => {
  try {
    const requests = await db.all(`
      SELECT cr.*, u.name as initiator_name
      FROM change_requests cr
      JOIN users u ON cr.initiator_id = u.id
      WHERE cr.initiator_id = ?
      ORDER BY cr.created_at DESC
    `, [req.user.id]);

    const result = requests.map(r => ({
      ...r,
      workflow_config: JSON.parse(r.workflow_config)
    }));

    res.json({ requests: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 获取待我处理的审批单
router.get('/my-todos', auth, async (req, res) => {
  try {
    const todos = await db.all(`
      SELECT wn.*, cr.title, cr.description, cr.change_type, cr.initiator_id,
             cr.status as request_status, cr.current_node_index,
             u.name as initiator_name, u.org_type as initiator_org_type,
             cr.created_at
      FROM workflow_nodes wn
      JOIN change_requests cr ON wn.request_id = cr.id
      JOIN users u ON cr.initiator_id = u.id
      WHERE wn.assignee_id = ? AND wn.status = 'pending'
        AND cr.status = 'active'
        AND wn.node_index = cr.current_node_index
      ORDER BY cr.updated_at DESC
    `, [req.user.id]);

    res.json({ todos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 获取我已处理的审批单
router.get('/my-processed', auth, async (req, res) => {
  try {
    const processed = await db.all(`
      SELECT DISTINCT cr.id, cr.title, cr.status, cr.change_type,
             cr.initiator_id, u.name as initiator_name,
             cr.created_at, cr.updated_at
      FROM change_requests cr
      JOIN users u ON cr.initiator_id = u.id
      JOIN approval_records ar ON ar.request_id = cr.id
      WHERE ar.user_id = ? AND ar.action != 'create'
      ORDER BY cr.updated_at DESC
    `, [req.user.id]);

    res.json({ requests: processed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 获取审批单详情
router.get('/detail/:id', auth, async (req, res) => {
  const requestId = req.params.id;

  try {
    const request = await db.get(`
      SELECT cr.*, u.name as initiator_name, u.org_type as initiator_org_type,
             u.org_name as initiator_org_name, u.specialty as initiator_specialty,
             u.position as initiator_position
      FROM change_requests cr
      JOIN users u ON cr.initiator_id = u.id
      WHERE cr.id = ?
    `, [requestId]);

    if (!request) return res.status(404).json({ error: '审批单不存在' });

    const nodes = await db.all(`
      SELECT wn.*, u.name as assignee_name, u.org_type as assignee_org_type,
             u.org_name as assignee_org_name, u.specialty as assignee_specialty
      FROM workflow_nodes wn
      JOIN users u ON wn.assignee_id = u.id
      WHERE wn.request_id = ?
      ORDER BY wn.node_index
    `, [requestId]);

    const records = await db.all(`
      SELECT ar.*, u.name as user_name, u.org_type as user_org_type
      FROM approval_records ar
      JOIN users u ON ar.user_id = u.id
      WHERE ar.request_id = ?
      ORDER BY ar.created_at
    `, [requestId]);

    const attachments = await db.all(`
      SELECT a.*, u.name as uploader_name
      FROM attachments a
      JOIN users u ON a.uploader_id = u.id
      WHERE a.request_id = ?
      ORDER BY a.created_at
    `, [requestId]);

    res.json({
      request: {
        ...request,
        workflow_config: JSON.parse(request.workflow_config)
      },
      nodes,
      records,
      attachments
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 处理审批节点（通过/退回/驳回）
router.post('/process/:nodeId', auth, async (req, res) => {
  const { action, opinion, return_to_index } = req.body;
  const nodeId = req.params.nodeId;

  try {
    const node = await db.get(`
      SELECT wn.*, cr.title, cr.status as request_status, cr.current_node_index
      FROM workflow_nodes wn
      JOIN change_requests cr ON wn.request_id = cr.id
      WHERE wn.id = ?
    `, [nodeId]);

    if (!node) return res.status(404).json({ error: '节点不存在' });
    if (node.assignee_id !== req.user.id) return res.status(403).json({ error: '您无权处理此节点' });
    if (node.status !== 'pending') return res.status(400).json({ error: '该节点已处理' });
    if (node.request_status !== 'active') return res.status(400).json({ error: '审批单不在流转中' });
    if (node.node_index !== node.current_node_index) return res.status(400).json({ error: '该节点尚未轮到处理' });

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    await db.transaction(async (tx) => {
      const requestId = node.request_id;

      if (action === 'approve') {
        // 通过当前节点
        await tx.run('UPDATE workflow_nodes SET status = ?, updated_at = ? WHERE id = ?',
          ['approved', now, nodeId]);
        await tx.run(`
          INSERT INTO approval_records (request_id, node_id, user_id, user_name, action, opinion, client_ip)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [requestId, nodeId, req.user.id, req.user.name, 'approve', opinion || '同意', req.ip]);

        const nextIndex = node.node_index + 1;
        const nextNode = await tx.get('SELECT * FROM workflow_nodes WHERE request_id = ? AND node_index = ?',
          [requestId, nextIndex]);

        if (nextNode) {
          if (nextNode.status === 'returned' || nextNode.status === 'rejected') {
            await tx.run('UPDATE workflow_nodes SET status = ?, updated_at = ? WHERE id = ?',
              ['pending', now, nextNode.id]);
          }
          await tx.run(`
            UPDATE change_requests SET current_node_index = ?, status = ?, updated_at = ? WHERE id = ?
          `, [nextIndex, 'active', now, requestId]);
          await tx.run(`
            INSERT INTO notifications (request_id, receiver_id, title, content)
            VALUES (?, ?, ?, ?)
          `, [requestId, nextNode.assignee_id, `审批待办: ${node.title}`,
            `${req.user.name} 已通过第${node.node_index + 1}步，请处理第${nextIndex + 1}步: ${nextNode.node_desc || ''}`]);
        } else {
          await tx.run(`
            UPDATE change_requests SET current_node_index = ?, status = ?, updated_at = ? WHERE id = ?
          `, [node.node_index, 'approved', now, requestId]);
        }
      } else if (action === 'return') {
        // 退回到指定节点（默认退回上一步）
        const targetIndex = (return_to_index !== undefined && return_to_index !== null)
          ? parseInt(return_to_index)
          : Math.max(0, node.node_index - 1);

        if (targetIndex < 0 || targetIndex >= node.node_index) {
          throw new Error('退回目标节点无效，只能退回到当前步骤之前的节点');
        }

        await tx.run('UPDATE workflow_nodes SET status = ?, updated_at = ? WHERE id = ?',
          ['returned', now, nodeId]);
        const targetNode = await tx.get('SELECT * FROM workflow_nodes WHERE request_id = ? AND node_index = ?',
          [requestId, targetIndex]);
        const targetDesc = targetIndex + 1;
        await tx.run(`
          INSERT INTO approval_records (request_id, node_id, user_id, user_name, action, opinion, client_ip)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [requestId, nodeId, req.user.id, req.user.name, 'return',
          `退回到第${targetDesc}步。${opinion || ''}`.trim(), req.ip]);

        await tx.run('UPDATE workflow_nodes SET status = ?, updated_at = ? WHERE id = ?',
          ['pending', now, targetNode.id]);
        await tx.run(`
          UPDATE change_requests SET current_node_index = ?, status = ?, updated_at = ? WHERE id = ?
        `, [targetIndex, 'active', now, requestId]);
        await tx.run(`
          INSERT INTO notifications (request_id, receiver_id, title, content)
          VALUES (?, ?, ?, ?)
        `, [requestId, targetNode.assignee_id, `审批退回: ${node.title}`,
          `${req.user.name} 在第${node.node_index + 1}步退回了审批，请重新处理第${targetDesc}步。意见: ${opinion || '无'}`]);
      } else if (action === 'reject') {
        // 驳回并删除
        await tx.run(`
          INSERT INTO approval_records (request_id, node_id, user_id, user_name, action, opinion, client_ip)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [requestId, nodeId, req.user.id, req.user.name, 'reject', opinion || '驳回并删除', req.ip]);

        // 删除附件物理文件
        const files = await tx.all('SELECT file_path FROM attachments WHERE request_id = ?', [requestId]);
        const fs = require('fs');
        const path = require('path');
        files.forEach(f => {
          try {
            const filePath = path.join(__dirname, '..', f.file_path);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } catch (e) {}
        });

        // 删除所有关联数据
        await tx.run('DELETE FROM workflow_nodes WHERE request_id = ?', [requestId]);
        await tx.run('DELETE FROM approval_records WHERE request_id = ?', [requestId]);
        await tx.run('DELETE FROM attachments WHERE request_id = ?', [requestId]);
        await tx.run('DELETE FROM notifications WHERE request_id = ?', [requestId]);
        await tx.run('DELETE FROM change_requests WHERE id = ?', [requestId]);
      }
    });

    const msg = action === 'approve' ? '已通过' : action === 'return' ? '已退回' : '已驳回并删除';
    res.json({ message: msg, deleted: action === 'reject' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 获取所有审批单（所有登录用户均可查看全部）
router.get('/all', auth, async (req, res) => {
  try {
    const requests = await db.all(`
      SELECT cr.*, u.name as initiator_name, u.org_type as initiator_org_type,
             u.org_name as initiator_org_name, u.specialty as initiator_specialty,
             u.position as initiator_position
      FROM change_requests cr
      JOIN users u ON cr.initiator_id = u.id
      ORDER BY cr.created_at DESC
    `);

    const result = requests.map(r => ({
      ...r,
      workflow_config: JSON.parse(r.workflow_config)
    }));

    res.json({ requests: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 获取全局统计数据（所有用户可见）
router.get('/stats', auth, async (req, res) => {
  try {
    const total = await db.get('SELECT COUNT(*) as count FROM change_requests');
    const active = await db.get("SELECT COUNT(*) as count FROM change_requests WHERE status = 'active'");
    const approved = await db.get("SELECT COUNT(*) as count FROM change_requests WHERE status = 'approved'");
    const rejected = await db.get("SELECT COUNT(*) as count FROM change_requests WHERE status = 'rejected'");

    const byOrg = await db.all(`
      SELECT u.org_type, COUNT(*) as count
      FROM change_requests cr JOIN users u ON cr.initiator_id = u.id
      GROUP BY u.org_type ORDER BY count DESC
    `);

    const byType = await db.all(`
      SELECT change_type, COUNT(*) as count
      FROM change_requests GROUP BY change_type ORDER BY count DESC
    `);

    const byStatus = await db.all(`
      SELECT status, COUNT(*) as count
      FROM change_requests GROUP BY status
    `);

    const byMonth = await db.all(`
      SELECT to_char(created_at, 'YYYY-MM') as month, COUNT(*) as count
      FROM change_requests GROUP BY month ORDER BY month DESC
    `);

    res.json({
      total: total.count,
      active: active.count,
      approved: approved.count,
      rejected: rejected.count,
      byOrg,
      byType,
      byStatus,
      byMonth
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 导出四维智能表格（时间/单位/审批/人员 四个维度）
router.get('/export', auth, async (req, res) => {
  const ExcelJS = require('exceljs');

  try {
    // 查询全部审批单及关联数据
    const requests = await db.all(`
      SELECT cr.*, u.name as initiator_name, u.org_type as initiator_org_type,
             u.org_name as initiator_org_name, u.specialty as initiator_specialty,
             u.position as initiator_position
      FROM change_requests cr
      JOIN users u ON cr.initiator_id = u.id
      ORDER BY cr.created_at DESC
    `);

    const allNodeIds = requests.map(r => r.id);
    let nodes = [], records = [], attachments = [];

    if (allNodeIds.length > 0) {
      // PostgreSQL 使用 ANY($1::int[]) 方式处理 IN 查询
      const placeholders = allNodeIds.map(() => '?').join(',');

      nodes = await db.all(
        `SELECT wn.*, u.name as assignee_name, u.org_type as assignee_org_type, u.org_name as assignee_org_name, u.specialty as assignee_specialty FROM workflow_nodes wn JOIN users u ON wn.assignee_id = u.id WHERE wn.request_id IN (${placeholders}) ORDER BY wn.request_id, wn.node_index`,
        allNodeIds
      );

      records = await db.all(
        `SELECT ar.*, u.name as user_name, u.org_type as user_org_type FROM approval_records ar JOIN users u ON ar.user_id = u.id WHERE ar.request_id IN (${placeholders}) ORDER BY ar.created_at`,
        allNodeIds
      );

      attachments = await db.all(
        `SELECT a.*, u.name as uploader_name FROM attachments a JOIN users u ON a.uploader_id = u.id WHERE a.request_id IN (${placeholders}) ORDER BY a.created_at`,
        allNodeIds
      );
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = '变更审批OA系统';
    wb.created = new Date();

    // ============================================
    // 维度一：审批总览（主表 - 每行一个审批单）
    // ============================================
    const ws1 = wb.addWorksheet('一、审批总览', {
      views: [{ state: 'frozen', ySplit: 2 }]
    });

    ws1.mergeCells('A1:O1');
    ws1.getCell('A1').value = '工程变更审批总览表';
    ws1.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    ws1.getCell('A1').fill = { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF2563EB' } };
    ws1.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
    ws1.getRow(1).height = 30;

    const headers1 = ['序号', '审批单号', '变更标题', '变更类型', '状态', '发起人', '发起人单位类型', '发起人单位名称', '发起人专业', '发起人岗位', '总步骤数', '当前步骤', '发起时间', '最后更新', '审批意见摘要'];
    headers1.forEach((h, i) => {
      const cell = ws1.getCell(2, i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF64748B' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });
    ws1.getRow(2).height = 22;

    const statusMap = { active: '流转中', approved: '已通过', rejected: '已驳回并删除' };
    requests.forEach((r, idx) => {
      const wf = JSON.parse(r.workflow_config);
      const recSummary = records.filter(rec => rec.request_id === r.id).map(rec => `${rec.user_name}:${rec.action === 'approve' ? '通过' : rec.action === 'return' ? '退回' : '驳回'}`).join(' | ');
      const rowData = [
        idx + 1,
        `OA-${String(r.id).padStart(4, '0')}`,
        r.title,
        r.change_type,
        statusMap[r.status] || r.status,
        r.initiator_name,
        r.initiator_org_type,
        r.initiator_org_name,
        r.initiator_specialty || '',
        r.initiator_position || '',
        wf.length,
        r.status === 'active' ? `第${r.current_node_index + 1}步` : (r.status === 'approved' ? '已完成' : '已删除'),
        r.created_at ? r.created_at.toISOString ? r.created_at.toISOString().replace('T',' ').substring(0,19) : String(r.created_at).replace('T',' ').substring(0,19) : '',
        r.updated_at ? r.updated_at.toISOString ? r.updated_at.toISOString().replace('T',' ').substring(0,19) : String(r.updated_at).replace('T',' ').substring(0,19) : '',
        recSummary
      ];
      rowData.forEach((v, i) => {
        const cell = ws1.getCell(idx + 3, i + 1);
        cell.value = v;
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { vertical: 'middle', horizontal: i < 2 ? 'center' : 'left' };
        if (i === 4) {
          if (r.status === 'active') { cell.font = { color: { argb: 'FF2563EB' }, bold: true }; }
          else if (r.status === 'approved') { cell.font = { color: { argb: 'FF16A34A' }, bold: true }; }
          else { cell.font = { color: { argb: 'FFDC2626' }, bold: true }; }
        }
      });
      ws1.getRow(idx + 3).height = 20;
    });

    [6, 14, 30, 12, 14, 10, 14, 20, 12, 12, 8, 10, 20, 20, 40].forEach((w, i) => {
      ws1.getColumn(i + 1).width = w;
    });

    // ============================================
    // 维度二：单位维度（按单位分组统计）
    // ============================================
    const ws2 = wb.addWorksheet('二、单位维度', {
      views: [{ state: 'frozen', ySplit: 2 }]
    });

    ws2.mergeCells('A1:F1');
    ws2.getCell('A1').value = '参建单位审批统计表';
    ws2.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    ws2.getCell('A1').fill = { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF0891B2' } };
    ws2.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
    ws2.getRow(1).height = 30;

    const headers2 = ['单位类型', '单位名称', '发起审批数', '参与审批数', '通过数', '驳回数'];
    headers2.forEach((h, i) => {
      const cell = ws2.getCell(2, i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF64748B' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    const orgStats = {};
    requests.forEach(r => {
      const key = `${r.initiator_org_type}|${r.initiator_org_name}`;
      if (!orgStats[key]) orgStats[key] = { org_type: r.initiator_org_type, org_name: r.initiator_org_name, init: 0, approved: 0, rejected: 0 };
      orgStats[key].init++;
      if (r.status === 'approved') orgStats[key].approved++;
      if (r.status === 'rejected') orgStats[key].rejected++;
    });

    const partStats = {};
    nodes.forEach(n => {
      const key = `${n.assignee_org_type}|${n.assignee_org_name}`;
      if (!partStats[key]) partStats[key] = 0;
      partStats[key]++;
    });

    let rowIdx2 = 0;
    Object.values(orgStats).forEach(s => {
      const partKey = `${s.org_type}|${s.org_name}`;
      const rowData = [s.org_type, s.org_name, s.init, partStats[partKey] || 0, s.approved, s.rejected];
      rowData.forEach((v, i) => {
        const cell = ws2.getCell(rowIdx2 + 3, i + 1);
        cell.value = v;
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { vertical: 'middle', horizontal: i < 2 ? 'left' : 'center' };
      });
      rowIdx2++;
    });

    [14, 24, 12, 12, 10, 10].forEach((w, i) => { ws2.getColumn(i + 1).width = w; });

    // ============================================
    // 维度三：人员维度（审批人明细）
    // ============================================
    const ws3 = wb.addWorksheet('三、人员维度', {
      views: [{ state: 'frozen', ySplit: 2 }]
    });

    ws3.mergeCells('A1:H1');
    ws3.getCell('A1').value = '人员审批明细表';
    ws3.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    ws3.getCell('A1').fill = { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF16A34A' } };
    ws3.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
    ws3.getRow(1).height = 30;

    const headers3 = ['姓名', '单位类型', '单位名称', '专业', '岗位', '审批操作次数', '通过次数', '退回/驳回次数'];
    headers3.forEach((h, i) => {
      const cell = ws3.getCell(2, i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF64748B' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    const userStats = {};
    records.forEach(rec => {
      if (rec.action === 'create') return;
      if (!userStats[rec.user_id]) {
        userStats[rec.user_id] = { name: rec.user_name, org_type: rec.user_org_type, total: 0, approve: 0, other: 0 };
      }
      userStats[rec.user_id].total++;
      if (rec.action === 'approve') userStats[rec.user_id].approve++;
      else userStats[rec.user_id].other++;
    });

    let rowIdx3 = 0;
    const userIds = Object.keys(userStats);
    for (const uid of userIds) {
      const s = userStats[uid];
      const userDetail = await db.get('SELECT org_name, specialty, position FROM users WHERE id = ?', [uid]);
      const rowData = [s.name, s.org_type, userDetail?.org_name || '', userDetail?.specialty || '', userDetail?.position || '', s.total, s.approve, s.other];
      rowData.forEach((v, i) => {
        const cell = ws3.getCell(rowIdx3 + 3, i + 1);
        cell.value = v;
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { vertical: 'middle', horizontal: i < 5 ? 'left' : 'center' };
      });
      rowIdx3++;
    }

    [10, 14, 20, 12, 12, 12, 10, 12].forEach((w, i) => { ws3.getColumn(i + 1).width = w; });

    // ============================================
    // 维度四：时间维度（按月趋势）
    // ============================================
    const ws4 = wb.addWorksheet('四、时间维度', {
      views: [{ state: 'frozen', ySplit: 2 }]
    });

    ws4.mergeCells('A1:E1');
    ws4.getCell('A1').value = '审批时间趋势分析表';
    ws4.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    ws4.getCell('A1').fill = { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFD97706' } };
    ws4.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
    ws4.getRow(1).height = 30;

    const headers4 = ['月份', '发起数', '通过数', '驳回数', '流转中数'];
    headers4.forEach((h, i) => {
      const cell = ws4.getCell(2, i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF64748B' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    const monthStats = {};
    requests.forEach(r => {
      const dateStr = r.created_at ? (r.created_at.toISOString ? r.created_at.toISOString() : String(r.created_at)) : '';
      const month = dateStr.substring(0, 7);
      if (!month) return;
      if (!monthStats[month]) monthStats[month] = { total: 0, approved: 0, rejected: 0, active: 0 };
      monthStats[month].total++;
      if (r.status === 'approved') monthStats[month].approved++;
      if (r.status === 'rejected') monthStats[month].rejected++;
      if (r.status === 'active') monthStats[month].active++;
    });

    let rowIdx4 = 0;
    Object.keys(monthStats).sort().reverse().forEach(month => {
      const s = monthStats[month];
      const rowData = [month, s.total, s.approved, s.rejected, s.active];
      rowData.forEach((v, i) => {
        const cell = ws4.getCell(rowIdx4 + 3, i + 1);
        cell.value = v;
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });
      rowIdx4++;
    });

    [12, 10, 10, 10, 10].forEach((w, i) => { ws4.getColumn(i + 1).width = w; });

    // ============================================
    // 附录：完整审批流程明细
    // ============================================
    const ws5 = wb.addWorksheet('五、审批流程明细', {
      views: [{ state: 'frozen', ySplit: 2 }]
    });

    ws5.mergeCells('A1:K1');
    ws5.getCell('A1').value = '审批流程完整记录表';
    ws5.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    ws5.getCell('A1').fill = { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF1E293B' } };
    ws5.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
    ws5.getRow(1).height = 30;

    const headers5 = ['审批单号', '变更标题', '步骤', '节点类型', '节点说明', '处理人', '处理人单位', '状态', '操作时间', '审批意见', '附件数'];
    headers5.forEach((h, i) => {
      const cell = ws5.getCell(2, i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF64748B' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    const nodeStatusMap = { pending: '待处理', approved: '已通过', returned: '已退回', rejected: '已驳回', cancelled: '已取消', skipped: '已跳过' };
    const nodeTypeMap = { submit: '提交资料', approve: '审批', countersign: '会签', cc: '抄送' };

    let rowIdx5 = 0;
    requests.forEach(r => {
      const reqNodes = nodes.filter(n => n.request_id === r.id);
      reqNodes.forEach(n => {
        const nodeRecs = records.filter(rec => rec.node_id === n.id);
        const nodeAtt = attachments.filter(a => a.node_id === n.id);
        const opinion = nodeRecs.map(rec => rec.opinion || '').join(' | ');
        const lastRec = nodeRecs.length > 0 ? nodeRecs[nodeRecs.length - 1] : null;
        const actionTime = lastRec?.created_at
          ? (lastRec.created_at.toISOString ? lastRec.created_at.toISOString().replace('T',' ').substring(0,19) : String(lastRec.created_at).replace('T',' ').substring(0,19))
          : (n.updated_at ? (n.updated_at.toISOString ? n.updated_at.toISOString().replace('T',' ').substring(0,19) : String(n.updated_at).replace('T',' ').substring(0,19)) : '');

        const rowData = [
          `OA-${String(r.id).padStart(4, '0')}`,
          r.title,
          `第${n.node_index + 1}步`,
          nodeTypeMap[n.node_type] || n.node_type,
          n.node_desc || '',
          n.assignee_name,
          `${n.assignee_org_type}/${n.assignee_org_name || ''}`,
          nodeStatusMap[n.status] || n.status,
          actionTime,
          opinion,
          nodeAtt.length
        ];
        rowData.forEach((v, i) => {
          const cell = ws5.getCell(rowIdx5 + 3, i + 1);
          cell.value = v;
          cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          cell.alignment = { vertical: 'middle', horizontal: i === 1 ? 'left' : 'center' };
        });
        rowIdx5++;
      });
    });

    [14, 28, 8, 10, 20, 10, 20, 10, 20, 30, 8].forEach((w, i) => { ws5.getColumn(i + 1).width = w; });

    // 生成文件
    const buffer = await wb.xlsx.writeBuffer();
    const filename = encodeURIComponent(`变更审批四维智能表格_${new Date().toISOString().substring(0, 10)}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    res.send(buffer);
  } catch (e) {
    console.error('导出错误:', e);
    res.status(500).json({ error: e.message });
  }
});

// 获取我的通知
router.get('/notifications', auth, async (req, res) => {
  try {
    const notifications = await db.all(`
      SELECT n.*, cr.title as request_title
      FROM notifications n
      JOIN change_requests cr ON n.request_id = cr.id
      WHERE n.receiver_id = ?
      ORDER BY n.created_at DESC
      LIMIT 50
    `, [req.user.id]);

    res.json({ notifications });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 标记通知为已读
router.post('/notifications/read/:id', auth, async (req, res) => {
  try {
    await db.run('UPDATE notifications SET is_read = TRUE WHERE id = ? AND receiver_id = ?',
      [req.params.id, req.user.id]);
    res.json({ message: '已标记为已读' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
