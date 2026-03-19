#!/bin/sh
# Install git hooks for this repository.
# Run once after cloning: sh scripts/install-hooks.sh

HOOK_DIR="$(git rev-parse --show-toplevel)/.git/hooks"

cat > "$HOOK_DIR/pre-commit" << 'EOF'
#!/bin/sh
echo "Running tests before commit..."
npm test
EOF

chmod +x "$HOOK_DIR/pre-commit"
echo "pre-commit hook installed."
