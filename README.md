# psych-exp

研究二实验项目，继续使用原 GitHub Pages 与 Supabase。

- [自动随机分组](https://huangrui1008-collab.github.io/psych-exp/)
- [固定 A 组（依赖型）](https://huangrui1008-collab.github.io/psych-exp/?group=A)
- [固定 B 组（增强型）](https://huangrui1008-collab.github.io/psych-exp/?group=B)
- [研究者工作台](https://huangrui1008-collab.github.io/psych-exp/researcher.html)

后端未完成设置时不可正式招募；详见 [安全后端设置](SETUP.md)。研究者工作台可登录查看云端状态、字段结构及导出数据；也可离线导入备份，但不会将其伪装成汇总数据。

保留原任务、量表、填充题与10题脱机测试。心理所有权统一指向“本次任务形成的报告”。量表仅保留原始作答，不擅自增加总分、反向计分、材料或实验操作。历史 `experiment_data` 不改写，新过程记录保存在同项目侧表。

`materials.js` 为参与者公开材料；`supabase/functions/_shared/materials.json` 为服务器权威材料（含原有答案键），测试核对二者一致性。变更研究材料需同时更新两处并版本化。公开仓库仍包含服务端源代码与答案键，故不能将题目保密或浏览器限制视为正式监考措施。

云端数据查看和导出仅限已确认邮箱 `huangrui1008@gmail.com` 且列入服务器名单的账号。研究者下载服务与被试/AI服务分开；下载权限不代表匿名实验入口已经开通。
