FROM node:18-alpine

WORKDIR /app

# 复制package.json并安装依赖
COPY package.json package-lock.json* ./
RUN npm install --production

# 复制项目文件
COPY . .

# 创建上传目录
RUN mkdir -p uploads

# 暴露端口（Render会自动注入PORT环境变量）
EXPOSE ${PORT:-3000}

# 环境变量
ENV NODE_ENV=production

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:${PORT:-3000}/ || exit 1

# 启动命令
CMD ["node", "server.js"]
