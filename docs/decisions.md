# 设计决策

日期：2026-10-23

用户已批准按审阅建议推进，先完成一条最小流程。

1. 第一阶段为本机独立网页，仅绑定 127.0.0.1。平台在表单选择，不把网站固定为小红书。公开部署和跨设备访问另设里程碑。
2. Next.js + TypeScript 提供本机网页与 API；Node 内置 SQLite 保存选题、不可变输入版本和运行记录。首期调用采用 Sign in with ChatGPT 的本机订阅用量授权，不使用 API Key worker。服务端 OAuth 令牌以本机账户保护方式存储，不写入浏览器。
3. 第一条真实能力为 topic_score。OAuth 订阅调用使用 Responses API 流式请求；skill 在本机执行，按授权路由支持的自定义工具机制调用并验证文件读取回执。托管 Skills、后台响应和图像生成不用于本 OAuth 路由。账户授权、接口可用性和效果需真实登录调用验证。
4. 新 skill topic-assessment 根据 xiaohongshu-publisher 的选题比较规则适配，明确添加五维量表、输出契约与读取回执脚本。原文件保持不变；该适配版本不声称与历史作品质量相同。
5. 评测结果必须对应已保存的输入版本、skill 内容哈希、API response ID。本机只在脚本真实读取文件并验证哈希后才接受结果；模型自述不作为加载证据。
6. 未授权 ChatGPT 账户或未选择可用模型时，真实评测不可提交；仍可保存、编辑选题和查看记录。没有演示评分或伪造 GPT 结果。
7. “选题复审”属于创作前质量检查，“发布复盘”使用真实表现数据，作为不同步骤保留。第一阶段只实现前者的五维评测。
8. 不改写原初稿，使用 v2 计划记录经审阅后的实施顺序。

官方依据：[Sign in with ChatGPT 注册与登录](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)、[Responses API 调用](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)、[OAuth 预览限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)。


9. 用户提供的 6 张参考图纳入后续计划：深绿个人工作台总览、AI 选题和并排预览、选题数据面板、创作会话/素材/技能入口、不可覆盖的版本对比、后续多人协作。截图数字仅为示意；首期先实现单人工作台，不提前声称协作或数据面板可用。

10. Windows 凭据保护固定加载 `$PSHOME/Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1`，避免按名称自动加载时的模块冲突；输入输出统一 UTF-8，PowerShell 错误立即使操作失败。真实加密/解密回归检查使用测试数据覆盖中文和长 JSON；保留 Windows 账户保护，不改为明文存储，不修改系统模块或全局模块路径。

11. ChatGPT 授权模型目录遵循官方 OAuth 契约：读取 `models[]`，只展示 `visibility: "list"`，保留服务器顺序，显示 `display_name`，选模与推理传递 `slug`。不根据名称前缀筛选、不按 API Key 的 `data[].id` 格式解析；格式不匹配必须显式报错并记录日志，不能当作空目录。`tests/oauth-models.test.ts` 覆盖该契约和空目录边界。官方依据：[模型目录与推理](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)。

12. 必需的本机 Skill 读取不能只依赖提示词。OAuth 调用通过固定位置的 `additional_tools` developer 输入项声明读取工具；首轮以 `tool_choice` 强制调用，第二轮禁用工具并携带调用回执和完整历史。发起模型请求前以 UTF-8 执行读取脚本，同时核对回执哈希与实际传输文字的哈希；只有模型请求过读取工具后才提供经过校验的文本。失败时记录阶段、response ID、输出类型或本机校验类别，不记录令牌或全文。`tests/oauth-inference.test.ts` 验证实际文件文字、哈希异常、两轮协议和中断流；模拟流测试不替代真实 GPT 评测验证。官方依据：[OAuth 预览限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)、[函数调用控制](https://developers.openai.com/api/docs/guides/function-calling)。

13. 流式输出不能只依赖 `response.completed.response.output`。真实最小诊断已确认：工具调用在 `response.output_item.done` 中完整返回，但完成事件中的 `output` 仍为 `[]`。解析器按 `output_index` 收集已经完成的输出项，在完成事件未携带输出时以这些实际输出项重建列表；只有收到 `response.completed` 才接受结果，失败或中断不能由已有输出项掩盖。收集同时覆盖工具、正文和推理历史，保留原顺序与完整项；补充中文分块、尾行无换行和失败流回归检查。此前将空完成事件直接解释为模型未调用工具的判断已由真实诊断纠正。官方依据：[逐项完成事件](https://developers.openai.com/api/reference/resources/responses/streaming-events)。
