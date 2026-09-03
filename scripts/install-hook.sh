#!/bin/sh
# MyHealth — 安装 pre-commit 版本纪律校验 hook
# 用法: sh scripts/install-hook.sh
# 或: node scripts/install-hook.js (Windows)

set -e
ROOT="$(git rev-parse --show-toplevel)"
HOOK="$ROOT/.git/hooks/pre-commit"

cat > "$HOOK" <<'EOF'
#!/bin/sh
# MyHealth pre-commit hook — 版本纪律校验 (AGENTS.md)
# 用 git rev-parse 取仓库根，避免 MSYS 下 dirname + cd 拼出 E:\e\dd 这类错路径
cd "$(git rev-parse --show-toplevel)"
node scripts/check-release.js
EOF

chmod +x "$HOOK" 2>/dev/null || true
echo "✅ pre-commit hook installed: $HOOK"
echo "   每次 bump APP_VERSION 未同步 changelog/README 时，提交会被自动拦截。"
