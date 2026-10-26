// 练习历史合并（纯逻辑，无依赖；客户端与云函数 sync 共用）
// ⚠️ 云函数副本 cloudfunctions/sync/lib/history-merge.js 由 scripts/sync-cloud-libs.js 复制，勿直接改
//
// 口算会话 / 小卷历史都是只追加列表，每条带 at（完成时间戳）；错题复习日志按日期合并（见 mergeReviewLog）。
// 合并规则：按 at 取并集（同 at 保留第一方），最新在前，按上限截断。
// 与"整体新者胜"不同，并集不会因两台设备各自新增而丢记录。
const DRILL_CAP = 100; // 口算会话上限（utils/arithmetic.js 引用此值）
const QUIZ_CAP = 50;   // 小卷历史上限（utils/quiz.js 引用此值）
const REVIEW_CAP = 366; // 错题复习日志上限（每天一条，约一年）

function mergeHistory(a, b, cap) {
  const seen = {};
  const out = [];
  (a || []).concat(b || []).forEach(x => {
    if (!x || typeof x.at !== 'number' || seen[x.at]) return;
    seen[x.at] = true;
    out.push(x);
  });
  out.sort((x, y) => y.at - x.at);
  return out.slice(0, cap);
}

// 错题复习日志：每天一条 { date, total, correct }，同日在各设备上分别累计，
// 无法相加去重，按日期取次数多的一份；最新在前
function mergeReviewLog(a, b, cap) {
  const byDate = {};
  (a || []).concat(b || []).forEach(x => {
    if (!x || typeof x.date !== 'string') return;
    const cur = byDate[x.date];
    if (!cur || (x.total || 0) > (cur.total || 0)) byDate[x.date] = x;
  });
  return Object.keys(byDate).sort().reverse().slice(0, cap).map(d => byDate[d]);
}

function mergePractice(a, b) {
  const pa = a || {};
  const pb = b || {};
  return {
    drill: mergeHistory(pa.drill, pb.drill, DRILL_CAP),
    quiz: mergeHistory(pa.quiz, pb.quiz, QUIZ_CAP),
    review: mergeReviewLog(pa.review, pb.review, REVIEW_CAP),
  };
}

module.exports = { DRILL_CAP, QUIZ_CAP, REVIEW_CAP, mergeHistory, mergeReviewLog, mergePractice };
