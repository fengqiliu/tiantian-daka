# 数据模型

> 对应版本 v0.23.0。本地存储在 `utils/store.js`（键名以 `KEYS` 为准），同步在 `utils/sync.js` ⇄ `cloudfunctions/sync`，家长端在 `cloudfunctions/family`。

## 1. 本地存储

数据全部存于本机 wx storage，key 统一前缀 `ttdr_`（Node 测试环境下自动退化为内存存储）。

### 1.1 孩子端（本人数据）

| Key | 内容 | 结构 / 说明 | 同步 | 备份 |
| --- | --- | --- | --- | --- |
| `ttdr_profile` | 资料 | 单对象，见 §1.3；保存时盖 `updatedAt` | ✓ 新者胜 | ✓ |
| `ttdr_records` | 打卡记录 | 数组，见 §1.4；删除为墓碑 | ✓ 增量 | ✓ |
| `ttdr_badges` | 已获得勋章 | `[{ id, earnedAt }]` | ✓ 并集 | ✓ |
| `ttdr_settings` | 设置 | `{ lastBackupAt, cheerFrom, ... }` | — | ✓ |
| `ttdr_readings` | 跟读录音记录 | 音频文件只存本机，自动保留最近 7 天 | — | ✓ |
| `ttdr_task_overrides` | 家长任务管理 | `{ targets: {taskId: n}, customs: [], updatedAt }` | ✓ 新者胜 | ✓ |
| `ttdr_rewards` / `ttdr_redemptions` / `ttdr_shop_stamp` | 奖励小铺 | 奖品架 / 兑换账本 / 整体时间戳 | ✓ 新者胜（整体） | ✓ |
| `ttdr_drill_history` | 口算会话 | `[{ date, level, total, correct, at }]`，≤100 | ✓ 按 `at` 并集 | ✓ |
| `ttdr_quiz_history` | 小卷历史 | `[{ subject, total, correct, label, at }]`，≤50 | ✓ 按 `at` 并集 | ✓ |
| `ttdr_math_wrong` / `ttdr_quiz_wrong` / `ttdr_wrong_stamp` | 两本错题本 | `[{ key, ..., wrongCount, lastWrongAt, box, due }]` + 整体时间戳 | ✓ 新者胜（整体） | ✓ |
| `ttdr_review_log` | 错题复习日志 | `[{ date, total, correct }]`，每天一条 | ✓ 按日期合并 | ✓ |
| `ttdr_goals` | 每周小目标 | `{ [周一日期]: { id, type, taskId, target, label, emoji, setAt, achievedAt } }` | ✓ 按周合并 | ✓ |
| `ttdr_cheers` | 收到的家长留言 | 云端为准的缓存（离线可看），含 `readAt` / `reaction` | 经 `family` 拉取 | — |
| `ttdr_timer` | 进行中的计时 | `{ taskId, date, targetMin, startAt, pausedMs, pausedAt }`，同时只有一个 | — | — |
| `ttdr_sync` | 同步游标 | `{ lastPullAt, lastPushAt }` | — | — |

### 1.2 家长端（孩子数据缓存，只读）

由 `family.summary` 刷新，页面经 `utils/context.js` 的 `scope()` 读取：

`ttdr_child_profile` · `ttdr_child_records` · `ttdr_child_badges` · `ttdr_child_drill` · `ttdr_child_quiz` · `ttdr_child_review` · `ttdr_child_goals` · `ttdr_child_math_wrong` · `ttdr_child_quiz_wrong`

旧版云函数不返回某个字段时保留已有缓存；解绑或一键清空时一并清除。

### 1.3 profile

```json
{
  "nickname": "小豆",
  "avatar": "🦊",
  "grade": 3,
  "school": "上海市××小学",
  "role": "child",
  "onboarded": true,
  "createdAt": 1727740800000,
  "updatedAt": 1727740800000
}
```

`role` 为 `child` / `parent`；家长身份的 `grade` 为 0，页面一律从 `scope().grade` 取孩子年级。

### 1.4 record（一条打卡记录）

```json
{
  "id": "2026-10-05#math_calc",
  "date": "2026-10-05",
  "taskId": "math_calc",
  "value": { "type": "count", "n": 30 },
  "stars": 3,
  "note": "今天全对！",
  "updatedAt": 1728100800000
}
```

设计要点：

- **`id = date + "#" + taskId`**：一天一个任务只有一条记录，天然幂等（重复打卡即覆盖）。
- **删除为墓碑**：`removeRecord` 置 `deleted: true` + 新 `updatedAt`，否则本地删掉的记录会在下次同步时"复活"；业务读取（`store.getRecords()`）自动过滤墓碑。
- **补打卡**（0.21.0）：补卡记录额外带 `"makeup": true, "makeupAt": <补卡操作时间>`，`stars` 固定 1；只能补昨天/前天，每周最多补 2 天（按 `makeupAt` 所在周计）。
- **`value.type` 冗余存储**：即便未来任务定义调整，历史记录仍可正确展示。
- **不存任务名/板块**：从 `taskId` 经 `utils/tasks.js` 反查；反查失败时兜底显示 id。
- 体量估算：清单每天 11-16 项（见 [content-tasks.md](content-tasks.md)），一年最多约 6000 条，wx storage（单 key 1MB）足够。

