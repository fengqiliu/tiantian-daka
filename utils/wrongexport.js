// 错题本导出：把口算与小卷错题整理成一段文字（复制到剪贴板后可粘贴到文档打印做纸质复习）
// 口算按级别分组，小卷按「科目 · 单元」分组（数学 → 语文 → 英语，单元升序）
const AR = require('./arithmetic');
const QZ = require('./quiz');
const SUBJ = require('./subjects');

function _quizAnswer(q) {
  return q.type === 'multi' ? (q.answers || []).join('、') : q.answerText;
}

function _quizLine(i, q) {
  let line = i + '. ' + q.prompt;
  if (q.type === 'multi') line += '  选项：' + q.options.join('、');
  else if (q.type !== 'judge') line += '  选项：' + q.options.join(' / ');
  line += '  答案：' + _quizAnswer(q);
  const why = QZ.explainOf(q);
  return line + (why ? '（' + why + '）' : '');
}

// data = { mathWrong, quizWrong, nickname, date }
function build(data) {
  const math = data.mathWrong || [];
  const quiz = data.quizWrong || [];
  const title = (data.nickname || '孩子') + '的错题本（' + data.date + '）';
  if (!math.length && !quiz.length) return title + '：目前没有错题，太棒了！';
  const out = [title + '：口算 ' + math.length + ' 题 · 小卷 ' + quiz.length + ' 题'];

  const byLevel = {};
  math.forEach(w => { (byLevel[w.level] = byLevel[w.level] || []).push(w.problem); });
  Object.keys(byLevel).forEach(level => {
    out.push('', '【口算 · ' + ((AR.LEVELS[level] || {}).name || level) + '】');
    byLevel[level].forEach((p, i) => {
      const hint = AR.hintOf(p);
      out.push((i + 1) + '. ' + AR.textOf(p) + '  答案：' + p.answer + (hint ? '（' + hint + '）' : ''));
    });
  });

  const groups = {};
  quiz.forEach(w => {
    const key = w.subject + '#' + w.question.unit;
    (groups[key] = groups[key] || { subject: w.subject, unit: w.question.unit, items: [] }).items.push(w.question);
  });
  Object.values(groups).sort(SUBJ.compareUnits).forEach(g => {
    out.push('', '【' + SUBJ.nameOf(g.subject) + ' · ' + SUBJ.unitLabel(g.unit) + '】');
    g.items.forEach((q, i) => out.push(_quizLine(i + 1, q)));
  });
  return out.join('\n');
}

module.exports = { build };
