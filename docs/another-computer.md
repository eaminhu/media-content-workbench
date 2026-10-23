# 在另一台 Windows 电脑运行

本指南适用于首次在另一台 Windows 电脑启动自媒体选题工作台，并从私有数据仓库读取已有选题和评测记录。

## 准备

安装 Git for Windows 和 Node.js 22.13 或更新版本。新电脑的 GitHub 账号需要有权访问私有数据仓库；克隆时按提示登录 GitHub。

## 克隆项目和数据

在 PowerShell 中运行：

```powershell
git clone https://github.com/eaminhu/media-content-workbench.git
cd media-content-workbench
git clone https://github.com/eaminhu/media-content-workbench-data.git data
npm ci
npm run dev
```

请在首次运行工作台前克隆私有数据仓库。它会把 `data` 目录放到工作台的本地 SQLite 数据库中。若工作台已启动并创建了空数据库，先停止服务，并备份或移开现有 `data` 目录，再克隆数据仓库。

## 打开网页并登录

保持 PowerShell 窗口运行，在浏览器打开：

```text
http://127.0.0.1:3000
```

进入“连接与使用说明”，使用 ChatGPT 完成本机授权并选择可用模型。每台电脑都要单独授权；令牌保存在本机 Windows 用户目录，不会存入仓库。

停止服务时回到 PowerShell 按 `Ctrl+C`。下次启动时进入项目目录并运行 `npm run dev`。

## 在两台电脑间更新记录

SQLite 文件不能由 Git 自动合并。切换电脑时，一次只在一台电脑运行工作台：

1. 在当前电脑按 `Ctrl+C` 停止服务。
2. 将当前数据库提交并推送到私有数据仓库。
3. 在另一台电脑停止服务后，先拉取最新记录，再启动工作台。

在已克隆私有数据仓库到 `data` 目录的电脑上，提交更新：

```powershell
cd data
git add workbench.sqlite
git commit -m "data: 更新工作台记录"
git push
```

拉取另一台电脑推送的记录：

```powershell
git -C data pull --ff-only
```

原电脑的现有工作台使用项目目录内的 `data`，私有数据仓库克隆在另一个目录。若在原电脑新增记录，停止服务后，把数据库复制到私有仓库克隆目录，再提交推送：

```powershell
Copy-Item "<工作台目录>\data\workbench.sqlite" "<私有数据仓库目录>\workbench.sqlite" -Force
Set-Location "<私有数据仓库目录>"
git add workbench.sqlite
git commit -m "data: 更新工作台记录"
git push
```

替换上面两个路径为这台电脑上的实际目录。所有工作台数据都保存在私有数据仓库；不要将 SQLite 数据提交到公开的代码仓库。
