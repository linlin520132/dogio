#!/bin/bash

echo "生成SSL证书..."
echo

# 检查操作系统
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    echo "检测到macOS系统"
    if ! command -v brew &> /dev/null; then
        echo "请先安装Homebrew: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        exit 1
    fi
    echo "安装mkcert..."
    brew install mkcert
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    echo "检测到Linux系统"
    echo "请手动安装mkcert:"
    echo "  Ubuntu/Debian: sudo apt install mkcert"
    echo "  CentOS/RHEL: sudo yum install mkcert"
    echo "  Arch: sudo pacman -S mkcert"
    echo
    echo "或者从 https://github.com/FiloSottile/mkcert/releases 下载"
    exit 1
else
    echo "不支持的操作系统: $OSTYPE"
    echo "请从 https://github.com/FiloSottile/mkcert/releases 手动下载mkcert"
    exit 1
fi

echo
echo "初始化mkcert..."
mkcert -install

echo
echo "生成证书 (IP: 148.135.52.253)..."
mkcert 148.135.52.253

echo
echo "证书生成完成！"
echo "文件: 148.135.52.253.pem 和 148.135.52.253-key.pem"
echo
echo "请将这两个文件放在项目根目录，然后重启服务器。"
