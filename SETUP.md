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

## A组有变化的食谱

请求传difficulty（basic或advanced），旧客户端按H1识别难度。game-plans.mjs使用原规则重算实际R轮记录，结合当前数量与剩余轮次筛选增量；每个候选都保留后续达到55只的可行性。通常选择围绕所需平均增量的组合，优先避免连续相同增量和重复食谱，需要追赶时才提高增量。采用推荐从头投喂可在十轮内达55只，用户自行改动可能影响结果。

真实AI解释预先选定的食谱，自由追问也可从当前候选选择其他配方。返回recipe、expected_delta、recipe_rule_version与recipe_strategy_version；策略版本为varied-target-v1。不会修改客户端投喂公式、初始示例、后测答案或旧数据。B组不接收食谱工具，继续给分析线索。模型或配方不一致时明确报错，不生成模拟回复。

B组：保留自由输入、多轮追问与具体反馈，不显示食谱卡片、索要完整食谱快捷按钮或一键采用按钮。即使旧导入记录或异常接口结果含recipe字段，参与者页面也不展示、采用或继续传送该食谱元数据；原文件和旧数据不删除。后台不向B提供A的食谱工具，并对常见完整食谱文本格式进行额外检查；发现越界时最多额外调用模型一次改写为纯分析，仍越界则明确报错供用户重试，不冒充AI生成固定反馈。语言模型与格式检查仍无法形式化保证识别所有隐晦表述。
