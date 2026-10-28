@echo off
rem 逆水小助手 · 本机一键启动后端（C:\nixiao 下的 MySQL/Node 绿色版 + 项目 API）
rem 数据落盘：C:\nixiao\mysqldata ；库：xiaqi（root 无密码，仅限本机开发）
setlocal
set NODE=C:\nixiao\node
set MYSQL=C:\nixiao\mysql\bin
set DATADIR=C:\nixiao\mysqldata
set PATH=%NODE%;%MYSQL%;%PATH%

echo [1/4] 初始化 MySQL 数据目录（仅首次）...
if not exist "%DATADIR%\mysql" mysqld --no-defaults --initialize-insecure --datadir="%DATADIR%" --character-set-server=utf8mb4

echo [2/4] 启动 mysqld（若未运行）...
tasklist | findstr /i mysqld.exe >nul || start "mysqld" /min mysqld --no-defaults --datadir="%DATADIR%" --port=3306 --character-set-server=utf8mb4
timeout /t 4 /nobreak >nul

echo [3/4] 建库（幂等）...
mysql --no-defaults -uroot --port=3306 -e "CREATE DATABASE IF NOT EXISTS xiaqi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql --no-defaults -uroot --port=3306 --default-character-set=utf8mb4 --database=xiaqi < "%~dp0sql\schema.sql"

echo [4/4] 依赖 + 种子 + 启动 API（Ctrl+C 停止）...
cd /d "%~dp0"
if not exist node_modules npm install --registry=https://registry.npmmirror.com
npm run seed
node src/index.js
