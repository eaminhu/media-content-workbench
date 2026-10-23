# 自媒体选题工作台

独立网页，按步骤管理选题、评测、文案与图片。当前第一阶段已提供选题录入、正式保存、历史输入版本、导出与 GPT 连接状态。

## 本机启动

已安装项目依赖。运行 npm run dev，访问 http://127.0.0.1:3000。授权与评测由本机网页服务处理，无需单独启动 worker。

工作台使用 Sign in with ChatGPT 本机授权登录，评测请求使用订阅用量，不使用 API Key。图像生成不受 OAuth 路由支持。首次授权和模型选择在“连接与使用说明”页操作。参考界面与功能方向已写入 v2 实施计划。

## 文档

- [v2 实施计划](docs/superpowers/plans/2026-10-23-media-content-workbench-v2.md)
- [当前状态](docs/status.md)
- [设计决策](docs/decisions.md)
- [审阅记录](docs/reviews/2026-10-23-plan-review.md)

实际 API 未联调前，不把已实现的接口当作已验证的 GPT 能力。后续流程在页面明确标为后续接入。
