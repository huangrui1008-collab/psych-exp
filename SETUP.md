# Alien Zoo 真实对话连接说明

## 安全暂停

AI_CALLS_ENABLED默认关闭。仅在实验专用密钥与调用预算配置完成后，才可将其设置为true恢复模型调用。密钥只保存在Supabase后台，不放进源码、网页或聊天；网站限额不等于供应商账户的金额上限。

## 已有配置

继续使用原GitHub Pages与Supabase项目moryybvgocdtevhmaqyd。所需DEEPSEEK_API_KEY和Supabase运行时密钥均留在服务器，不需要填写到游戏页面，也不要写入仓库或聊天。游戏默认模型为deepseek-flash，DEEPSEEK_MODEL可覆盖。

## 路由与权限

POST /game/access：提交游戏会话UUID和组别，签发两小时有效的游戏专用凭据。POST /game/chat：验证X-Game-Token与会话、组别后处理文字对话。该凭据不授予任何数据库读取或研究者权限；网页刷新后重新签发，不保存到本地存储或导出文件。

默认全项目200条真实对话/UTC日、同一会话60条/UTC日、同一会话8条/分钟；签发连接400次/UTC日。前两项可用GAME_DAILY_CHAT_LIMIT和GAME_SESSION_CHAT_LIMIT设置。额度使用原study2_reserve_quota原子函数，不需要新增数据库表。仅追加额度计数，不修改历史报告记录。

/game/路由独立处理游戏会话；旧/start、/progress、/complete、/chat和/api/ai仍按原有研究者验证执行。/research/*和research-api仅允许已确认的huangrui1008@gmail.com与服务器UUID名单；数据库依然禁止anon/authenticated直接读取。平台verify_jwt配置继续为false，由各路由内部完成各自鉴权。

## 交互与数据

两组均为真实文本对话。A可给完整食谱；B提供线索，不返回完整食谱字段。输入文字与近期对话、可见的历史投喂数据发送给模型，不传系统规则、隐藏答案或用户凭据。模型输出需为JSON，返回自然语言text和可选recipe，前端分开显示文本和可一键填入的食谱。

每次发送后保留本机聊天记录；请求失败明确标记，可重试，不生成模拟助手回复，也不会因失败解锁投喂。历史模拟轮次保留原样。现阶段游戏数据仍是浏览器localStorage本机记录；研究者JSON导出包含聊天记录和事件，CSV仍为会话摘要。完整问卷流程、正式知情同意与条目未接入，不能当作完整正式施测版本。

## 检查与部署

npm test覆盖A/B全流程、连续对话、IME键盘操作、一键填入、失败重试、游戏凭据签名/失效/组别绑定、配额与研究数据隔离。后端源文件为supabase/functions/experiment-api/index.ts、handler.mjs、game-chat.mjs；前端为index.html、alien-zoo.js和participant.css。部署保持原项目和既有数据。
