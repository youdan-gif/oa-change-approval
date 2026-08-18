const { Pool, types } = require('pg');
const dns = require('dns');

// 强制使用IPv4（避免IPv6 ENETUNREACH错误）
dns.setDefaultResultOrder('ipv4first');

// Supabase / PostgreSQL 连接池
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oa';
// Supabase和Vercel生产环境需要SSL
const needsSSL = connectionString.includes('supabase') || connectionString.includes('.co') || process.env.VERCEL === '1';

const pool = new Pool({
  connectionString,
  ssl: needsSSL ? { rejectUnauthorized: false } : undefined,
  max: 2,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 10000,
  host: undefined, // 使用connectionString中的host
});

// 错误处理，防止进程崩溃
pool.on('error', (err) => {
  console.error('数据库连接错误(非致命):', err.message);
});

pool.on('error', (err) => {
  console.error('数据库连接错误:', err.message);
});

// 自动将 SQL 中的 ? 占位符转换为 PostgreSQL 的 $1, $2 格式
function convertSQL(sql) {
  let i = 1;
  return sql.replace(/\?/g, () => `$${i++}`);
}

// === 兼容 better-sqlite3 风格的异步封装 ===
const db = {
  // 查询多行
  async all(sql, params = []) {
    const result = await pool.query(convertSQL(sql), params);
    return result.rows;
  },

  // 查询单行
  async get(sql, params = []) {
    const result = await pool.query(convertSQL(sql), params);
    return result.rows[0] || null;
  },

  // 执行写操作，返回 { lastInsertRowid, changes }
  async run(sql, params = []) {
    // 如果是 INSERT 且没有 RETURNING，自动添加
    if (sql.trim().toUpperCase().startsWith('INSERT') && !sql.toUpperCase().includes('RETURNING')) {
      sql = sql.replace(/;?\s*$/, ' RETURNING id');
    }
    const result = await pool.query(convertSQL(sql), params);
    return {
      lastInsertRowid: result.rows[0]?.id || null,
      changes: result.rowCount || 0
    };
  },

  // 事务
  async transaction(fn) {
    const client = await pool.connect();
    const tx = {
      async all(sql, params = []) {
        const r = await client.query(convertSQL(sql), params);
        return r.rows;
      },
      async get(sql, params = []) {
        const r = await client.query(convertSQL(sql), params);
        return r.rows[0] || null;
      },
      async run(sql, params = []) {
        if (sql.trim().toUpperCase().startsWith('INSERT') && !sql.toUpperCase().includes('RETURNING')) {
          sql = sql.replace(/;?\s*$/, ' RETURNING id');
        }
        const r = await client.query(convertSQL(sql), params);
        return { lastInsertRowid: r.rows[0]?.id || null, changes: r.rowCount || 0 };
      }
    };

    try {
      await client.query('BEGIN');
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  pool
};

// 初始化数据库表结构
async function init() {
  // 组织表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      org_type TEXT NOT NULL,
      org_name TEXT NOT NULL,
      project_name TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // 用户表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
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
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (org_id) REFERENCES organizations(id)
    )
  `);

  // 审批单表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS change_requests (
      id SERIAL PRIMARY KEY,
      initiator_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      change_type TEXT,
      workflow_config TEXT NOT NULL,
      current_node_index INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (initiator_id) REFERENCES users(id)
    )
  `);

  // 流程节点表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workflow_nodes (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL,
      node_index INTEGER NOT NULL,
      node_type TEXT NOT NULL,
      assignee_id INTEGER NOT NULL,
      assignee_name TEXT NOT NULL,
      node_desc TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (request_id) REFERENCES change_requests(id),
      FOREIGN KEY (assignee_id) REFERENCES users(id)
    )
  `);

  // 审批记录表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS approval_records (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL,
      node_id INTEGER,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      opinion TEXT,
      client_ip TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (request_id) REFERENCES change_requests(id),
      FOREIGN KEY (node_id) REFERENCES workflow_nodes(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 附件表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attachments (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL,
      node_id INTEGER,
      uploader_id INTEGER NOT NULL,
      uploader_name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_type TEXT,
      file_size INTEGER,
      file_path TEXT NOT NULL,
      file_data BYTEA,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (request_id) REFERENCES change_requests(id),
      FOREIGN KEY (node_id) REFERENCES workflow_nodes(id),
      FOREIGN KEY (uploader_id) REFERENCES users(id)
    )
  `);

  // 通知表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (request_id) REFERENCES change_requests(id),
      FOREIGN KEY (receiver_id) REFERENCES users(id)
    )
  `);

  // 如果attachments表已存在但缺少file_data列，则添加
  try {
    await pool.query(`ALTER TABLE attachments ADD COLUMN IF NOT EXISTS file_data BYTEA`);
  } catch (e) {
    // 忽略错误（某些PG版本不支持IF NOT EXISTS）
  }

  // 创建默认管理员（账号: admin / 密码: admin123）
  const bcrypt = require('bcryptjs');
  const existing = await db.get('SELECT id FROM users WHERE phone = ?', ['admin']);
  if (!existing) {
    const hash = bcrypt.hashSync('admin123', 10);
    await db.run(`
      INSERT INTO users (name, phone, email, password_hash, org_type, org_name, specialty, position, role, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, ['系统管理员', 'admin', 'admin@oa.local', hash, '建设单位', '系统管理办公室', '系统管理', '管理员', 'admin', 'approved']);

    // 预置五方参建单位
    const orgs = [
      { type: '建设单位', name: 'XX建设集团' },
      { type: '代建单位', name: 'XX代建管理有限公司' },
      { type: '设计单位', name: 'XX设计研究院' },
      { type: '监理单位', name: 'XX工程监理有限公司' },
      { type: '施工单位', name: 'XX建筑工程总公司' },
    ];
    for (const org of orgs) {
      await db.run('INSERT INTO organizations (org_type, org_name, project_name) VALUES (?, ?, ?)',
        [org.type, org.name, 'XX工程项目']);
    }
  }

  console.log('数据库初始化完成');
}

module.exports = { db, pool, init };
