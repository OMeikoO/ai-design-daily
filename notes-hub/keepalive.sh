#!/bin/bash
# 标注笔记库保活：端口 8788
DIR="$(cd "$(dirname "$0")" && pwd)"
if ! curl -s -m 3 http://127.0.0.1:8788/api/docs >/dev/null 2>&1; then
  if [ -n "$(ss -tlnp 2>/dev/null | grep 8788)" ]; then
    PID=$(ss -tlnp 2>/dev/null | grep 8788 | grep -oP 'pid=\K\d+' | head -1)
    [ -n "$PID" ] && kill "$PID" 2>/dev/null && sleep 1
  fi
  cd "$DIR" && setsid nohup python3 -u server.py > server.log 2>&1 < /dev/null &
  sleep 2
  curl -s -m 3 http://127.0.0.1:8788/api/docs >/dev/null && echo "notes-hub 已启动 (8788)"
else
  echo "notes-hub 运行中 (8788)"
fi