### 1.5 派生量（全部实时计算，不冗余存储）

| 量 | 算法 | 位置 |
| --- | --- | --- |
| 当日完成度 | `dayCompletion(tasks, records)`：done/total、必做是否全部完成 | `checkin.js` |
| 连续打卡 | 有记录的日期集合，从今天（今天未打则从昨天）回溯；另算最长连击；补卡计入 | `checkin.js` |
| 总星星 | Σ`record.stars` + 全必做日 ×1（补卡日除外）+ 已获勋章奖励星 + 达成的周目标 ×5 | `checkin.totalStars` |
| 积分余额 | 总星星 − 兑换账本支出 | `shop.js` |
| 月历 | `monthStats(year, month)`：周一开头的格子 + 三态 | `checkin.js` |
| 累计聚合 | `aggregateSum(records, taskIds)`：勋章与周目标用 | `checkin.js` |
| 复习队列 | 两本错题本中 `due ≤ 今天` 的题，先到期先复习 | `review.js` |
| 周报 | 某周的打卡/达成天数、练习概况、周目标、亮点与需关注 | `report.weeklyDigest` |
| 学期 / 假期划分 | 由 `calendar-config.HOLIDAYS` 推出：暑假后为第一学期、寒假后为第二学期；校历之外按惯例推算 | `term.periodAt` |
| 学期报告 | 某学期/假期内的打卡、最长连续、累计量、勋章、周目标、口算正确率前后半对比 | `term.termSummary` |

## 2. 云开发（已编码，待开通环境）

### 2.1 架构原则

- **本地优先（offline-first）**：所有读写走本机 storage；云端是异步备份与跨设备通道。未配置 `CLOUD_ENV` 时所有云调用静默降级（`{ok:false, degraded:true}`），UI 不出现不可用状态。
- **安全**：openid 一律取自云函数调用上下文（`cloud.getWXContext()`），前端传入的 openid 一律不信任；家长只能经 `family` 读到自己所在家庭的孩子数据，回传给对方的数据不含 openid。

### 2.2 云函数

| 函数 | 动作 | 说明 |
| --- | --- | --- |
| `login` | — | 初始化用户档案；自愈创建 `users` / `checkins` / `badges` / `families` / `cheers` 集合 |
| `sync` | `push` / `pull` / `reset` | 同步（§2.3）；`reset` 为一键清空云端 |
| `family` | `create` / `join` / `summary` / `leave` | 邀请码绑定与家长拉取孩子摘要 |
| | `grantParentSub` / `notify` / `config` | 家长订阅配额与勋章里程碑通知 |
| | `cheer` / `cheers` / `cheerRead` / `cheerReact` | 家长留言、列表、已读、孩子表情回复 |
| `remind` | `config` / `grant` / `status` / `disable` | 每日提醒订阅配额管理 |
| `dailyRemind` | 定时触发 | 每天 20:00（`config.json` 的 `0 0 20 * * * *`）给有配额且当天还有任务没打卡的用户发提醒 |

### 2.3 同步协议（`utils/sync.js` ⇄ `cloudfunctions/sync`）

先拉后推（`syncAll`），节流 1 分钟；触发时机：启动、首页进入、每次打卡/取消/练习结束、家长改任务或奖品后。

| 数据 | 云端位置 | 合并规则 |
| --- | --- | --- |
| 打卡记录 | `checkins`（每条一文档） | 增量：只传 `updatedAt` 大于游标的记录（含墓碑）；按 `updatedAt` 新者胜。游标以云函数返回的服务器时间封顶，防设备时钟快导致漏传 |
| 资料 | `users.profile` | 按 `updatedAt` 新者胜 |
| 勋章 | `badges` | 只增不删，取并集 |
| 任务覆盖 / 奖励小铺 / 错题本 | `users.taskOverrides` / `users.shop` / `users.wrongBook` | 会被原地修改，整体按时间戳新者胜；写入时间戳严格递增（同毫秒连续写也生效）；本地从未写过（无时间戳）时不上传，避免空数据覆盖云端；例外是 0.16.0 之前已有题的错题本，以时间戳 1 上传一次 |
| 口算会话 / 小卷历史 | `users.practice.drill` / `.quiz` | 只追加列表，按完成时间 `at` 取并集（≤100 / ≤50），两台设备各自的练习都保留 |
| 复习日志 | `users.practice.review` | 每天一条、各设备分别累计，按日期合并、同日取次数多的一份（≤366） |
| 每周小目标 | `users.practice.goals` | 按周合并：已达成优先（都达成取更早的，奖励只算一次），否则后设置的胜（≤60 周） |

