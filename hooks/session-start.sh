#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"

status_of() {
  local path="$1"
  if [ -e "$path" ]; then
    printf '存在'
  else
    printf '缺失'
  fi
}

printf '[Harness 启动检查] 自动加载层：rules=%s, agents=%s, skills=%s\n' \
  "$(status_of "$ROOT/.claude/rules")" \
  "$(status_of "$ROOT/.claude/agents")" \
  "$(status_of "$ROOT/.claude/skills")"

printf '[Harness 启动检查] 资产层：templates=%s, changes=%s, specs=%s\n' \
  "$(status_of "$ROOT/harness/templates")" \
  "$(status_of "$ROOT/harness/changes")" \
  "$(status_of "$ROOT/harness/specs")"

if [ -f "$ROOT/.mcp.json" ]; then
  printf '[Harness 启动检查] 项目级 MCP：已声明 .mcp.json\n'
else
  printf '[Harness 启动检查] 项目级 MCP：尚未声明 .mcp.json（后续阶段补齐）\n'
fi

printf '[Harness 启动检查] 当前仍为本地企业 Harness 骨架阶段，请以仓库文件为准，不以聊天记忆为准。\n'
