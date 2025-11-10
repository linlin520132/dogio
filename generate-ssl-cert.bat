@echo off
echo 生成SSL证书...
echo.

echo 安装mkcert...
choco install mkcert -y

echo.
echo 初始化mkcert...
mkcert -install

echo.
echo 生成证书 (IP: 148.135.52.253)...
mkcert 148.135.52.253

echo.
echo 证书生成完成！
echo 文件: 148.135.52.253.pem 和 148.135.52.253-key.pem
echo.
echo 请将这两个文件放在项目根目录，然后重启服务器。

pause
