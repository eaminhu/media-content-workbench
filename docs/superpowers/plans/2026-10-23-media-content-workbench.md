# 自媒体选题工作台 实施计划

> 面向实施者：按任务顺序执行，用复选框记录进度。默认在当前会话内顺序完成；只有用户明确要求时才委派子代理。

**目标：** 构建独立网页，让用户按步骤运行已有内容 skills，并保存选题、评测、文案、复盘、图片和校正记录。

**架构：** Next.js 全栈应用；浏览器只访问自有后端。后端按步骤调用 OpenAI Agents API，加载审核和适配后的 skill 目录，并通过受限工具访问项目数据与图片生成能力。PostgreSQL 保存结构化数据，持久化对象存储保存图片。

**技术栈：** TypeScript、Next.js App Router、PostgreSQL、Prisma、OpenAI Agents API、OpenAI 图像生成 API、S3 兼容对象存储。

---

## 范围与关键决定

首版面向单个创作者，以小红书图文为默认平台；平台、受众、账号定位和系列风格均为项目配置。首批规则来源：xiaohongshu-publisher（选题与复盘）、tudongbaike-infographic（科普内容评测和视觉验收）、natural-copy-rewriter（自然语言优化）、baoyu-xhs-images 与筛选后的 baoyu-image-gen（图卡和图片生成）。baoyu-image-cards 与 baoyu-xhs-images 功能重叠，首版只接入后者。

首版不做社媒账号登录、自动发布、公开多租户注册或任意用户上传 skill。现有 skill 中面向 Codex/Hermes 的工具名、本地 CLI 和浏览器操作需改成明确的服务端工具，不能执行任意 shell。

### 流程步骤

| 稳定步骤 ID | 网页操作 | 输出 |
|---|---|---|
| topic_generate | 生成选题 | 候选题、目标读者、读者问题、切入角度、事实待查项 |
| topic_score | 维度评测 | 分数、理由、排序、风险和建议 |
| topic_polish | 打磨选题 | 保留方向后的改进版本 |
| copy_naturalize | 自然语言优化 | 保留事实与意图的优化稿、改动说明 |
| retrospective | 选题复盘 | 基于录入数据的观察、结论和下一轮假设 |
| image_generate | 做图 | 逐页方案、提示词和图片资产 |
| proofread | 校正 | 文案和图片的问题位置、建议及复核状态 |

每次点击只运行一个步骤。编辑产生新版本；下游步骤读取用户确认的最新版本，不覆盖旧稿。

## 文件清单

| 文件 | 职责 |
|---|---|
| package.json、.env.example | 应用脚本、依赖和环境变量示例，不含密钥 |
| prisma/schema.prisma | Project、Topic、WorkflowRun、Artifact、PerformanceMetric 数据模型 |
| src/app/page.tsx | 项目列表入口 |
| src/app/projects/[projectId]/page.tsx | 项目工作区和流程步骤 |
| src/app/api/projects/route.ts | 创建与列出项目 |
| src/app/api/projects/[projectId]/runs/route.ts | 启动指定步骤并返回进度 |
| src/app/api/runs/[runId]/route.ts | 读取运行状态和结果 |
| src/app/api/topics/[topicId]/route.ts | 保存用户修改后的版本 |
| src/lib/openai/agents.ts | Agents API 会话、事件和结果适配 |
| src/lib/skills/registry.ts | 步骤 ID 到审核后 skill 目录和版本的受限映射 |
| src/lib/workflows/contracts.ts | 输入、输出和状态 schema |
| src/lib/workflows/run-step.ts | 校验输入、组装任务、调用 Agent、保存结果 |
| src/lib/storage/assets.ts | 图片对象存储和短时下载链接 |
| skills/ | 审核、适配后的 SKILL.md 和必要参考文件 |
| docs/skill-migration.md | 原 skill 到网站 skill/工具的映射 |
| docs/operations.md | 本地启动、部署、密钥和故障说明 |

## 任务 1：初始化应用

文件：package.json、.env.example、src/app/layout.tsx、src/app/page.tsx

- [ ] 建立 Next.js App Router 与 TypeScript 项目骨架，记录 Node LTS 要求。
- [ ] 建立服务端环境变量读取；缺少配置时明确报错，只显示变量名，不打印密钥。
- [ ] 建立项目列表页空状态和新建项目入口。
- [ ] 验收：本地页面可打开；无数据库/API 配置时不会显示伪造结果。

## 任务 2：数据模型与项目工作区

文件：prisma/schema.prisma、src/app/projects/[projectId]/page.tsx、src/app/api/projects/route.ts、src/app/api/topics/[topicId]/route.ts

