# Alien Zoo · 研究者试玩 V0.6

当前主页面已更换为《严谨探讨研究课题》原对话下载的 Alien Zoo V0.6 游戏，以研究者先试玩、后改条目为目标，不使用旧报告任务作为当前实验。

- 根链接随机分组：https://huangrui1008-collab.github.io/psych-exp/
- 固定 A（AI先出食谱）：https://huangrui1008-collab.github.io/psych-exp/?group=A
- 固定 B（自己先想再问AI）：https://huangrui1008-collab.github.io/psych-exp/?group=B
- 研究者看板：https://huangrui1008-collab.github.io/psych-exp/researcher.html

默认模拟AI，可直接开始。每组10轮投喂，之后有三段独立测试；题目、规则、植物与动物名称沿用下载的V0.6，主观量表仍未定稿。退出锁定与研究者重置均保留。每组在本浏览器分别保存，不相互覆盖。

游戏数据目前只保存在当前浏览器，可在游戏中导出完整JSON，在研究者看板查看、导入并导出JSON或CSV。它不是跨设备的云端参与者汇总。原Supabase中的旧报告数据与研究者账号机制保留，看板中独立折叠显示。

可选真实AI：在游戏页顶部展开“连接真实AI”，使用已授权研究者账号登录，再在研究者设置中选择真实API并保存，开始新一遍。调用使用已配置的Supabase/DeepSeek后端，密钥不进网页。失败时沿用V0.6的明确模拟回退提示，实际回复来源写入每轮记录。

源码来源和SHA-256见 `alien-zoo-source.json`。原对话ZIP中的HTML与单独下载的HTML已核对完全一致；公开的Q-3627试玩仓库是V0.5，未作为本版底稿。当前修改仅做原网址入口、研究者看板和安全AI代理适配，没有定稿新量表或新增正式实验材料。

任务形式参考 Kuhl等（2023）Alien Zoo。原项目：https://github.com/ukuhl/IntroAlienZoo ，CC BY 4.0。当前预览规则并非原论文验证的正式实验程序。

本地：`npm ci`、`npm test`、`python3 -m http.server 8765`。更多说明见 SETUP.md。
