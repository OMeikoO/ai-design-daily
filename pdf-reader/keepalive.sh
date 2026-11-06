#!/bin/bash
# 学习阅读器 · 保活脚本（定时任务每 30 分钟调用）
# 服务健在则静默退出；挂了则以独立会话拉起，避免随任务进程被回收
LOG=/workspace/pdf-reader/server.log
if curl -sf -m 5 http://127.0.0.1:8787/api/health > /dev/null 2>&1; then
  exit 0
fi
cd /workspace/pdf-reader
setsid nohup python3 -u server.py >> "$LOG" 2>&1 < /dev/null &
sleep 2
if curl -sf -m 5 http://127.0.0.1:8787/api/health > /dev/null 2>&1; then
  echo "[keepalive] $(date '+%F %T') server restarted" >> "$LOG"
fi
