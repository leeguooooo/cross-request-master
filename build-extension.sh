#!/bin/bash

# Cross Request Master - Extension Build Script
# 用于打包 Chrome 扩展

set -e

echo "🚀 开始打包 Cross Request Master 扩展..."

# 设置变量
EXTENSION_NAME="cross-request-master"
VERSION=$(node -p "require('./package.json').version")
BUILD_DIR="build"
ARTIFACT_DIR=".artifacts/releases"
ZIP_NAME="${EXTENSION_NAME}-v${VERSION}.zip"
ZIP_PATH="${ARTIFACT_DIR}/${ZIP_NAME}"

echo "📦 版本: ${VERSION}"
echo "📁 构建目录: ${BUILD_DIR}"
echo "📄 输出文件: ${ZIP_PATH}"

# 清理旧的构建目录
if [ -d "$BUILD_DIR" ]; then
    echo "🧹 清理旧的构建目录..."
    rm -rf "$BUILD_DIR"
fi

# 创建构建目录
echo "📁 创建构建目录..."
mkdir -p "$BUILD_DIR"
mkdir -p "$ARTIFACT_DIR"

# 复制必要的文件
echo "📋 复制扩展文件..."

# 核心文件
cp manifest.json "$BUILD_DIR/"
cp background.js "$BUILD_DIR/"
cp content-script.js "$BUILD_DIR/"
cp index.js "$BUILD_DIR/"
cp popup.html "$BUILD_DIR/"
cp popup.js "$BUILD_DIR/"
cp jquery-3.1.1.js "$BUILD_DIR/"

# 图标目录
cp -r icons "$BUILD_DIR/"

# 源码目录
cp -r src "$BUILD_DIR/"

# 创建 README 文件（简化版）
cat > "$BUILD_DIR/README.txt" << EOF
Cross Request Master v${VERSION}
Chrome Extension for YApi Cross-Origin Requests

安装说明:
1. 打开 Chrome 浏览器
2. 访问 chrome://extensions/
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择此文件夹

更多信息请访问:
https://github.com/leeguooooo/cross-request-master
EOF

# 创建 ZIP 文件
echo "📦 创建 ZIP 文件..."
cd "$BUILD_DIR"
zip -r "../${ZIP_PATH}" . -x "*.DS_Store" "*.git*"
cd ..

# 显示结果
echo "✅ 打包完成!"
echo "📄 输出文件: ${ZIP_PATH}"
echo "📊 文件大小: $(du -h "${ZIP_PATH}" | cut -f1)"

# 验证 ZIP 文件
echo "🔍 验证 ZIP 文件内容..."
unzip -l "${ZIP_PATH}" | head -20

echo ""
echo "🎉 扩展打包成功!"
echo "📤 可以上传到 Chrome Web Store 或用于本地安装"
echo "🔗 Chrome Web Store: https://chrome.google.com/webstore/detail/efgjanhcajpiljllnehiinpmicghbgfm"
