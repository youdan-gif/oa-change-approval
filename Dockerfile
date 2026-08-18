FROM node:18-slim

# 安装构建工具（better-sqlite3 原生模块编译备用）
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制package.json并安装依赖
COPY package.json package-lock.json* ./
RUN npm install --production

# 复制项目文件
COPY . .

# 创建数据目录（CloudBase会通过CFS挂载持久化）
RUN mkdir -p data uploads

# 环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
ENV TZ=Asia/Shanghai

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:3000/ || exit 1

# 启动命令
CMD ["node", "server.js"]
