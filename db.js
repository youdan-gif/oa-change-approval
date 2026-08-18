const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 数据库文件路径（支持环境变量配置，CloudBase部署时指向CFS持久化挂载点）
const dbDir = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const dbPath = path.join(dbDir, 'oa.db');

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// === 兼容异步接口的封装（让routes代码不用改）===
const db = {
  async all(sql, params = []) {
    const stmt = sqlite.prepare(sql);
    return stmt.all(...params);
  },

  async get(sql, params = []) {
    const stmt = sqlite.prepare(sql);
    return stmt.get(...params) || null;
  },

  async run(sql, params = []) {
    const stmt = sqlite.prepare(sql);
    const result = stmt.run(...params);
    return {
      lastInsertRowid: result.lastInsertRowid,
      changes: result.changes
    };
  },

  async transaction(fn) {
    const tx = sqlite.transaction(() => {
      const txObj = {
        all(sql, params = []) { return sqlite.prepare(sql).all(...params); },
        get(sql, params = []) { return sqlite.prepare(sql).get(...params) || null; },
        run(sql, params = []) {
          const r = sqlite.prepare(sql).run(...params);
          return { lastInsertRowid: r.lastInsertRowid, changes: r.changes };
        }
      };
      return fn(txObj);
    });
    return tx();
  }
};

// 初始化数据库表结构
function init() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_type TEXT NOT NULL,
      org_name TEXT NOT NULL,
      project_name TEXT,
      created_at DATETIME DEFAULT (datetime('now','localtime'))
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id INTEGER,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      org_type TEXT NOT NULL,
      org_name TEXT NOT NULL,
      specialty TEXT,
      position TEXT,
      role TEXT DEFAULT 'user',
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (org_id) REFERENCES organizations(id)
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS change_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      initiator_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      change_type TEXT,
      workflow_config TEXT NOT NULL,
      current_node_index INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      created_at DATETIME DEFAULT (datetime('now','localtime')),
      updated_at DATETIME DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (initiator_id) REFERENCES users(id)
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS workflow_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      node_index INTEGER NOT NULL,
      node_type TEXT NOT NULL,
      assignee_id INTEGER NOT NULL,
      assignee_name TEXT NOT NULL,
      node_desc TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT (datetime('now','localtime')),
      updated_at DATETIME DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (request_id) REFERENCES change_requests(id),
      FOREIGN KEY (assignee_id) REFERENCES users(id)
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS approval_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      node_id INTEGER,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      opinion TEXT,
      client_ip TEXT,
      created_at DATETIME DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (request_id) REFERENCES change_requests(id),
      FOREIGN KEY (node_id) REFERENCES workflow_nodes(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      node_id INTEGER,
      uploader_id INTEGER NOT NULL,
      uploader_name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_type TEXT,
      file_size INTEGER,
      file_path TEXT NOT NULL,
      file_data BLOB,
      description TEXT,
      created_at DATETIME DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (request_id) REFERENCES change_requests(id),
      FOREIGN KEY (node_id) REFERENCES workflow_nodes(id),
      FOREIGN KEY (uploader_id) REFERENCES users(id)
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (request_id) REFERENCES change_requests(id),
      FOREIGN KEY (receiver_id) REFERENCES users(id)
    )
  `);

  // 创建默认管理员（账号: admin / 密码: admin123）
  const bcrypt = require('bcryptjs');
  const existing = sqlite.prepare('SELECT id FROM users WHERE phone = ?').get('admin');
  if (!existing) {
    const hash = bcrypt.hashSync('admin123', 10);
    sqlite.prepare(`
      INSERT INTO users (name, phone, email, password_hash, org_type, org_name, specialty, position, role, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('系统管理员', 'admin', 'admin@oa.local', hash, '建设单位', '系统管理办公室', '系统管理', '管理员', 'admin', 'approved');

    // 预置五方参建单位
    const insertOrg = sqlite.prepare('INSERT INTO organizations (org_type, org_name, project_name) VALUES (?, ?, ?)');
    const orgs = [
      { type: '建设单位', name: 'XX建设集团' },
      { type: '代建单位', name: 'XX代建管理有限公司' },
      { type: '设计单位', name: 'XX设计研究院' },
      { type: '监理单位', name: 'XX工程监理有限公司' },
      { type: '施工单位', name: 'XX建筑工程总公司' },
    ];
    for (const org of orgs) {
      insertOrg.run(org.type, org.name, 'XX工程项目');
    }
  }

  console.log('SQLite数据库初始化完成');
}

module.exports = { db, sqlite, init };
