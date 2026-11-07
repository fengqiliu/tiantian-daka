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

// digest：report.weeklyDigest 的结果（另带 practiceLine）；name：孩子昵称
function layout(digest, name) {
  const ops = [];
  const maxW = WIDTH - 2 * PAD;
  let y = PAD;
  const text = (t, size, color, extra) => {
    wrap(t, size, maxW).forEach((line, i) => {
      y += Math.round(size * 1.5);
      ops.push({ type: 'text', text: line, x: PAD, y, size, color, bold: !!(extra && extra.bold), indent: i > 0 });
    });
  };
  const gap = h => { y += h; };
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
  const height = y + PAD;
  ops.unshift({ type: 'rect', x: 0, y: 0, w: WIDTH, h: height, color: '#FFF8EE' });
  return { width: WIDTH, height, ops };
}

module.exports = { WIDTH, PAD, textWidth, wrap, layout };
