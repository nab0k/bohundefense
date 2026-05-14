#!/bin/bash

# ─────────────────────────────────────────────
#  Bohun Defence Advisory — GitHub Pages deploy
#  Run once from your local machine:
#    chmod +x deploy.sh && ./deploy.sh
# ─────────────────────────────────────────────

set -e

# ── CONFIG — change these two lines ──────────
GITHUB_USERNAME="your-github-username"
REPO_NAME="bohun-defence-advisory"
# ─────────────────────────────────────────────

REPO_URL="https://github.com/${GITHUB_USERNAME}/${REPO_NAME}.git"

echo ""
echo "▸ Bohun Defence Advisory — deploy to GitHub Pages"
echo "  Repo: ${REPO_URL}"
echo ""

# 1. Init git if not already
if [ ! -d ".git" ]; then
  echo "▸ Initialising git repository..."
  git init
  git branch -M main
fi

# 2. Create .gitignore
cat > .gitignore << 'EOF'
.DS_Store
Thumbs.db
*.log
EOF

# 3. Stage everything
echo "▸ Staging files..."
git add -A

# 4. Commit
TIMESTAMP=$(date +"%Y-%m-%d %H:%M")
git commit -m "Deploy: ${TIMESTAMP}" --allow-empty

# 5. Set remote (add or update)
if git remote get-url origin &>/dev/null; then
  git remote set-url origin "${REPO_URL}"
else
  git remote add origin "${REPO_URL}"
fi

# 6. Push
echo "▸ Pushing to GitHub..."
git push -u origin main

echo ""
echo "✓ Done. Now enable GitHub Pages:"
echo "  1. Go to: https://github.com/${GITHUB_USERNAME}/${REPO_NAME}/settings/pages"
echo "  2. Source → Deploy from a branch"
echo "  3. Branch: main / (root) → Save"
echo ""
echo "  Your site will be live at:"
echo "  https://${GITHUB_USERNAME}.github.io/${REPO_NAME}/"
echo ""
echo "  For a custom domain, come back after setting up DNS on Imena.ua"
