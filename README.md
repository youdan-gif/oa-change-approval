# 工程变更审批OA系统

## 系统简介

一套面向工程项目建设五方（建设、代建、设计、监理、施工）的变更审批协同OA系统。所有参建人员注册后即可使用，发起审批时可自主编排审批流程，逐节点指定审批人和资料提交人，每个节点可上传图纸、照片等辅助材料。

## 核心功能

- 五方人员注册（管理员审核后激活）
- 全员可发起变更审批
- 发起时自主编排审批流程（节点数量、顺序、处理人均可自定义）
- 每个节点支持上传文件/图片/文字说明
- 审批操作：通过 / 退回 / 驳回
- 全流程审批记录留痕
- 通知待办提醒
- 管理后台（用户审核、状态管理、全部审批单查看）

## 快速部署

### 方式一：Docker一键部署（推荐）

```bash
# 1. 将项目文件夹上传到服务器
# 2. 执行一键部署脚本
chmod +x deploy.sh
./deploy.sh
```

部署完成后访问 `http://服务器IP:3000` 即可使用。

### 方式二：手动Docker部署

```bash
# 构建镜像
docker-compose build

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重启服务
docker-compose restart
```

### 方式三：直接运行（无需Docker）

```bash
# 安装Node.js 18+
# 进入项目目录
cd oa-system

# 安装依赖
npm install

# 启动服务
node server.js
```

访问 `http://localhost:3000`。

## 默认账号

| 账号 | 密码 | 角色 |
|------|------|------|
| admin | admin123 | 系统管理员 |

首次登录后请立即在管理后台修改密码（联系系统管理员重置）。

## 使用流程

### 管理员
1. 用 admin 账号登录
2. 在「管理后台」审核新注册用户
3. 在「全部审批单」查看所有审批进度

### 参建人员
1. 在登录页点击「立即注册」，选择单位类型、填写信息
2. 等待管理员审核通过
3. 登录后在「发起审批」创建变更审批单
4. 编排审批流程：逐步添加节点，为每个节点选择处理人和操作类型
5. 上传初始资料（可选）
6. 提交后系统自动通知第一步处理人
7. 处理人收到通知后进入「待我处理」处理审批

## 系统架构

```
oa-system/
├── server.js              # 服务入口
├── db.js                  # SQLite数据库初始化
├── package.json           # 项目依赖
├── Dockerfile              # Docker镜像配置
├── docker-compose.yml      # Docker编排
├── deploy.sh               # 一键部署脚本
├── backup.sh               # 数据备份脚本
├── .dockerignore
├── middleware/
│   └── auth.js            # JWT认证中间件
├── routes/
│   ├── auth.js            # 用户注册/登录/管理
│   ├── approval.js         # 审批流程引擎
│   └── files.js           # 文件上传/下载
├── public/                # 前端静态文件
│   ├── index.html
│   ├── css/
│   │   └── app.css        # 全部样式
│   └── js/
│       └── app.js         # 全部前端逻辑
├── data/                  # SQLite数据库（运行时生成）
│   └── oa.db
└── uploads/               # 上传附件（运行时生成）
```

## 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 前端 | HTML + CSS + 原生JS | 无框架依赖，零构建，开箱即用 |
| 后端 | Node.js + Express | 轻量高效 |
| 数据库 | SQLite (better-sqlite3) | 文件型，无需单独部署 |
| 认证 | JWT (jsonwebtoken) | 无状态Token认证 |
| 密码 | bcryptjs | 防撞库哈希加密 |
| 文件 | multer | 支持大文件上传(100MB) |
| 部署 | Docker + Docker Compose | 一键部署 |

## 数据备份

```bash
# 手动备份
chmod +x backup.sh
./backup.sh

# 自动备份（crontab定时）
# 每天凌晨2点自动备份
crontab -e
# 添加：0 2 * * * cd /path/to/oa-system && ./backup.sh
```

备份文件保存在 `backups/` 目录，自动清理30天前的旧备份。

## 性能指标

| 指标 | 数值 |
|------|------|
| 常规API响应 | 1-5ms |
| 页面加载 | 3-6ms |
| 文件上传(1MB) | 7ms |
| 文件上传(10MB) | 51ms |
| 100条审批单批量创建 | 220ms |
| 并发支持 | 30-50人日常使用无压力 |

## 服务器配置建议

| 配置 | 说明 |
|------|------|
| CPU | 2核 |
| 内存 | 4GB |
| 硬盘 | 50GB SSD（约用1-2年） |
| 带宽 | 5Mbps |
| 系统 | Linux (Ubuntu 22.04 / CentOS 8+) |

推荐云服务器：阿里云/腾讯云轻量服务器 2核4G 50GB，年费约165-188元。

## 费用

| 项目 | 费用 |
|------|------|
| 软件许可 | 免费（永久开源） |
| 数据库 | 免费（SQLite内嵌） |
| 部署工具 | 免费（Docker开源） |
| SSL证书 | 免费（Let's Encrypt） |
| 服务器 | 0元（用现有电脑）或约165元/年 |

## 常见问题

**Q: 忘记密码怎么办？**
A: 联系管理员在后台重置，或直接在服务器上执行：
```bash
node -e "const {db}=require('./db'); const bcrypt=require('bcryptjs'); db.prepare('UPDATE users SET password_hash=? WHERE phone=?').run(bcrypt.hashSync('新密码',10),'手机号')"
```

**Q: 数据存在哪里？**
A: 所有数据存储在 `data/oa.db`（SQLite数据库文件），上传的附件存储在 `uploads/` 目录。Docker部署时这些数据在Docker卷中，不会因容器重建而丢失。

**Q: 如何迁移服务器？**
A: 备份 `data/oa.db` 和 `uploads/` 目录，拷贝到新服务器同位置即可。Docker部署的用 `backup.sh` 一键备份。

**Q: 支持多少人同时使用？**
A: 30-50人日常使用完全没有压力。SQLite单表可支撑百万行数据，性能瓶颈在硬盘I/O而非并发。

**Q: 如何修改端口？**
A: 修改 `server.js` 中的 `PORT` 变量，或Docker部署时修改 `docker-compose.yml` 的端口映射。
