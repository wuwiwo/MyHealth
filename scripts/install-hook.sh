#!/bin/sh
# MyHealth — 安装 pre-commit 版本纪律校验 hook
# 用法: sh scripts/install-hook.sh
# 或: node scripts/install-hook.js (Windows)

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$ROOT/.git/hooks/pre-commit"

cat > "$HOOK" <<EOF
#!/bin/sh
# MyHealth pre-commit hook — 版本纪律校验 (AGENTS.md)
ROOT="\$(cd "\$(dirname "\$0")/../.." && pwd)"
node "\$ROOT/scripts/check-release.js"
EOF

chmod +x "$HOOK" 2>/dev/null || true
echo "✅ pre-commit hook installed: $HOOK"
echo "   每次 bump APP_VERSION 未同步 changelog/README 时，提交会被自动拦截。"
