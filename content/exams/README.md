# 试卷知识库

收录上海市小学单元测试卷（按 2024 新教材原创设计，每套含 **A 卷·基础 / B 卷·提高 + 参考答案**），作为小程序内容功能的结构化数据源。

## 目录结构

```
content/exams/
├── README.md          # 本说明
├── pdf/               # 原始 PDF 存档（8 套）
└── data/
    ├── index.json     # 总索引（覆盖范围、单元清单、文件映射）
    └── *.json         # 每套试卷一个结构化文件（A/B 卷 + 答案）
```

## 数据文件结构

每个 `data/<subject>-g<年级>s<学期>-u<单元>.json` 包含：

| 字段 | 说明 |
| --- | --- |
| `id / subject / textbook / grade / semester / unit / unitName` | 单元元数据 |
| `skills` | 本单元能力清单（来自原卷"观察重点"，用于错题归因与任务对齐） |
| `papers` | A/B 两卷：`sections[]`（题号、题型 type、题名、分值、答案摘要）+ `observe`（能力观察点） |
| `drills` | 可复用题组（如数学第四单元 A/B 各 20 道口算题+答案） |
| `listeningScripts` | 英语听力原文（A/B 各 5 句，每题读两遍） |
| `usageNotes` | 原卷评分与使用建议（家庭练习定位，不替代学校评价） |

题型 type 采用固定词表（`match / classify / compare / part-whole / ordinal / arithmetic / missing-number / word-problem / spell / tone / writing / judge / speaking / bonus / challenge …`），便于未来按题型统计错题。

## 当前覆盖（2026-10-01）

一年级上册：数学（沪教版 2024 修订）第 1-4 单元；语文（统编版 2024 修订）第 1-3 单元；英语（沪教版五四制 2024）Unit 1。

已知记录说明：数学第二、三单元原卷小题分值之和与封面"总分100"不完全一致，数据按原卷如实保留并在 `usageNotes` 标注。

## 与小程序的关系（规划）

1. **单元对齐的任务内容**：`tasks.js` 的口算/听读/朗读任务可引用 `skills` 与 `drills`，让"口算天天练"的范围跟着教学进度走（如第四单元 = 10以内加减）。
2. **每周一卷**（✅ v0.6.0 已实现）：`utils/quiz-bank.js` 从各卷转录了 38 道判断/选择/比大小题（保留原卷出处），App 内组 10 题小卷，按等第制评价；错题自动重练。
3. **错题本**：按 `sections[].type` 归类错题，家长端周报提示薄弱题型。

## 更新流程

新试卷放入 `pdf/`，按上述结构新增 `data/*.json`，并更新 `data/index.json`。校历等配置变更见项目 README。
