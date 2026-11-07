# 安全后端设置（沿用现有 Supabase 项目）

现有 GitHub Pages 继续托管参与者页面与 `researcher.html`。数据仍存于原 Supabase 项目；新代码不迁移、不删除、不改写 `experiment_data` 中的真实记录。研究者页将历史表与新 `study2_sessions` 过程记录分别展示。新表保留原有全部研究字段，使用 JSONB 避免猜测或修改历史表字段类型。

## 当前状态

2026-11-07：原 Supabase 项目已恢复为 Healthy；完整数据库备份保留在本机私有工作目录。原历史记录与17个字段保留，研究者账号的真实登录、完整云端读取及 CSV/JSON 下载已验收。当前新增目标是研究者本人完整试跑，任务入口采用同一研究者账号鉴权，试跑记录另存于原项目过程表并明确标记。

仅授权 `huangrui1008@gmail.com` 查看、导出云端研究数据。研究者服务 `research-api` 独立于被试与 AI 服务，不要求配置 AI 密钥；它必须同时核验真实 Auth 会话、已确认邮箱和服务端账号名单。其他账号即使误入名单也不能访问。

本人试跑服务 `experiment-api` 在函数内验证真实 Auth 会话、已确认的指定邮箱及服务端名单；每次任务操作还需本次参与的随机凭据。部署此版本后，旧式平台 JWT 校验应关闭，以便真实登录令牌交给函数验证。未登录、其他账号和非试跑记录均拒绝访问，不开放匿名参与。研究者账号的密码由用户本人设置。[邮箱绑定设置](supabase/migrations/202611060002_owner_researcher.sql)会在该邮箱的真实账号创建且确认后自动绑定权限；该账号改为其他邮箱时会撤销名单资格。

### 本人试跑

1. 在原项目 Edge Functions → Secrets，由本人设置新密钥 `DEEPSEEK_API_KEY`。不要将密钥发到聊天或放入网页、仓库。
2. 打开根链接或固定 A/B 链接，用研究者账号登录试跑，再阅读原有知情同意并开始。刷新后重新登录，可恢复同一标签页的试跑进度。
3. 保留原报告、问卷和脱机测试要求。成功提交后可点击“开启新一遍试跑”，原云端记录保留。
4. 研究者页能看到“本人试跑”状态；JSON/CSV 保留 `is_test` 和 `test_label`。试跑记录不能作为正式研究样本使用。

服务器强制写入试跑标记，拒绝把原有未标记记录改为试跑记录。试跑登录令牌只放在内存，不保存密码或刷新令牌。网页与服务端保留原有材料和分组规则。

## 1. 保护现有数据与密钥

先在原 Supabase 项目导出现有 `experiment_data` 的备份，再安排暂停招募、提醒正在参与者提交或保存备份。原版本前端包含 DeepSeek 私密密钥；必须在 DeepSeek 控制台撤销并更换。在线 AI 开通前，新密钥仅存为 Supabase Edge Function secret `DEEPSEEK_API_KEY`，不要发到聊天、提交到仓库或写入前端。

删除当前页面中的密钥不会从 Git 历史中删除旧密钥；本次没有改写 Git 历史。Supabase publishable key 是公开项目标识，不具有后端管理权限，保留在 `config.js` 是正常用途，数据保护依靠服务器校验与数据库权限。

## 2. 执行数据库设置

在**原项目** Supabase Dashboard → SQL Editor 依次执行 [安全设置](supabase/migrations/202611060001_secure_study2.sql)和[指定邮箱授权绑定](supabase/migrations/202611060002_owner_researcher.sql)。安全设置：

- 新建过程表 `study2_sessions`、研究者白名单 `study2_researchers`、每日额度表 `study2_quotas`；开启 RLS。
- 禁止匿名与普通登录用户直接访问这些表及历史表。服务角色只在函数内使用。
- 保留历史表数据、列定义和现有策略；撤销其前端角色的表级与列级权限。旧页面直接 POST 将失效，参与者需刷新进入新流程。
- 提供原子额度预留、权限健康检查和实际列结构核对函数，只允许服务角色调用。

不需要把 service-role key 加到网页。Supabase 内置 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 自动供函数使用。安全设置不删除研究数据；邮箱绑定脚本仅在账号变更为其他邮箱时删除对应白名单资格，不删除研究记录。不要恢复历史表的匿名 SELECT 权限。

## 3. 部署函数并设置密钥

从本仓库执行（使用已登录且有原项目权限的 Supabase CLI）：

```sh
supabase login
supabase link --project-ref moryybvgocdtevhmaqyd
supabase functions deploy experiment-api --no-verify-jwt
supabase functions deploy research-api --no-verify-jwt
```

在 Dashboard → Edge Functions → Secrets 设置 `DEEPSEEK_API_KEY` 为新密钥。可选设置：

| secret | 默认值 | 用途 |
| --- | --- | --- |
| ALLOWED_ORIGINS | https://huangrui1008-collab.github.io | 允许的网页来源；多个用逗号分开 |
| DAILY_START_LIMIT | 20 | 每 UTC 日最多新建本人试跑记录 |
| DAILY_CHAT_LIMIT | 40 | 每 UTC 日最多 AI 请求；失败请求也计入 |