云端对整体替换的字段用 `_.set` 写入，避免数组残留已删除的元素。记录下行时云函数按白名单回传字段（含 `makeup` / `makeupAt`）。

**一键清空**（`sync.reset`）：删除调用者的 `checkins`、`badges`、收到的 `cheers`，清空 `users` 上的 `profile` / `taskOverrides` / `shop` / `practice` / `wrongBook`；保留用户档案本身（openid、提醒配额）与家人绑定。客户端先调 `reset`，成功后才清本机（`utils/reset.js`）。

### 2.4 Collections

| 集合 | 文档结构 | 说明 |
| --- | --- | --- |
| `users` | `{ openid, profile, taskOverrides, shop, practice: { drill[], quiz[], review[], goals }, wrongBook: { math[], quiz[], updatedAt }, remindEnabled, remindQuota, remindHour, createdAt }` | `login` 首次调用自动创建 |
| `checkins` | 本地 record + `openid` | 推荐索引：`(openid+updatedAt)`、`(openid+date)` |
| `badges` | `{ openid, id, earnedAt }` | 并集写入 |
| `families` | `{ code, ownerOpenid, ownerProfile, members:[{openid, parentSubQuota, joinedAt}], createdAt }` | `code` 为 6 位邀请码（去除易混淆字符 0/O/1/I/L） |
| `cheers` | `{ ownerOpenid, fromOpenid, from, text, recordId, recordLabel, createdAt, readAt, reaction, reactedAt }` | 家长鼓励留言与孩子的表情回复，只经 `family` 云函数读写；建议集合权限设为「所有用户不可读写」。推荐索引：`(ownerOpenid+createdAt)`、`(fromOpenid+createdAt)` |

### 2.5 家人绑定与留言流程

```
孩子端 我的→家人绑定 → family.create（幂等）→ 显示/复制 6 位邀请码
家长端 首页 → 输入邀请码 → family.join → family.summary 拉取孩子数据 → 写入孩子缓存（§1.2）
     → index / calendar / growth / wrong-book / report 经 scope() 切换为孩子缓存（只读）
孩子端打卡保存 → 若获得新勋章 → family.notify → 向有订阅配额的家长发订阅消息
家长 cheer 页 → family.cheer（称呼白名单、≤40 字、自定义文字 msgSecCheck、24 小时 ≤10 条）
孩子首页 → family.cheers 拉取 → 横幅 → 点表情 → family.cheerReact（只能回自己收到的，回复即已读）
家长首页 / cheer 页 → family.cheers 看到已读与回复
任意一方 family.leave 解绑；家长解绑后本地孩子缓存清空
```

### 2.6 订阅消息（一次性订阅配额模式）

微信一次性订阅：用户每次点"允许"只换 1 条可发送额度。实现：

```
授权: 页面按钮 → wx.requestSubscribeMessage → 接受数 n → 云端配额 +n（上限 3）
消费: dailyRemind（每日 20:00 timer）/ family.notify 发送成功后配额 -1
失效: 发送报 43101（未订阅/额度尽）→ 配额清零，等待用户下次授权
```

| 消息 | 触发 | 内容 |
| --- | --- | --- |
| 每日打卡提醒 | `dailyRemind` 定时触发 | 当天还有任务没打卡时：昵称 + "还有 N 项任务没打卡"（全部完成则不发） |
| 里程碑通知（家长） | 孩子打卡后评估出新勋章 | 孩子昵称 + 勋章名/描述 |

模板 ID 配置在 `cloudfunctions/remind/config.js` 与 `cloudfunctions/dailyRemind/config.js`（两处必须是同一个提醒模板）、`cloudfunctions/family/config.js`（家长通知模板）；占位符 `REPLACE_...` 未替换时相关功能自动跳过。`thing1/thing2` 字段名需与申请的模板一致。

### 2.7 共享逻辑

云函数独立打包，无法 require 小程序目录。需要两边一致的逻辑放在无依赖的共享文件里，由 `scripts/sync-cloud-libs.js` 复制到各云函数的 `lib/`：

| 云函数 | lib 文件 | 用途 |
| --- | --- | --- |
| `dailyRemind` | `tasks.js` / `date.js` / `calendar-config.js` | 判定"今天是否全部完成"与客户端清单一致 |
| `sync` | `history-merge.js` | 练习记录、复习日志、周目标的合并规则 |
| `family` | `cheer.js` | 留言称呼、常用语、长度与回复表情校验 |

修改这些源文件后需重跑脚本并重新上传对应云函数；`node scripts/sync-cloud-libs.js --check` 只校验不写入，客户端测试也会校验 lib 与源文件一致。
