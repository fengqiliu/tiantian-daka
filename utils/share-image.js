// 周报分享图：把周报排成一组绘制指令（纯函数，可测试），页面用 canvas 2d 按指令画出来再导出图片。
// 宽 750（与 rpx 设计稿一致），高度随内容；长句按宽度换行。
const WIDTH = 750;
const PAD = 40;
const BODY = 30;

// 估算文字宽度：汉字 / 全角 / emoji 按 1 个字号宽，ASCII 按 0.55 个
function textWidth(text, size) {
  let w = 0;
  for (const ch of String(text)) w += ch.charCodeAt(0) < 128 ? size * 0.55 : size;
  return w;
}

// 按最大宽度换行（逐字累计，不拆 emoji 代理对）
function wrap(text, size, maxW) {
  const lines = [];
  let cur = '';
  for (const ch of String(text)) {
    if (textWidth(cur + ch, size) > maxW && cur) { lines.push(cur); cur = ''; }
    cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

// 逐行排版的小工具：text() 自动换行并累计高度，finish() 补上背景并返回 { width, height, ops }
function builder(bg) {
  const ops = [];
  const maxW = WIDTH - 2 * PAD;
  let y = PAD;
  return {
    text(t, size, color, extra) {
      wrap(t, size, maxW).forEach((line, i) => {
        y += Math.round(size * 1.5);
        ops.push({ type: 'text', text: line, x: PAD, y, size, color, bold: !!(extra && extra.bold), indent: i > 0 });
      });
    },
    gap(h) { y += h; },
    finish() {
      const height = y + PAD;
      ops.unshift({ type: 'rect', x: 0, y: 0, w: WIDTH, h: height, color: bg });
      return { width: WIDTH, height, ops };
    },
  };
}

// digest：report.weeklyDigest 的结果（另带 practiceLine）；name：孩子昵称
function layout(digest, name) {
  const b = builder('#FFF8EE');
  const text = b.text;
  const gap = b.gap;
  text((name || '孩子') + '的周报', 44, '#33302B', { bold: true });
  text(digest.label || '', 26, '#A39E93');
  gap(16);
  const vs = digest.vsPrev > 0 ? '（比前一周多 ' + digest.vsPrev + ' 天）' : digest.vsPrev < 0 ? '（比前一周少 ' + (-digest.vsPrev) + ' 天）' : '';
  text('打卡 ' + digest.checkinDays + '/7 天 · 达成 ' + digest.achievedDays + ' 天' + vs + ' · ⭐ ' + digest.stars, BODY, '#33302B', { bold: true });
  if (digest.practiceLine) text(digest.practiceLine, 26, '#6B655B');
  if ((digest.highlights || []).length) {
    gap(16);
    text('本周亮点', 32, '#2F9E44', { bold: true });
    digest.highlights.forEach(h => text('✨ ' + h, BODY, '#33302B'));
  }
  if ((digest.attention || []).length) {
    gap(16);
    text('可以多关注', 32, '#E5484D', { bold: true });
    digest.attention.forEach(a => text('💡 ' + a, BODY, '#33302B'));
  }
  gap(24);
  text('天天小达人 · 只和昨天的自己比', 24, '#A39E93');
  return b.finish();
}

// 学期成长证书：summary 为 term.termSummary 的结果；extra.cardsMastered 为记住的记忆卡张数。为 0 的项不写
function certificate(summary, name, extra) {
  const b = builder('#FFF4D6');
  const e = extra || {};
  b.text('🏅 成长证书', 48, '#8A5A00', { bold: true });
  b.gap(12);
  b.text(name || '小达人', 40, '#33302B', { bold: true });
  b.text(summary.label || '', 28, '#A39E93');
  b.gap(20);
  b.text('坚持打卡 ' + summary.checkinDays + ' 天 · 达成 ' + summary.achievedDays + ' 天', 30, '#33302B');
  b.text('最长连续 ' + summary.bestStreak + ' 天', 30, '#33302B');
  b.text('获得 ' + (summary.badges || []).length + ' 枚勋章 · ⭐ ' + summary.stars, 30, '#33302B');
  const study = [];
  if (summary.masteredUnits) study.push('小卷掌握 ' + summary.masteredUnits + ' 个单元');
  if (summary.dailyDays) study.push('今日一练 ' + summary.dailyDays + ' 天');
  if (e.cardsMastered) study.push('记住 ' + e.cardsMastered + ' 张记忆卡');
  study.forEach(t => b.text(t, 30, '#33302B')); // 每项一行，避免长句在词中间换行
  if ((summary.highlights || []).length) {
    b.gap(16);
    summary.highlights.forEach(h => b.text('✨ ' + h, 28, '#6B655B'));
  }
  b.gap(28);
  b.text('天天小达人 · 每一天的努力都算数', 24, '#A39E93');
  return b.finish();
}

// 按指令画到 2d 上下文（canvas 2d / 离屏画布）
function paint(ctx, ops) {
  ops.forEach(op => {
    ctx.fillStyle = op.color;
    if (op.type === 'rect') ctx.fillRect(op.x, op.y, op.w, op.h);
    else { ctx.font = (op.bold ? 'bold ' : '') + op.size + 'px sans-serif'; ctx.fillText(op.text, op.x, op.y); }
  });
}

module.exports = { WIDTH, PAD, textWidth, wrap, layout, certificate, paint };
