# Alien Zoo 真实对话连接说明

## 安全暂停

AI_CALLS_ENABLED未设置时默认关闭。开放参与配置设为true以启用游戏模型调用；设为false可立即暂停。旧报告AI还要求LEGACY_REPORT_AI_ENABLED=true，默认不启用。密钥只保存在Supabase后台，不放进源码、网页或聊天；网站限额不等于供应商账户的金额上限。

## 已有配置

继续使用原GitHub Pages与Supabase项目moryybvgocdtevhmaqyd。所需DEEPSEEK_API_KEY和Supabase运行时密钥均留在服务器，不需要填写到游戏页面，也不要写入仓库或聊天。游戏默认模型为deepseek-flash，DEEPSEEK_MODEL可覆盖。

## 路由与权限

POST /game/access：提交游戏会话UUID和组别，签发两小时有效的游戏专用凭据。POST /game/chat：验证X-Game-Token与会话、组别后处理文字对话。该凭据不授予任何数据库读取或研究者权限；网页刷新后重新签发，不保存到本地存储或导出文件。

默认不设全项目或单会话对话总次数上限；同一会话8条/分钟，签发连接400次/UTC日。GAME_DAILY_CHAT_LIMIT和GAME_SESSION_CHAT_LIMIT只有设为正整数时才启用对应总量限制，0或未设置表示不启用。公开入口不验证参与者身份，任何访问者都可领取游戏凭据；不能保证阻止脚本仿造请求。额度使用原study2_reserve_quota原子函数，不需要新增数据库表。仅追加额度计数，不修改历史报告记录。

/game/路由独立处理游戏会话；旧/start、/progress、/complete、/chat和/api/ai仍按原有研究者验证执行。/research/*和research-api仅允许已确认的huangrui1008@gmail.com与服务器UUID名单；数据库依然禁止anon/authenticated直接读取。平台verify_jwt配置继续为false，由各路由内部完成各自鉴权。

## 交互与数据

两组均为真实文本对话。A可给完整食谱；B提供线索，不返回完整食谱字段。输入文字与近期对话、可见的历史投喂数据发送给模型，不传系统规则、隐藏答案或用户凭据。模型输出需为JSON，返回自然语言text和可选recipe，前端分开显示文本和可一键填入的食谱。

每次发送后保留本机聊天记录；请求失败明确标记，可重试，不生成模拟助手回复，也不会因失败解锁投喂。历史模拟轮次保留原样。现阶段游戏数据仍是浏览器localStorage本机记录；研究者JSON导出包含聊天记录和事件，CSV仍为会话摘要。完整问卷流程、正式知情同意与条目未接入，不能当作完整正式施测版本。

## 检查与部署

npm test覆盖A/B全流程、连续对话、IME键盘操作、一键填入、失败重试、游戏凭据签名/失效/组别绑定、配额与研究数据隔离。后端源文件为supabase/functions/experiment-api/index.ts、handler.mjs、game-chat.mjs；前端为index.html、alien-zoo.js和participant.css。部署保持原项目和既有数据。

## A组高收益食谱

游戏请求传difficulty（basic或advanced），旧客户端根据未改动的H1记录识别难度，缺少可识别记录时缺省advanced。用户索要食谱时，game-plans.mjs先按原规则计算高收益候选并按轮次选定一份，由模型解释；自由追问可选择候选plan_id或仅回答问题。服务器校验后返回recipe、expected_delta和recipe_rule_version。进阶增量8、基础增量6；不改变客户端投喂规则或初始示例，不发送后测答案。B组不接收此候选工具，仍只给分析线索。模型未选择有效候选时明确报错，不悄悄替换为固定回复。游戏数据仍在本机，历史记录不重算。