每次参与最多40次 AI 请求、每条用户消息最多6000字符。达到服务限额时明确报错，不能用模拟回复替代实验操纵。AI 系统提示词、开场消息、任务和题目均来自原代码；API 使用原 `deepseek-chat`。服务端设置输出 token 上限作为成本边界（A 1600、B 700），B 组原有“每次回复不超过200字”提示保留。模型是否遵守引导方式仍需预实验检查，提示词不是绝对保证。

两个函数均在内部通过 Auth.getUser 验证真实会话，并强制核对已确认的 `huangrui1008@gmail.com` 和服务器名单。`research-api` 只读；`experiment-api` 除公开的服务状态外，仅允许本人试跑操作，每次写入和 AI 调用还检查本次参与凭据。CORS 限制不能代替身份验证。

`research-api/health` 仅检查数据权限设置，已返回 `ready:true`，不代表账号已创建或被试入口已开通。`experiment-api/health` 仅在私密 AI key 存在、迁移成功且保护表不向 anon/authenticated 授权时返回 `ready:true`。它不花费 AI 额度，也不能证明 AI key 有效；正式开始前仍需一次标记为测试的完整试跑。

## 4. 创建并授权研究者

在 Supabase Authentication → Users → Add user → Create new user 创建 `huangrui1008@gmail.com` 的邮箱密码用户，密码由本人设置并提交，保持 Auto confirm user 勾选。无需开放公众注册。已部署的邮箱绑定会自动授予该已确认邮箱的真实账号下载权限；正常创建后无需手动执行 SQL。仅在维护旧部署、尚未安装邮箱绑定时使用以下补充授权：

```sql
insert into public.study2_researchers(user_id)
select id from auth.users
where lower(email) = 'huangrui1008@gmail.com' and email_confirmed_at is not null
on conflict (user_id) do nothing;
```

随后打开 <https://huangrui1008-collab.github.io/psych-exp/researcher.html>，用该邮箱密码登录。未在白名单中的普通用户即使登录成功也得到403。研究者会话仅保存在内存，刷新后需重新登录；退出清空视图。不要把 service-role key 当密码。

### 密码恢复

在 Authentication → URL Configuration → Redirect URLs 添加精确地址 `https://huangrui1008-collab.github.io/psych-exp/researcher.html`，无需修改其他地址或 Site URL。恢复邮件模板应使用 Supabase 默认的 `{{ .ConfirmationURL }}` 链接。未允许该返回地址时，邮件可能跳回默认的 localhost，无法在原网站设置新密码。

研究者本人点击页面“忘记密码：发送恢复邮件”，在 Gmail 中打开最新恢复邮件的链接。网页移除地址中的恢复凭据，通过 Supabase 验证邮箱后显示两次新密码输入框；本人保存后再重新登录。恢复请求由本人点击触发，本次没有代发邮件或代设密码。恢复凭据仅留在内存，不写入浏览器存储；恢复成功后退出恢复会话，不自动读取研究数据。

`Invalid login credentials` 表示邮箱密码未通过 Supabase 验证，发生在数据授权检查之前。账号出现在 Users 列表中并不证明本次输入的密码正确。页面显示明确中文提示，并提供恢复入口。若邮件服务返回限额、收件人限制或其他错误，页面会显示失败；请求受理不代表邮件已经送达。恢复邮件仍依赖 Supabase 的邮件服务设置。

## 5. 验收与试跑

1. 打开 `/functions/v1/experiment-api/health`，应返回 `ready:true`。
2. 未登录请求 `/research/records` 或任何任务操作应返回401；其他账号应返回403。本人有效登录仍需正确的本次参与凭据。
3. 使用 publishable key 请求数据表 REST 接口，均应拒绝读写；不能返回真实研究记录。
4. 三个入口分别在独立标签页试跑：根链接随机 A/B，固定 A/B 保持指定组别。同一标签页刷新并点击恢复，编号、组别和已答内容保持。
5. 检查 A 生成报告、B 引导写作；400字原门槛保留；写作后不能再通过本次参与接口请求 AI。
6. 研究者页面应出现试跑编号、分配方式、当前阶段。最终提交后只出现一条已完成记录；丢失提交响应后重试不会重复入库。
7. 切断网络后最终提交：必须显示“尚未提交成功”，不得进入成功页；备份 JSON 可交给研究者本地核对。恢复网络后重试，应成功。
8. CSV 使用 UTF-8 BOM、逐题展开；JSON 保留完整记录与来源。导出应用当前筛选条件，并分页读取所有云端记录；读取中失败不会展示不完整汇总。

历史记录没有开始/退出状态，不回填、不猜测；本地备份不能证明云端收件。“进行中”只表示服务端没收到最终提交，不能判断是否在线或是否退出。拒绝知情同意者不建档。浏览器无法阻止参与者在别的设备/窗口查看外部资料，脱机测试是任务规则与界面隔离，不是监考软件。

本人试跑的数据在原项目侧表中以 `record.is_test=true` 标记；验收使用的试跑编号应另行记录。历史真实数据不删除、不覆盖。

## 本地检查

```sh
npm ci
npm test
python3 -m http.server 8765
```

自动化测试使用内存存储、模拟 AI 和临时 PostgreSQL（PGlite），不访问真实数据库或消耗 AI 费用。浏览器仅查看本地界面时后端未设置提示属于预期现象。开发时需要把本地来源单独加入 `ALLOWED_ORIGINS`；正式环境保持最小来源列表。

参考：[Supabase Auth 与 Edge Functions](https://supabase.com/docs/guides/functions/auth-legacy-jwt)、[数据库 RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)。