- [ ] Project 保存名称、平台、受众、账号定位、系列/语气和避用表达。
- [ ] Topic 保存标题、读者问题、切入角度、状态和当前版本号。
- [ ] WorkflowRun 保存步骤 ID、skill 版本、模型、输入/输出 JSON、状态、错误、耗时和时间戳。
- [ ] Artifact 保存运行 ID、存储 key、媒体类型、尺寸和校正状态。
- [ ] PerformanceMetric 保存发布日期、平台、曝光、点击/阅读、留存、收藏、分享、评论、关注和样本备注；指标允许缺失。
- [ ] 用数据库 ID 建立关联，不以标题作为主键。
- [ ] 验收：创建项目、添加选题、编辑生成新版本，刷新后数据仍存在。

## 任务 3：迁移 skills 并接入 Agents API

文件：skills/、src/lib/skills/registry.ts、src/lib/openai/agents.ts、docs/skill-migration.md

- [ ] 复制并审核必需 skill 文件，保留来源、版本和授权信息。
- [ ] 移除 Codex/Hermes 专用工具名、机器路径假设和交互示例；图片、文件、检索功能改由后端工具提供。
- [ ] 建立固定的步骤 ID 到 skill ID/版本映射，用户不能指定任意本地 skill 路径。
- [ ] 为 Agents API session 配置能力目录，只挂载当前步骤所需的 skill 与工具。
- [ ] 对输出按步骤 schema 解析；API 错误、超时和解析错误标记为 failed，保存诊断信息。
- [ ] 验收：每一步可确认加载了正确 skill；记录能追溯 skill 版本、模型、run ID 和错误原因。

## 任务 4：工作流 API 和运行状态

文件：src/lib/workflows/contracts.ts、src/lib/workflows/run-step.ts、src/app/api/projects/[projectId]/runs/route.ts、src/app/api/runs/[runId]/route.ts

- [ ] 定义步骤 ID 枚举及每步输入/输出 schema。
- [ ] 运行前校验项目归属、必填字段、图片大小/类型和输入版本。
- [ ] 创建 queued 记录，运行后更新为 running、succeeded 或 failed。
- [ ] 前端读取运行状态并显示进度、结果或明确错误；不以空值代替失败。
- [ ] 新输出创建新版本，已确认内容保持只读；重复请求带幂等键。
- [ ] 验收：跨项目访问被拒绝；失败可见、可重试，且不会覆盖既有稿件。

## 任务 5：工作台界面和版本确认

文件：src/app/page.tsx、src/app/projects/[projectId]/page.tsx、新增流程卡片与版本编辑组件

- [ ] 实现项目配置、选题列表、维度评分、理由、建议、状态和筛选。
- [ ] 每个步骤显示输入摘要、运行状态、结果、编辑区、版本和重跑操作。
- [ ] 打磨与自然语言优化支持原文/新稿对照；用户点击“采用”后才设为当前版本。
- [ ] 复盘只接受用户录入的表现数据，未提供指标明确显示缺失。
- [ ] 验收：从建项目到校正可顺序操作，刷新后恢复工作状态。

## 任务 6：做图和校正

文件：src/lib/storage/assets.ts、新增图片生成/校正 API 路由及预览组件

- [ ] 保存图卡方案和逐页提示词，再由服务端调用图像生成 API。
- [ ] 图片上传到持久化对象存储；数据库只保存元信息和存储 key。
- [ ] 视觉模型检查图片文字、页序、术语和与文案的一致性，结果指出页码、问题和建议。
- [ ] 校正前要求用户确认；修改图像后保存新版本，旧图可回退。
- [ ] 限制生成数量、文件大小、超时和重试次数；不自动发布。
- [ ] 验收：图片可预览、下载并关联到选题版本；失败不会丢失提示词或已生成资产。

## 任务 7：访问控制、部署与交接

文件：部署配置、docs/operations.md、服务端鉴权与日志配置

- [ ] 首版启用单用户登录或私有访问保护，写接口校验会话和来源策略。
- [ ] API 密钥放部署平台的服务端 Secret，不进入浏览器包、数据库明文或日志。
- [ ] 部署 PostgreSQL 与持久化对象存储，配置备份和资产清理策略。
- [ ] 限制并发、每日运行数、生成张数和请求体大小；记录用量/成本。
- [ ] 端到端人工验收：建项目、生成选题、评测、打磨、改写、录入复盘、做图、校正、刷新恢复、失败重试。
- [ ] 验收：真实 API 运行成功，结果可导出；密钥和私有图片不公开。

## 完成标准

- 每次运行可追溯项目、输入版本、skill 版本、模型、状态和输出。
- 选题、文案和图片可查看历史并回退；失败不会伪装成成功。
- 密钥仅保留在服务端，项目和图片受访问控制保护。
- 完成端到端人工验收并记录实际结果。