#!/bin/bash
# ============================================
# 变更审批OA系统 - 一键部署脚本
# ============================================

set -e

echo ""
echo "=========================================="
echo "  工程变更审批OA系统 - 一键部署"
echo "=========================================="
echo ""

# 检查是否root
if [ "$EUID" -ne 0 ]; then
  echo "[!] 建议使用root用户运行此脚本"
  echo "    如非root用户，请确保docker命令可用"
fi

# 检查Docker
echo "[1/5] 检查Docker环境..."
if ! command -v docker &> /dev/null; then
  echo "[X] Docker未安装，正在安装..."
  curl -fsSL https://get.docker.com | sh
  systemctl start docker
  systemctl enable docker
  echo "[OK] Docker安装完成"
else
  echo "[OK] Docker已安装: $(docker --version)"
fi

# 检查docker-compose
echo ""
echo "[2/5] 检查Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
  if docker compose version &> /dev/null; then
    echo "[OK] Docker Compose (plugin) 已安装"
    COMPOSE_CMD="docker compose"
  else
    echo "[X] Docker Compose未安装，正在安装..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    COMPOSE_CMD="docker-compose"
    echo "[OK] Docker Compose安装完成"
  fi
else
  COMPOSE_CMD="docker-compose"
  echo "[OK] Docker Compose已安装: $(docker-compose --version)"
fi

# 构建并启动
echo ""
echo "[3/5] 构建Docker镜像..."
$COMPOSE_CMD build
echo "[OK] 镜像构建完成"

echo ""
echo "[4/5] 启动服务..."
$COMPOSE_CMD up -d
echo "[OK] 服务已启动"

# 等待服务就绪
echo ""
echo "[5/5] 等待服务启动..."
for i in $(seq 1 15); do
  if curl -s http://localhost:3000/ > /dev/null 2>&1; then
    echo "[OK] 服务已就绪!"
    break
  fi
  sleep 1
  echo "    等待中... ($i/15)"
done

# 获取服务器IP
SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "=========================================="
echo "  部署成功!"
echo "=========================================="
echo ""
echo "  访问地址:  http://$SERVER_IP:3000"
echo "  管理员账号: admin"
echo "  管理员密码: admin123"
echo ""
echo "  数据目录:   /app/data (Docker卷: oa-data)"
echo "  附件目录:   /app/uploads (Docker卷: oa-uploads)"
echo ""
echo "  常用命令:"
echo "    查看日志:   $COMPOSE_CMD logs -f"
echo "    重启服务:   $COMPOSE_CMD restart"
echo "    停止服务:   $COMPOSE_CMD down"
echo "    备份数据:   ./backup.sh"
echo ""
echo "=========================================="
