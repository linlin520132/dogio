# HTTPS 配置指南

## 问题描述
当网站使用HTTPS时，浏览器会阻止HTTPS页面请求HTTP资源（混合内容警告）。

## 解决方案
结合使用方法1（生成SSL证书）和方法2（配置HTTPS服务器）。

## 配置步骤

### 1. 生成SSL证书

#### Windows
```bash
# 运行批处理脚本
generate-ssl-cert.bat
```

#### macOS/Linux
```bash
# 运行shell脚本
./generate-ssl-cert.sh
```

或者手动执行：
```bash
# 安装mkcert
# macOS
brew install mkcert

# Ubuntu/Debian
sudo apt install mkcert

# 初始化
mkcert -install

# 生成证书
mkcert 148.135.52.253
```

### 2. 放置证书文件
将生成的两个文件放置在项目根目录：
- `148.135.52.253.pem`
- `148.135.52.253-key.pem`

### 3. 重启服务器
```bash
npm start
```

服务器会自动检测证书文件并启动HTTPS服务器（端口3443）。

### 4. 验证配置
- HTTP访问：`http://148.135.52.253:3000`
- HTTPS访问：`https://148.135.52.253:3443`

## 技术细节

### 服务器配置
- HTTP端口：3000
- HTTPS端口：3443
- 自动检测证书文件

### 前端配置
`monitor.html` 会根据页面协议自动选择API地址：
- HTTPS页面 → `https://148.135.52.253:3443`
- HTTP页面 → `http://148.135.52.253:3000`

## 故障排除

### 证书生成失败
- 确保mkcert正确安装
- 检查网络连接（mkcert需要下载根证书）

### HTTPS服务器启动失败
- 检查证书文件是否存在
- 检查文件权限
- 查看服务器日志

### 浏览器警告
- 自签名证书会被浏览器标记为不安全，但功能正常
- 可以点击"高级"→"继续访问"来忽略警告

## 生产环境建议
对于生产环境，建议使用正规CA颁发的SSL证书：
- Let's Encrypt（免费）
- DigiCert、GlobalSign等商业证书
- 云服务商提供的SSL证书
