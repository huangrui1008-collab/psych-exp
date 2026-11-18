# Alien Zoo · 真实AI对话（2026-11-18）

**当前运行状态：AI付费调用默认关闭。** 配置实验专用密钥并确认调用预算后，才可将AI_CALLS_ENABLED设置为true恢复。密钥只保存在Supabase后台。

继续原项目与原地址，以原对话下载核对的V0.6游戏为基础。A组画面按“目标、投喂记录、动物、AI对话、食谱、确认投喂”排列；共同问卷条目和完整正式施测流程仍待定。

- 根入口（打开即在本机确定并保存随机组别）：https://huangrui1008-collab.github.io/psych-exp/
- A组：https://huangrui1008-collab.github.io/psych-exp/?group=A
- B组：https://huangrui1008-collab.github.io/psych-exp/?group=B
- 研究者：https://huangrui1008-collab.github.io/psych-exp/researcher.html

## 真实文字对话

两组均可输入文字、多轮追问，Enter发送，Shift+Enter换行；中文输入法选词时不会误发。A组可向AI索要完整食谱，并点击对应回复的“一键填入食谱”，之后仍可修改。B组获得分析线索和反馈，服务端不返回完整食谱字段。两组每轮必须收到真实AI回应并确认查看后，才可投喂。进入下一轮不自动请求AI。

前端和后端没有固定模拟回复或失败时模拟回退。错误明确显示，可重试上一条，失败请求不会冒充助手回复。对话与逐轮投喂、独立测试仍在浏览器保存，可由研究者导出；游戏尚无跨设备云端汇总。旧的模拟轮次数据保留其原始来源，不删除也不改写为真实AI。

## 服务端

使用原Supabase项目与DEEPSEEK_API_KEY，密钥不进入网页。/game/access签发两小时有效、仅限本会话和组别的游戏凭据；/game/chat验证后调用DeepSeek。凭据只保存在页面内存，不能读取研究数据，也不能调用旧报告操作。默认限制：全项目每天200条真实游戏对话、每会话每天60条、每分钟8条；连接签发每天400次。可通过GAME_DAILY_CHAT_LIMIT和GAME_SESSION_CHAT_LIMIT调整前两项。

游戏模型默认deepseek-flash，可用DEEPSEEK_MODEL覆盖；选择依据为当前DeepSeek官方API文档：https://api-docs.deepseek.com/ 。服务端仅将可见投喂记录、当前食谱及有长度限制的近期对话发给模型，不发送隐藏规则、测试答案或认证凭据。游戏规则及后测仍在前端，正式施测前还需迁移。

历史研究数据读取与下载继续只允许已确认的huangrui1008@gmail.com及服务器名单。旧报告端点保持原有研究者认证，历史数据未迁移或覆盖。

## 开发与来源

运行npm test；静态预览可使用python3 -m http.server 8765。管理设置从研究者页面进入。原V0.6来源核对见alien-zoo-source.json；公开Q-3627示例为V0.5，未作为本版底稿。原项目：https://github.com/ukuhl/IntroAlienZoo，CC BY 4.0。当前改编不等同原论文已验证的正式程序。
