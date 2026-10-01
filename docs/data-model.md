# 数据模型

> v0.2.0 起包含云开发实现（多设备同步 / 家人绑定 / 订阅消息）。

## 1. 本地存储（MVP）

数据全部存于本机 wx storage，key 统一前缀 `ttdr_`：

| Key | 内容 | 说明 |
| --- | --- | --- |
| `ttdr_profile` | 孩子资料 | 单对象 |
| `ttdr_records` | 打卡记录 | 数组，按 `updatedAt` 就近更新 |
| `ttdr_badges` | 已获得勋章 | 数组 |
| `ttdr_settings` | 设置（预留） | 对象 |

### profile

```json
{
  "nickname": "小豆",
  "avatar": "🦊",
  "grade": 3,
  "school": "上海市××小学",
  "createdAt": 1727740800000,
  "onboarded": true
}
```

### record（一条打卡记录）

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

- **`id = date + "#" + taskId`**：一天一个任务只有一条记录，天然幂等（重复打卡即覆盖），取消即删除。
- **`value.type` 冗余存储**：即便未来任务定义调整，历史记录仍可正确展示。
- **不存任务名/板块**：从 `taskId` 经 `utils/tasks.js` 反查；任务名当前版本内稳定，历史记录反查失败时兜底显示 id。
- **不存每日目标加成星**：`totalStars` 动态计算（Σ任务星 + 每个全必做日 +1），避免冗余不一致。
- 体量估算：每天约 7-11 条，一年 ≈ 3000 条，wx storage（单 key 1MB）足够。

### 派生量（全部实时计算，见 `utils/checkin.js`）

| 量 | 算法 |
| --- | --- |
| 当日完成度 | `dayCompletion(tasks, records)`：done/total、必做达成 |
| 连续打卡 | 有记录日期集合，从今天（或昨天，若今天未打）回溯；另算最长连击 |
| 总星星 | Σ`record.stars` + 全必做日 ×1 |
| 月历 | `monthStats(year, month)`：周一开头的格子 + 三态 |
| 累计聚合 | `aggregateSum(records, taskIds)`：勋章用（跳绳总数、口算题数…） |

## 3. 云开发实现（v0.2.0，已编码、待开通环境）

### 3.1 架构原则

- **本地优先（offline-first）**：所有读写走本机 storage；云端是异步备份与跨设备通道。未配置 `CLOUD_ENV` 时所有云调用静默降级（`{ok:false, degraded:true}`），UI 不出现不可用状态。
- **安全**：openid 一律取自云函数调用上下文（`cloud.getWXContext()`），前端传入的 openid 一律不信任。

### 3.2 本地新增数据

| Key | 内容 |
| --- | --- |
| `ttdr_sync` | 同步游标 `{ lastPullAt, lastPushAt }` |
| `ttdr_child_profile / _records / _badges` | 家长端缓存的"孩子数据"（只读，由 `family.summary` 刷新） |

记录的**删除改为墓碑**：`removeRecord` 不物理删除，而是置 `deleted: true` + 新 `updatedAt`（否则本地删掉的记录会在下次同步时"复活"）。所有业务读取（`store.getRecords()`）自动过滤墓碑。`profile` 保存时自动盖 `updatedAt` 时间戳（同步合并用 raw 入口避免重复盖章）。

### 3.3 同步协议（utils/sync.js ⇄ cloudfunctions/sync）

```
push: 本地 updatedAt > lastPushAt 的记录（含墓碑） + 全量 profile + badges
pull: 云端 updatedAt > lastPullAt 的记录（含墓碑） + profile + badges
冲突: 记录/资料按 updatedAt 新者胜；勋章只增不删取并集
游标: 取本次传输的最大 updatedAt（容忍时钟回拨与同毫秒写入的极端情况）
```

`id = date#taskId` 的幂等设计让同步天然无重复；触发时机：启动、每次打卡/取消后（节流 1 分钟）、家长端进入首页（拉孩子数据）。同步引擎为纯逻辑，`test/run-tests.js` 中用 mock 传输层覆盖了增量、冲突、墓碑、并集四种场景。

### 3.4 Collections

| 集合 | 文档结构 | 说明 |
| --- | --- | --- |
| `users` | `{ openid, profile, remindEnabled, remindQuota, remindHour, createdAt }` | `login` 首次调用自动创建（集合也自愈创建） |
| `checkins` | 本地 record + `openid` | 推荐索引：`(openid+updatedAt)`、`(openid+date)` |
| `badges` | `{ openid, id, earnedAt }` | 并集写入 |
| `families` | `{ code, ownerOpenid, ownerProfile, members:[{openid, parentSubQuota, joinedAt}], createdAt }` | `code` 为 6 位邀请码（去除易混淆字符 0/O/1/I/L） |

### 3.5 家人绑定流程

```
孩子端 我的→家人绑定 → family.create（幂等）→ 显示/复制 6 位邀请码
家长端 首页/我的 → 输入邀请码 → family.join → family.summary 拉取孩子数据 → 写入孩子缓存
     → index/calendar/growth 经 utils/context.js 作用域切换为"孩子缓存"（只读）
孩子端打卡保存 → 若获得新勋章 → family.notify → 向有订阅配额的家长发订阅消息
任意一方 family.leave 解绑；家长解绑后本地孩子缓存清空
```

### 3.6 订阅消息（一次性订阅配额模式）

微信一次性订阅：用户每次点"允许"只换 1 条可发送额度。实现：

```
授权: 页面按钮 → wx.requestSubscribeMessage → 接受数 n → 云端配额 +n（上限 3）
消费: dailyRemind（每日 20:00 timer）/ family.notify 发送成功后配额 -1
失效: 发送报 43101（未订阅/额度尽）→ 配额清零，等待用户下次授权
```

| 消息 | 触发 | 内容 |
| --- | --- | --- |
| 每日打卡提醒 | `dailyRemind` timer（config.json `0 0 20 * * * *`，北京时间） | 仅当当日任务未全部完成：昵称 + "还有 N 项任务没打卡" |
| 里程碑通知（家长） | 孩子打卡后评估出新勋章 | 孩子昵称 + 勋章名/描述 |

模板 ID 配置在 `cloudfunctions/remind/config.js` 与 `cloudfunctions/family/config.js`（占位符 `REPLACE_...` 未替换时相关功能自动跳过）。`thing1/thing2` 字段名需与申请的模板一致。

### 3.7 共享逻辑

`cloudfunctions/dailyRemind/lib/` 中的 `tasks.js / date.js` 是 `utils/` 的副本（云函数独立打包无法 require 小程序目录），由 `scripts/sync-cloud-libs.js` 从源文件拷贝生成——**修改任务库后需重跑该脚本并重新上传 dailyRemind**。
