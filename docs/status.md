# 当前状态

更新日期：2026-10-23。

已实现：本机 Next.js + TypeScript 网页；SQLite 选题和不可变输入版本；Sign in with ChatGPT 授权入口、PKCE/state/nonce 校验、ID Token 签名验证、计划用量范围检查；Windows DPAPI 保护的本机凭据存储与令牌续期；可用 GPT 模型读取和选择；Responses API 流式评测（store:false），本机执行 topic-assessment 读取脚本并校验回执；评测运行记录；设置页授权、选模与退出；六张参考图所代表的功能方向已加入 v2 路线图。

已完成的本地检查：TypeScript 检查通过；Windows 凭据保护回归检查通过，真实调用加密和解密函数，在独立 PowerShell 进程间完整还原普通 JSON、含中文和长字符串的 JSON。运行命令：`node --import tsx --test tests/windows-credential.test.ts`。网页服务原会话仍在运行。

真实登录进展：修复 Windows 安全模块加载冲突后，用户真实授权回调已返回 303，工作台显示已连接；本机加密凭据可被服务正常读取。日志不输出原始凭据或 PowerShell 错误全文。

模型目录修复：此前将 OAuth 的 `models[].slug/display_name/visibility` 错按 API Key 的 `data[].id` 读取，误报无模型。现按官方 OAuth 契约校验数据、按可见性展示、保留服务器顺序，并使选模校验使用 slug。真实账户目录请求 HTTP 200，返回 9 条，其中 7 条可展示；名称过滤已移除。浏览器实际点击“读取可用模型”后已显示全部 7 个选项；随后页面显示当前模型为 `gpt-6-luna`、GPT 已准备就绪。四项模型目录回归检查及 TypeScript 检查通过。

真实评测进展：早期运行因解析器只检查完成事件中的输出而误报“未调用 Skill”，旧失败记录保留。17:10 再次失败后，真实最小工具调用诊断确认：`response.output_item.done` 已含完整调用，而末尾 `response.completed.output` 仍为空。解析器现按索引收集完成项，并只在整体完成后用于结果校验；同时覆盖工具调用、推理历史和正文。此前的工具声明、强制调用、UTF-8 与哈希预检仍保留。六项相关回归检查和 TypeScript 检查通过。

首次完整成功验证：用户明确批准临时增加一次评测后，工作台每日上限由 3 临时增至 4；同一已提交选题版本通过正式接口完成，HTTP 200，运行 `793443e3-42a5-4c83-a1da-31716f5f8805` 状态为 `succeeded`，模型 `gpt-6-luna`，`skillReadVerified=true`，已保存五个评测维度及“资料不足”结论。接口再次读取确认结果存在、上限已恢复 3；浏览器刷新后显示“已完成”、五维评分和“已核对文件读取回执”。首轮日志显示完整 function_call，第二轮显示 reasoning 与 message；旧运行未覆盖。

未验证：订阅实际用量账单、令牌续期及评测结果质量的人工基准比较。真实登录、模型选择、Skill 读取证明、两轮 GPT 调用与结果保存已完成一次实际数据验证。未生成图像；OAuth 路由官方不支持图像生成。

下一步：用户可查看已保存的成功结果，补充受众、具体情境和可靠依据后保存新版本，再按每日上限评测。参考图里的数据趋势只在后续接入真实表现数据后展示，多人协作另排阶段。
