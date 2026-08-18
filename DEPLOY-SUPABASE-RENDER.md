# 变更审批OA系统 - 免费部署指南

## 架构说明

```
┌─────────────────┐     ┌──────────────────────┐
│  Render (免费版)  │     │  Supabase (免费版)    │
│  - Express后端   │────→│  - PostgreSQL数据库  │
│  - 静态前端      │     │  - 500MB存储          │
│  - 文件上传      │     │  - 5GB带宽/月          │
│  - 512MB内存     │     └──────────────────────┘
│  - 5GB带宽/月    │
└─────────────────┘
```

**总费用：0元/月**（两个免费套餐组合使用）

---

## 第一步：创建 Supabase 项目（数据库）

1. 打开 https://supabase.com 注册账号（可用GitHub登录）
2. 点击 **New Project** 创建新项目
3. 填写：
   - **项目名称**：`oa-system`（随意取）
   - **数据库密码**：记住这个密码（后面要用）
   - **区域**：选 Southeast Asia (Singapore) 最近
4. 等待约2分钟，项目创建完成

### 获取数据库连接字符串

1. 进入项目后，左侧菜单点 **Project Settings**（齿轮图标）
2. 点 **Database**
3. 找到 **Connection string** 区域
4. 选择 **URI** 格式
5. 复制连接字符串，格式类似：
   ```
   postgresql://postgres.xxxx:your-password@db.xxxx.supabase.co:5432/postgres
   ```
6. 把 `your-password` 替换为你在第3步设置的数据库密码

**这个连接字符串就是后面要填的 `DATABASE_URL`**

---

## 第二步：上传代码到 GitHub

1. 在 GitHub 创建一个新仓库（Private 即可）
2. 把 `/workspace/oa-system` 目录下的所有文件推送到这个仓库

方法一（命令行）：
```bash
cd /workspace/oa-system
git init
git add .
git commit -m "迁移到Supabase PostgreSQL"
git branch -M main
git remote add origin https://github.com/你的用户名/oa-system.git
git push -u origin main
```

方法二：直接在 GitHub 网页上传文件

---

## 第三步：部署到 Render（免费版）

### 方式A：使用 render.yaml 一键部署（推荐）

1. 打开 https://render.com 注册账号（可用GitHub登录）
2. 点击 **New +** → **Blueprint**
3. 选择你刚才创建的 GitHub 仓库
4. Render 会自动识别 `render.yaml` 配置文件
5. 在环境变量配置页面，填入：
   - `DATABASE_URL`：粘贴第一步获取的 Supabase 连接字符串
6. 点击 **Apply** 开始部署
7. 等待构建完成（约2-3分钟）

### 方式B：手动创建

1. 打开 https://render.com → **New +** → **Web Service**
2. 连接你的 GitHub 仓库
3. 填写配置：
   - **Name**：`change-approval-oa`
   - **Runtime**：Node
   - **Build Command**：`npm install`
   - **Start Command**：`node server.js`
   - **Plan**：Free
4. 在 **Environment Variables** 中添加：
   ```
   DATABASE_URL=你的Supabase连接字符串
   DATABASE_SSL=true
   JWT_SECRET=随便填一个长字符串
   NODE_ENV=production
   ```
5. 点击 **Create Web Service**
6. 等待部署完成

---

## 第四步：验证部署

部署完成后，Render会给你一个网址，类似：
```
https://change-approval-oa.onrender.com
```

打开这个网址：
1. 应该看到登录页面
2. 用 `admin` / `admin123` 登录
3. 如果能成功登录，说明数据库连接正常

---

## 免费套餐限制说明

### Supabase 免费版
| 资源 | 限额 | 30-50人是否够用 |
|------|------|----------------|
| 数据库大小 | 500MB | 够用（审批文本数据很小） |
| 月活用户 | 50,000 | 远超需求 |
| 带宽 | 5GB/月 | 够用 |
| 闲置暂停 | 1周无活动后暂停 | 活跃使用不影响 |

### Render 免费版
| 资源 | 限额 | 30-50人是否够用 |
|------|------|----------------|
| 运行时长 | 750小时/月 | 够24/7运行 |
| 内存 | 512MB | 够用 |
| 带宽 | 5GB/月 | 够用 |
| 闲置休眠 | 15分钟无访问后休眠 | 首次唤醒约30秒-1分钟 |

### ⚠️ 注意事项

1. **Render休眠问题**：免费版15分钟无访问会休眠，下次访问冷启动约30秒-1分钟。对于30-50人的团队，白天通常不会休眠。

2. **文件上传持久性**：Render免费版的文件系统是临时的，每次重启/重新部署后上传的文件会丢失。解决方案：
   - 短期方案：文件存在数据库中（需要改代码）
   - 长期方案：使用Supabase Storage存储文件（1GB免费）

3. **Supabase暂停问题**：1周无活动后数据库会暂停，在Supabase控制台手动恢复即可。

---

## 常见问题

### Q: 部署后打不开页面？
A: 检查Render日志，确认 `DATABASE_URL` 环境变量是否正确填写。Supabase连接字符串需要包含密码。

### Q: 登录提示"登录已过期"？
A: 确保设置了 `JWT_SECRET` 环境变量。如果之前用了默认密钥，清除浏览器localStorage后重试。

### Q: 上传的文件丢失了？
A: 这是Render免费版的限制。重新部署后文件系统会重置。如需持久存储，建议后续接入Supabase Storage。

### Q: 数据库连接超时？
A: 检查Supabase项目是否被暂停。登录Supabase控制台，如果项目显示paused，点击恢复即可。

### Q: 如何升级到付费版？
A: 当免费版不够用时：
- Render Starter：$7/月，不休眠，1GB内存
- Supabase Pro：$25/月，8GB数据库，自动备份
- 组合费用：$32/月，可支撑百人级别使用

---

## 本地开发

如需本地运行测试：

```bash
# 安装依赖
npm install

# 设置环境变量（创建.env文件）
cp .env.example .env
# 编辑.env填入Supabase连接字符串

# 启动
npm start
```

访问 http://localhost:3000
