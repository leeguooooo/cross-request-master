#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE_SKILL="${REPO_ROOT}/packages/yapi-mcp/skill-template/SKILL.md"
STAGE_ROOT="${REPO_ROOT}/.clawhub/skills"
TARGET_SKILL_DIR="${STAGE_ROOT}/yapi"
TARGET_SKILL="${TARGET_SKILL_DIR}/SKILL.md"

if [[ ! -f "${SOURCE_SKILL}" ]]; then
  echo "[clawhub-sync] 未找到技能模板: ${SOURCE_SKILL}" >&2
  exit 1
fi

mkdir -p "${TARGET_SKILL_DIR}"
cp "${SOURCE_SKILL}" "${TARGET_SKILL}"

if command -v clawhub >/dev/null 2>&1; then
  CLI_BIN="clawhub"
elif command -v clawdhub >/dev/null 2>&1; then
  CLI_BIN="clawdhub"
else
  echo "[clawhub-sync] 未找到 clawhub/clawdhub 命令，请先安装 CLI。" >&2
  exit 1
fi

exec "${CLI_BIN}" sync --root "${STAGE_ROOT}" "$@"
