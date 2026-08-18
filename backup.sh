#!/bin/bash
# ============================================
# 变更审批OA系统 - 数据备份脚本
# ============================================

BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="oa_backup_${TIMESTAMP}.tar.gz"

mkdir -p $BACKUP_DIR

echo "开始备份变更审批OA系统数据..."

# 备份数据库和上传文件
docker-compose exec -T oa-system tar czf - -C /app data uploads > "${BACKUP_DIR}/${BACKUP_FILE}" 2>/dev/null

if [ $? -eq 0 ]; then
  SIZE=$(du -h "${BACKUP_DIR}/${BACKUP_FILE}" | awk '{print $1}')
  echo "备份成功: ${BACKUP_DIR}/${BACKUP_FILE} (${SIZE})"
  
  # 清理30天前的备份
  find $BACKUP_DIR -name "oa_backup_*.tar.gz" -mtime +30 -delete 2>/dev/null
  echo "保留最近30天的备份"
else
  echo "备份失败，请确认Docker服务正在运行"
  exit 1
fi
