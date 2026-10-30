// 每周一卷题库：从试卷知识库（content/exams/data/*.json）转录适合 App 内作答的题目
// —— 判断、选择、比大小；连线/圈画/书写/听力类不上屏。
// source 字段保留原卷出处，便于对照纸质卷讲评。
// type: 'choice'（options + answerText；shuffle:true 表示每次作答打乱选项顺序）
//       'judge'（判断题，统一渲染为 √/× 两选项）
//       'multi'（多选：options + answers，须全部选对）
// unit: 单元号；期末综合模拟卷记为 FINAL_UNIT（90），界面显示为“期末”。
const FINAL_UNIT = 90;

function unitLabel(unit) {
  return unit === FINAL_UNIT ? '期末' : '第' + unit + '单元';
}

module.exports = {
  FINAL_UNIT,
  unitLabel,
  bank: [
    // ── 数学 · 第二单元《认识图形》（A卷 六、选一选）──
    { id: 'math-u2-a6-1', subject: 'math', unit: 2, type: 'judge',
      prompt: '球没有平平的面，轻轻一推容易滚动。', answerText: '√', source: '数学·第二单元 A卷' },
    { id: 'math-u2-a6-2', subject: 'math', unit: 2, type: 'judge',
      prompt: '正方体和长方体都可以稳稳地叠放。', answerText: '√', source: '数学·第二单元 A卷' },

    // ── 数学 · 第三单元《10以内的数》（A卷 三、比一比）──
    { id: 'math-u3-a3-1', subject: 'math', unit: 3, type: 'choice', prompt: '3 ○ 5', options: ['<', '=', '>'], answerText: '<', source: '数学·第三单元 A卷' },
    { id: 'math-u3-a3-2', subject: 'math', unit: 3, type: 'choice', prompt: '7 ○ 7', options: ['<', '=', '>'], answerText: '=', source: '数学·第三单元 A卷' },
    { id: 'math-u3-a3-3', subject: 'math', unit: 3, type: 'choice', prompt: '9 ○ 6', options: ['<', '=', '>'], answerText: '>', source: '数学·第三单元 A卷' },
    { id: 'math-u3-a3-4', subject: 'math', unit: 3, type: 'choice', prompt: '0 ○ 2', options: ['<', '=', '>'], answerText: '<', source: '数学·第三单元 A卷' },
    { id: 'math-u3-a3-5', subject: 'math', unit: 3, type: 'choice', prompt: '10 ○ 8', options: ['<', '=', '>'], answerText: '>', source: '数学·第三单元 A卷' },

    // ── 数学 · 第四单元《10以内数的加减法》（A卷 三、比较大小）──
    { id: 'math-u4-a3-1', subject: 'math', unit: 4, type: 'choice', prompt: '3 + 4 ○ 8', options: ['<', '=', '>'], answerText: '<', source: '数学·第四单元 A卷' },
    { id: 'math-u4-a3-2', subject: 'math', unit: 4, type: 'choice', prompt: '9 - 2 ○ 6', options: ['<', '=', '>'], answerText: '>', source: '数学·第四单元 A卷' },
    { id: 'math-u4-a3-3', subject: 'math', unit: 4, type: 'choice', prompt: '5 + 5 ○ 10', options: ['<', '=', '>'], answerText: '=', source: '数学·第四单元 A卷' },
    { id: 'math-u4-a3-4', subject: 'math', unit: 4, type: 'choice', prompt: '8 - 3 ○ 4', options: ['<', '=', '>'], answerText: '>', source: '数学·第四单元 A卷' },

    // ── 语文 · 第一单元（B卷 八、判断）──
    { id: 'chinese-u1-b8-1', subject: 'chinese', unit: 1, type: 'judge',
      prompt: '“日”和“目”是同一个字。', answerText: '×', source: '语文·第一单元 B卷' },
    { id: 'chinese-u1-b8-2', subject: 'chinese', unit: 1, type: 'judge',
      prompt: '“田”比“口”多两画。', answerText: '√', source: '语文·第一单元 B卷' },
    { id: 'chinese-u1-b8-3', subject: 'chinese', unit: 1, type: 'judge',
      prompt: '“一二三四五”的顺序是正确的。', answerText: '√', source: '语文·第一单元 B卷' },
    { id: 'chinese-u1-b8-4', subject: 'chinese', unit: 1, type: 'judge',
      prompt: '“你、我、他”都可以表示人。', answerText: '√', source: '语文·第一单元 B卷' },

    // ── 语文 · 第二单元·拼音（B卷 九、判断）──
    { id: 'chinese-u2-b9-1', subject: 'chinese', unit: 2, type: 'judge',
      prompt: 'a、o、e、i、u、ü 都是单韵母。', answerText: '√', source: '语文·第二单元 B卷' },
    { id: 'chinese-u2-b9-2', subject: 'chinese', unit: 2, type: 'judge',
      prompt: 'b、p、m、f、d、t、n、l 都是声母。', answerText: '√', source: '语文·第二单元 B卷' },
    { id: 'chinese-u2-b9-3', subject: 'chinese', unit: 2, type: 'judge',
      prompt: 'ü 和 u 写法完全一样。', answerText: '×', source: '语文·第二单元 B卷' },
    { id: 'chinese-u2-b9-4', subject: 'chinese', unit: 2, type: 'judge',
      prompt: '第三声的声调走势是先降后升。', answerText: '√', source: '语文·第二单元 B卷' },
    { id: 'chinese-u2-b9-5', subject: 'chinese', unit: 2, type: 'judge',
      prompt: '“bā”可以拆成 b 和 ā。', answerText: '√', source: '语文·第二单元 B卷' },

    // ── 语文 · 第三单元·拼音（B卷 九、判断）──
    { id: 'chinese-u3-b9-1', subject: 'chinese', unit: 3, type: 'judge',
      prompt: 'z、c、s 是平舌音。', answerText: '√', source: '语文·第三单元 B卷' },
    { id: 'chinese-u3-b9-2', subject: 'chinese', unit: 3, type: 'judge',
      prompt: 'zh、ch、sh、r 是翘舌音。', answerText: '√', source: '语文·第三单元 B卷' },
    { id: 'chinese-u3-b9-3', subject: 'chinese', unit: 3, type: 'judge',
      prompt: 'zhi、chi、shi、ri 可以直接读，不用拼。', answerText: '√', source: '语文·第三单元 B卷' },
    { id: 'chinese-u3-b9-4', subject: 'chinese', unit: 3, type: 'judge',
      prompt: 'j 和 ü 相拼时，ü 上的两点不能省。', answerText: '×', source: '语文·第三单元 B卷' },
    { id: 'chinese-u3-b9-5', subject: 'chinese', unit: 3, type: 'judge',
      prompt: 'guā 可以拆成 g、u、ā 三个部分。', answerText: '√', source: '语文·第三单元 B卷' },

    // ── 英语 · Unit 1 Greetings（A卷 三、应答选择）──
    { id: 'english-u1-a3-1', subject: 'english', unit: 1, type: 'choice', shuffle: true,
      prompt: '别人对你说 “Hello!”，你回：', options: ['Hello!', 'Goodbye!'], answerText: 'Hello!', source: '英语·Unit 1 A卷' },
    { id: 'english-u1-a3-2', subject: 'english', unit: 1, type: 'choice', shuffle: true,
      prompt: '别人对你说 “Good morning.”，你回：', options: ['Good morning.', 'Good evening.'], answerText: 'Good morning.', source: '英语·Unit 1 A卷' },
    { id: 'english-u1-a3-3', subject: 'english', unit: 1, type: 'choice', shuffle: true,
      prompt: '别人问你 “How are you?”，你回：', options: ["I'm fine. Thank you.", 'Goodbye.'], answerText: "I'm fine. Thank you.", source: '英语·Unit 1 A卷' },
    { id: 'english-u1-a3-4', subject: 'english', unit: 1, type: 'choice', shuffle: true,
      prompt: '别人对你说 “Good afternoon.”，你回：', options: ['Good afternoon.', 'Good morning.'], answerText: 'Good afternoon.', source: '英语·Unit 1 A卷' },
    { id: 'english-u1-a3-5', subject: 'english', unit: 1, type: 'choice', shuffle: true,
      prompt: '放学了和老师告别，你说：', options: ['Goodbye.', 'How are you?'], answerText: 'Goodbye.', source: '英语·Unit 1 A卷' },

    // ── 英语 · Unit 1（A卷 四、情境选择）──
    { id: 'english-u1-a4-1', subject: 'english', unit: 1, type: 'choice', shuffle: true,
      prompt: '早晨到校见到老师：', options: ['Good morning!', 'Good evening!'], answerText: 'Good morning!', source: '英语·Unit 1 A卷' },
    { id: 'english-u1-a4-2', subject: 'english', unit: 1, type: 'choice', shuffle: true,
      prompt: '下午见到同学：', options: ['Good afternoon!', 'Goodbye!'], answerText: 'Good afternoon!', source: '英语·Unit 1 A卷' },
    { id: 'english-u1-a4-3', subject: 'english', unit: 1, type: 'choice', shuffle: true,
      prompt: '想问候对方近况：', options: ['How are you?', 'Hello, Dad.'], answerText: 'How are you?', source: '英语·Unit 1 A卷' },
    { id: 'english-u1-a4-4', subject: 'english', unit: 1, type: 'choice', shuffle: true,
      prompt: '放学和老师告别：', options: ['Goodbye!', 'Good morning!'], answerText: 'Goodbye!', source: '英语·Unit 1 A卷' },

    // ── 英语 · Unit 1（B卷 四、情境选择，三选一）──
    { id: 'english-u1-b4-1', subject: 'english', unit: 1, type: 'choice', shuffle: true,
      prompt: '7:30 早晨在校门口见到老师：', options: ['Good morning.', 'Good evening.', 'Goodbye.'], answerText: 'Good morning.', source: '英语·Unit 1 B卷' },
    { id: 'english-u1-b4-2', subject: 'english', unit: 1, type: 'choice', shuffle: true,
      prompt: '14:00 下午见到同学：', options: ['Good morning.', 'Good afternoon.', 'Goodbye.'], answerText: 'Good afternoon.', source: '英语·Unit 1 B卷' },
    { id: 'english-u1-b4-3', subject: 'english', unit: 1, type: 'choice', shuffle: true,
      prompt: '19:00 晚上见到家人：', options: ['Good evening.', 'Good afternoon.', 'Hello, morning.'], answerText: 'Good evening.', source: '英语·Unit 1 B卷' },
    { id: 'english-u1-b4-4', subject: 'english', unit: 1, type: 'choice', shuffle: true,
      prompt: '朋友问你 “How are you?”：', options: ['Goodbye.', "I'm fine. Thank you.", 'Good morning.'], answerText: "I'm fine. Thank you.", source: '英语·Unit 1 B卷' },

    // ── 语文 · 第二单元·拼音（A卷 一、声母韵母分分家 → 多选圈认）──
    { id: 'chinese-u2-a1-1', subject: 'chinese', unit: 2, type: 'multi', shuffle: true,
      prompt: '把下面 6 个单韵母都点出来：', options: ['a', 'b', 'o', 'p', 'e', 'm', 'i', 'f', 'u', 'd', 'ü', 't', 'n', 'l'],
      answers: ['a', 'o', 'e', 'i', 'u', 'ü'], source: '语文·第二单元 A卷' },
    { id: 'chinese-u2-a1-2', subject: 'chinese', unit: 2, type: 'multi', shuffle: true,
      prompt: '把下面 8 个声母都点出来：', options: ['a', 'b', 'o', 'p', 'e', 'm', 'i', 'f', 'u', 'd', 'ü', 't', 'n', 'l'],
      answers: ['b', 'p', 'm', 'f', 'd', 't', 'n', 'l'], source: '语文·第二单元 A卷' },

    // ── 语文 · 第三单元·拼音（A卷 二、平舌音和翘舌音分分家 → 多选）──
    { id: 'chinese-u3-a2-1', subject: 'chinese', unit: 3, type: 'multi', shuffle: true,
      prompt: '把平舌音都点出来：', options: ['z', 'c', 's', 'zh', 'ch', 'sh', 'r'],
      answers: ['z', 'c', 's'], source: '语文·第三单元 A卷' },
    { id: 'chinese-u3-a2-2', subject: 'chinese', unit: 3, type: 'multi', shuffle: true,
      prompt: '把翘舌音都点出来：', options: ['z', 'c', 's', 'zh', 'ch', 'sh', 'r'],
      answers: ['zh', 'ch', 'sh', 'r'], source: '语文·第三单元 A卷' },

    // ── 语文 · 第三单元·拼音（A卷 三、整体认读音节找一找 → 多选）──
    { id: 'chinese-u3-a5-1', subject: 'chinese', unit: 3, type: 'multi', shuffle: true,
      prompt: '把 10 个整体认读音节都点出来：', options: ['yi', 'ya', 'wu', 'yu', 'zi', 'ci', 'si', 'zhi', 'chi', 'shi', 'ri', 'gu', 'xu'],
      answers: ['yi', 'wu', 'yu', 'zi', 'ci', 'si', 'zhi', 'chi', 'shi', 'ri'], source: '语文·第三单元 A卷' },
    // ── 数学 · 第五单元《20以内的数》（A卷 三、比一比）──
    { id: 'math-u5-a3-1', subject: 'math', unit: 5, type: 'choice', prompt: '12 ○ 15', options: ['<', '=', '>'], answerText: '<', source: '数学·第五单元 A卷' },
    { id: 'math-u5-a3-2', subject: 'math', unit: 5, type: 'choice', prompt: '18 ○ 18', options: ['<', '=', '>'], answerText: '=', source: '数学·第五单元 A卷' },
    { id: 'math-u5-a3-3', subject: 'math', unit: 5, type: 'choice', prompt: '20 ○ 19', options: ['<', '=', '>'], answerText: '>', source: '数学·第五单元 A卷' },
    { id: 'math-u5-a3-4', subject: 'math', unit: 5, type: 'choice', prompt: '14 ○ 11', options: ['<', '=', '>'], answerText: '>', source: '数学·第五单元 A卷' },
    { id: 'math-u5-a3-5', subject: 'math', unit: 5, type: 'choice', prompt: '16 ○ 13', options: ['<', '=', '>'], answerText: '>', source: '数学·第五单元 A卷' },
    { id: 'math-u5-a3-6', subject: 'math', unit: 5, type: 'choice', prompt: '10 ○ 17', options: ['<', '=', '>'], answerText: '<', source: '数学·第五单元 A卷' },

    // ── 数学 · 第五单元（B卷 三、比较与排序）──
    { id: 'math-u5-b3-1', subject: 'math', unit: 5, type: 'choice', prompt: '13 ○ 17', options: ['<', '=', '>'], answerText: '<', source: '数学·第五单元 B卷' },
    { id: 'math-u5-b3-2', subject: 'math', unit: 5, type: 'choice', prompt: '20 ○ 20', options: ['<', '=', '>'], answerText: '=', source: '数学·第五单元 B卷' },
    { id: 'math-u5-b3-3', subject: 'math', unit: 5, type: 'choice', prompt: '19 ○ 16', options: ['<', '=', '>'], answerText: '>', source: '数学·第五单元 B卷' },
    { id: 'math-u5-b3-4', subject: 'math', unit: 5, type: 'choice', prompt: '11 ○ 15', options: ['<', '=', '>'], answerText: '<', source: '数学·第五单元 B卷' },

    // ── 数学 · 第六单元《20以内数的加减法（一）》（A卷 三、比较大小）──
    { id: 'math-u6-a3-1', subject: 'math', unit: 6, type: 'choice', prompt: '12 + 5 ○ 18', options: ['<', '=', '>'], answerText: '<', source: '数学·第六单元 A卷' },
    { id: 'math-u6-a3-2', subject: 'math', unit: 6, type: 'choice', prompt: '16 - 4 ○ 12', options: ['<', '=', '>'], answerText: '=', source: '数学·第六单元 A卷' },
    { id: 'math-u6-a3-3', subject: 'math', unit: 6, type: 'choice', prompt: '9 + 5 ○ 13', options: ['<', '=', '>'], answerText: '>', source: '数学·第六单元 A卷' },
    { id: 'math-u6-a3-4', subject: 'math', unit: 6, type: 'choice', prompt: '7 + 6 ○ 14', options: ['<', '=', '>'], answerText: '<', source: '数学·第六单元 A卷' },
    { id: 'math-u6-a3-5', subject: 'math', unit: 6, type: 'choice', prompt: '18 - 7 ○ 10', options: ['<', '=', '>'], answerText: '>', source: '数学·第六单元 A卷' },
    { id: 'math-u6-a3-6', subject: 'math', unit: 6, type: 'choice', prompt: '8 + 4 ○ 6 + 6', options: ['<', '=', '>'], answerText: '=', source: '数学·第六单元 A卷' },

    // ── 数学 · 第六单元（B卷 三、圈出得数是15的算式 → 多选）──
    { id: 'math-u6-b3-1', subject: 'math', unit: 6, type: 'multi', shuffle: true,
      prompt: '把得数是 15 的算式都点出来：', options: ['9+6', '8+6', '7+8', '6+7', '10+5'],
      answers: ['9+6', '7+8', '10+5'], source: '数学·第六单元 B卷' },

    // ── 数学 · 第七单元 复习（A卷 三、比较大小）──
    { id: 'math-u7-a3-1', subject: 'math', unit: 7, type: 'choice', prompt: '8 ○ 6', options: ['<', '=', '>'], answerText: '>', source: '数学·第七单元 A卷' },
    { id: 'math-u7-a3-2', subject: 'math', unit: 7, type: 'choice', prompt: '10 ○ 10', options: ['<', '=', '>'], answerText: '=', source: '数学·第七单元 A卷' },
    { id: 'math-u7-a3-3', subject: 'math', unit: 7, type: 'choice', prompt: '15 ○ 12', options: ['<', '=', '>'], answerText: '>', source: '数学·第七单元 A卷' },
    { id: 'math-u7-a3-4', subject: 'math', unit: 7, type: 'choice', prompt: '9 + 4 ○ 13', options: ['<', '=', '>'], answerText: '=', source: '数学·第七单元 A卷' },
    { id: 'math-u7-a3-5', subject: 'math', unit: 7, type: 'choice', prompt: '18 - 5 ○ 12', options: ['<', '=', '>'], answerText: '>', source: '数学·第七单元 A卷' },
    { id: 'math-u7-a3-6', subject: 'math', unit: 7, type: 'choice', prompt: '7 + 2 ○ 10', options: ['<', '=', '>'], answerText: '<', source: '数学·第七单元 A卷' },

    // ── 数学 · 期末模拟（A卷 三、选择和判断）──
    { id: 'math-final-a3-1', subject: 'math', unit: 90, type: 'choice', shuffle: true,
      prompt: '由 1 个十和 6 个一组成的数是：', options: ['61', '16', '7'], answerText: '16', source: '数学·期末模拟 A卷' },
    { id: 'math-final-a3-2', subject: 'math', unit: 90, type: 'choice', shuffle: true,
      prompt: '下面得数最大的是：', options: ['7 + 2', '8 + 5', '16 - 4'], answerText: '8 + 5', source: '数学·期末模拟 A卷' },
    { id: 'math-final-a3-3', subject: 'math', unit: 90, type: 'choice', shuffle: true,
      prompt: '比 15 大、比 17 小的数是：', options: ['14', '16', '18'], answerText: '16', source: '数学·期末模拟 A卷' },
    { id: 'math-final-a3-4', subject: 'math', unit: 90, type: 'choice', shuffle: true,
      prompt: '最容易滚动的是：', options: ['球', '正方体', '长方体'], answerText: '球', source: '数学·期末模拟 A卷' },
    { id: 'math-final-a3-5', subject: 'math', unit: 90, type: 'judge',
      prompt: '19 前面的一个数是 18。', answerText: '√', source: '数学·期末模拟 A卷' },
    { id: 'math-final-a3-6', subject: 'math', unit: 90, type: 'judge',
      prompt: '算 8 + 7 时，可以先把 7 分成 2 和 5，再算 8 + 2 + 5。', answerText: '√', source: '数学·期末模拟 A卷' },
    { id: 'math-final-a3-7', subject: 'math', unit: 90, type: 'judge',
      prompt: '15 - 3 和 7 + 5 的得数相等。', answerText: '√', source: '数学·期末模拟 A卷' },

    // ── 数学 · 期末模拟（B卷 三、选择和判断）──
    { id: 'math-final-b3-1', subject: 'math', unit: 90, type: 'choice', shuffle: true,
      prompt: '最接近 20 的数是：', options: ['12', '18', '15'], answerText: '18', source: '数学·期末模拟 B卷' },
    { id: 'math-final-b3-2', subject: 'math', unit: 90, type: 'choice', shuffle: true,
      prompt: '得数等于 15 的算式是：', options: ['8 + 6', '9 + 6', '18 - 4'], answerText: '9 + 6', source: '数学·期末模拟 B卷' },
    { id: 'math-final-b3-3', subject: 'math', unit: 90, type: 'choice', shuffle: true,
      prompt: '用凑十法算 7 + 8，正确的是：', options: ['7 + 3 + 5', '7 + 1 + 7', '8 + 8'], answerText: '7 + 3 + 5', source: '数学·期末模拟 B卷' },
    { id: 'math-final-b3-4', subject: 'math', unit: 90, type: 'choice', shuffle: true,
      prompt: '小朋友排一队，从右数第 2 个和从左数第 4 个是同一个人，这一队有几人？', options: ['4', '5', '6'], answerText: '5', source: '数学·期末模拟 B卷' },
    { id: 'math-final-b3-5', subject: 'math', unit: 90, type: 'judge',
      prompt: '20 可以看成 2 个十。', answerText: '√', source: '数学·期末模拟 B卷' },
    { id: 'math-final-b3-6', subject: 'math', unit: 90, type: 'judge',
      prompt: '16 - 4 和 12 + 0 的得数相等。', answerText: '√', source: '数学·期末模拟 B卷' },
    { id: 'math-final-b3-7', subject: 'math', unit: 90, type: 'judge',
      prompt: '9 + 8 的得数比 18 - 2 大。', answerText: '√', source: '数学·期末模拟 B卷' },

    // ── 语文 · 第四单元·拼音（A卷 四、整体认读音节 / 一、韵母分类 → 多选）──
    { id: 'chinese-u4-a4-1', subject: 'chinese', unit: 4, type: 'multi', shuffle: true,
      prompt: '把 6 个整体认读音节都点出来：', options: ['ye', 'yue', 'yuan', 'yin', 'yun', 'ying', 'ya', 'wen', 'xian', 'liang'],
      answers: ['ye', 'yue', 'yuan', 'yin', 'yun', 'ying'], source: '语文·第四单元 A卷' },
    { id: 'chinese-u4-a1-1', subject: 'chinese', unit: 4, type: 'multi', shuffle: true,
      prompt: '把后鼻韵母都点出来：', options: ['an', 'en', 'in', 'un', 'ün', 'ang', 'eng', 'ing', 'ong'],
      answers: ['ang', 'eng', 'ing', 'ong'], source: '语文·第四单元 A卷' },

    // ── 语文 · 第四单元·拼音（A卷 五、看图选音节 / 七、选出正确的拼音）──
    { id: 'chinese-u4-a5-1', subject: 'chinese', unit: 4, type: 'choice', shuffle: true,
      prompt: '“帽子”的正确拼音是：', options: ['mào zi', 'mǎo zi'], answerText: 'mào zi', source: '语文·第四单元 A卷' },
    { id: 'chinese-u4-a5-2', subject: 'chinese', unit: 4, type: 'choice', shuffle: true,
      prompt: '“太阳”的正确拼音是：', options: ['tài yáng', 'tái yáng'], answerText: 'tài yáng', source: '语文·第四单元 A卷' },
    { id: 'chinese-u4-a5-3', subject: 'chinese', unit: 4, type: 'choice', shuffle: true,
      prompt: '“白云”的正确拼音是：', options: ['bái yún', 'bài yún'], answerText: 'bái yún', source: '语文·第四单元 A卷' },
    { id: 'chinese-u4-a5-4', subject: 'chinese', unit: 4, type: 'choice', shuffle: true,
      prompt: '“彩虹”的正确拼音是：', options: ['cǎi hóng', 'cài hóng'], answerText: 'cǎi hóng', source: '语文·第四单元 A卷' },
    { id: 'chinese-u4-a7-1', subject: 'chinese', unit: 4, type: 'choice', shuffle: true,
      prompt: '“妹妹”的正确拼音是：', options: ['mèi mei', 'mài mai'], answerText: 'mèi mei', source: '语文·第四单元 A卷' },
    { id: 'chinese-u4-a7-2', subject: 'chinese', unit: 4, type: 'choice', shuffle: true,
      prompt: '“白云”的正确拼音是：', options: ['bái yún', 'bái yóng'], answerText: 'bái yún', source: '语文·第四单元 A卷' },
    { id: 'chinese-u4-a7-3', subject: 'chinese', unit: 4, type: 'choice', shuffle: true,
      prompt: '“月亮”的正确拼音是：', options: ['yuè liang', 'yè liang'], answerText: 'yuè liang', source: '语文·第四单元 A卷' },
    { id: 'chinese-u4-a7-4', subject: 'chinese', unit: 4, type: 'choice', shuffle: true,
      prompt: '“明亮”的正确拼音是：', options: ['míng liàng', 'mín liàn'], answerText: 'míng liàng', source: '语文·第四单元 A卷' },

    // ── 语文 · 第四单元·拼音（B卷 四、标调小法官）──
    { id: 'chinese-u4-b4-1', subject: 'chinese', unit: 4, type: 'choice', shuffle: true,
      prompt: '哪个音节的声调标对了？', options: ['liú', 'líu'], answerText: 'liú', source: '语文·第四单元 B卷' },
    { id: 'chinese-u4-b4-2', subject: 'chinese', unit: 4, type: 'choice', shuffle: true,
      prompt: '哪个音节的声调标对了？', options: ['guǐ', 'gǔi'], answerText: 'guǐ', source: '语文·第四单元 B卷' },
    { id: 'chinese-u4-b4-3', subject: 'chinese', unit: 4, type: 'choice', shuffle: true,
      prompt: '哪个音节的声调标对了？', options: ['xiè', 'xìe'], answerText: 'xiè', source: '语文·第四单元 B卷' },
    { id: 'chinese-u4-b4-4', subject: 'chinese', unit: 4, type: 'choice', shuffle: true,
      prompt: '哪个音节的声调标对了？', options: ['qiū', 'qīu'], answerText: 'qiū', source: '语文·第四单元 B卷' },

    // ── 语文 · 第五单元（A卷 一、加点字读音）──
    { id: 'chinese-u5-a2-1', subject: 'chinese', unit: 5, type: 'choice', shuffle: true,
      prompt: '“秋天”的“秋”读：', options: ['qiū', 'qū'], answerText: 'qiū', source: '语文·第五单元 A卷' },
    { id: 'chinese-u5-a2-2', subject: 'chinese', unit: 5, type: 'choice', shuffle: true,
      prompt: '“莲叶”的“莲”读：', options: ['lián', 'lán'], answerText: 'lián', source: '语文·第五单元 A卷' },
    { id: 'chinese-u5-a2-3', subject: 'chinese', unit: 5, type: 'choice', shuffle: true,
      prompt: '“竹叶”的“竹”读：', options: ['zhú', 'zú'], answerText: 'zhú', source: '语文·第五单元 A卷' },
    { id: 'chinese-u5-a2-4', subject: 'chinese', unit: 5, type: 'choice', shuffle: true,
      prompt: '“冬天”的“冬”读：', options: ['dōng', 'dēng'], answerText: 'dōng', source: '语文·第五单元 A卷' },

    // ── 语文 · 第五单元（A卷 二、选字填空；"（人 大）山里"两字都通，不收）──
    { id: 'chinese-u5-a4-2', subject: 'chinese', unit: 5, type: 'choice', shuffle: true,
      prompt: '太阳从（　）边升起。', options: ['东', '西'], answerText: '东', source: '语文·第五单元 A卷' },
    { id: 'chinese-u5-a4-3', subject: 'chinese', unit: 5, type: 'choice', shuffle: true,
      prompt: '这个字（　）“天”。', options: ['是', '四'], answerText: '是', source: '语文·第五单元 A卷' },
    { id: 'chinese-u5-a4-4', subject: 'chinese', unit: 5, type: 'choice', shuffle: true,
      prompt: '我有（　）本书。', options: ['四', '西'], answerText: '四', source: '语文·第五单元 A卷' },
    { id: 'chinese-u5-a4-5', subject: 'chinese', unit: 5, type: 'choice', shuffle: true,
      prompt: '方向有东也有（　）。', options: ['西', '大'], answerText: '西', source: '语文·第五单元 A卷' },

    // ── 语文 · 第五单元（A卷 三、根据四季特点判断）──
    { id: 'chinese-u5-a6-1', subject: 'chinese', unit: 5, type: 'judge',
      prompt: '春天常能看到花儿开放。', answerText: '√', source: '语文·第五单元 A卷' },
    { id: 'chinese-u5-a6-2', subject: 'chinese', unit: 5, type: 'judge',
      prompt: '夏天荷花盛开。', answerText: '√', source: '语文·第五单元 A卷' },
    { id: 'chinese-u5-a6-3', subject: 'chinese', unit: 5, type: 'judge',
      prompt: '秋天树叶会变黄、飘落。', answerText: '√', source: '语文·第五单元 A卷' },
    { id: 'chinese-u5-a6-4', subject: 'chinese', unit: 5, type: 'judge',
      prompt: '冬天常会下雪。', answerText: '√', source: '语文·第五单元 A卷' },
    { id: 'chinese-u5-a6-5', subject: 'chinese', unit: 5, type: 'judge',
      prompt: '夏天要穿厚棉袄。', answerText: '×', source: '语文·第五单元 A卷' },
    { id: 'chinese-u5-a6-6', subject: 'chinese', unit: 5, type: 'judge',
      prompt: '秋天和冬天完全一样。', answerText: '×', source: '语文·第五单元 A卷' },

    // ── 语文 · 第六单元·识字（A卷 一、加点字读音与会意字）──
    { id: 'chinese-u6-a2-1', subject: 'chinese', unit: 6, type: 'choice', shuffle: true,
      prompt: '“森林”的“森”读：', options: ['sēn', 'shēn'], answerText: 'sēn', source: '语文·第六单元 A卷' },
    { id: 'chinese-u6-a2-2', subject: 'chinese', unit: 6, type: 'choice', shuffle: true,
      prompt: '“书包”的“书”读：', options: ['shū', 'sū'], answerText: 'shū', source: '语文·第六单元 A卷' },
    { id: 'chinese-u6-a2-3', subject: 'chinese', unit: 6, type: 'choice', shuffle: true,
      prompt: '“国旗”的“旗”读：', options: ['qí', 'pí'], answerText: 'qí', source: '语文·第六单元 A卷' },
    { id: 'chinese-u6-a2-4', subject: 'chinese', unit: 6, type: 'choice', shuffle: true,
      prompt: '“立正”的“正”读：', options: ['zhèng', 'zèng'], answerText: 'zhèng', source: '语文·第六单元 A卷' },
    { id: 'chinese-u6-a3-1', subject: 'chinese', unit: 6, type: 'choice', shuffle: true,
      prompt: '下面属于“会意字”的一组是：', options: ['明 林 森', '云 雨 风', '书 尺 刀'], answerText: '明 林 森', source: '语文·第六单元 A卷' },
    { id: 'chinese-u6-a6-1', subject: 'chinese', unit: 6, type: 'choice', shuffle: true,
      prompt: '“学校—老师、医院—医生、工厂—工人”是什么关系？', options: ['地方和职业', '天气和季节', '动物和食物'], answerText: '地方和职业', source: '语文·第六单元 A卷' },

    // ── 语文 · 第六单元（B卷 三、归类 / 八、做法 / 九、判断）──
    { id: 'chinese-u6-b3-1', subject: 'chinese', unit: 6, type: 'choice', shuffle: true,
      prompt: '哪一组的归类方法和另外两组不同？', options: ['超市—收银员', '学校—老师', '铅笔—尺子'], answerText: '铅笔—尺子', source: '语文·第六单元 B卷' },
    { id: 'chinese-u6-b8-1', subject: 'chinese', unit: 6, type: 'choice', shuffle: true,
      prompt: '下面做法正确的是：', options: ['每天整理书包', '尺子随手丢', '转笔刀故意不还'], answerText: '每天整理书包', source: '语文·第六单元 B卷' },
    { id: 'chinese-u6-b9-1', subject: 'chinese', unit: 6, type: 'judge',
      prompt: '“林”和“森”都和“木”有关系。', answerText: '√', source: '语文·第六单元 B卷' },
    { id: 'chinese-u6-b9-2', subject: 'chinese', unit: 6, type: 'judge',
      prompt: '升国旗时可以边走边聊天。', answerText: '×', source: '语文·第六单元 B卷' },
    { id: 'chinese-u6-b9-3', subject: 'chinese', unit: 6, type: 'judge',
      prompt: '“明”可以用“日 + 月”的方法来记。', answerText: '√', source: '语文·第六单元 B卷' },
    { id: 'chinese-u6-b9-4', subject: 'chinese', unit: 6, type: 'judge',
      prompt: '铅笔、尺子、作业本都是学习用品。', answerText: '√', source: '语文·第六单元 B卷' },

    // ── 语文 · 第七单元（A卷 一、加点字读音 / 二、词语）──
    { id: 'chinese-u7-a2-1', subject: 'chinese', unit: 7, type: 'choice', shuffle: true,
      prompt: '“弯弯”的“弯”读：', options: ['wān', 'wǎn'], answerText: 'wān', source: '语文·第七单元 A卷' },
    { id: 'chinese-u7-a2-2', subject: 'chinese', unit: 7, type: 'choice', shuffle: true,
      prompt: '“影子”的“影”读：', options: ['yǐng', 'yǐn'], answerText: 'yǐng', source: '语文·第七单元 A卷' },
    { id: 'chinese-u7-a2-3', subject: 'chinese', unit: 7, type: 'choice', shuffle: true,
      prompt: '“事情”的“事”读：', options: ['shì', 'sì'], answerText: 'shì', source: '语文·第七单元 A卷' },
    { id: 'chinese-u7-a6-1', subject: 'chinese', unit: 7, type: 'choice', shuffle: true,
      prompt: '“常常”表示：', options: ['经常发生', '一次也没有', '只有今天'], answerText: '经常发生', source: '语文·第七单元 A卷' },

    // ── 语文 · 第七单元（A卷 三、课文意思判断 / 语文园地）──
    { id: 'chinese-u7-a8-1', subject: 'chinese', unit: 7, type: 'judge',
      prompt: '影子的位置一成不变。', answerText: '×', source: '语文·第七单元 A卷' },
    { id: 'chinese-u7-a8-2', subject: 'chinese', unit: 7, type: 'judge',
      prompt: '双手会做事，大脑会思考。', answerText: '√', source: '语文·第七单元 A卷' },
    { id: 'chinese-u7-a8-3', subject: 'chinese', unit: 7, type: 'judge',
      prompt: '观察月亮，可以展开想象。', answerText: '√', source: '语文·第七单元 A卷' },
    { id: 'chinese-u7-a8-4', subject: 'chinese', unit: 7, type: 'judge',
      prompt: '只动脑不动手，也一定能把事情做好。', answerText: '×', source: '语文·第七单元 A卷' },
    { id: 'chinese-u7-a9-1', subject: 'chinese', unit: 7, type: 'choice', shuffle: true,
      prompt: '在图书馆和同学交流，应该：', options: ['轻声说', '大声喊', '一边跑一边叫'], answerText: '轻声说', source: '语文·第七单元 A卷' },

    // ── 语文 · 第七单元（B卷 一、方位词 / 三、影子方向）──
    { id: 'chinese-u7-b3-1', subject: 'chinese', unit: 7, type: 'choice', shuffle: true,
      prompt: '下面哪一组词都是方位词？', options: ['前 后 左 右', '月 星 云 雨', '手 脑 眼 耳'], answerText: '前 后 左 右', source: '语文·第七单元 B卷' },
    { id: 'chinese-u7-b8-1', subject: 'chinese', unit: 7, type: 'choice', shuffle: true,
      prompt: '早晨，太阳在你的左边，影子在你的：', options: ['右边', '左边'], answerText: '右边', source: '语文·第七单元 B卷' },

    // ── 语文 · 第八单元（A卷 一、加点字读音 / 三、笔顺规则）──
    { id: 'chinese-u8-a2-1', subject: 'chinese', unit: 8, type: 'choice', shuffle: true,
      prompt: '“尾巴”的“巴”读：', options: ['ba（轻声）', 'bā'], answerText: 'ba（轻声）', source: '语文·第八单元 A卷' },
    { id: 'chinese-u8-a2-2', subject: 'chinese', unit: 8, type: 'choice', shuffle: true,
      prompt: '“数不清”的“数”读：', options: ['shǔ', 'shù'], answerText: 'shǔ', source: '语文·第八单元 A卷' },
    { id: 'chinese-u8-a2-3', subject: 'chinese', unit: 8, type: 'choice', shuffle: true,
      prompt: '“一把伞”的“把”读：', options: ['bǎ', 'bā'], answerText: 'bǎ', source: '语文·第八单元 A卷' },
    { id: 'chinese-u8-a9-1', subject: 'chinese', unit: 8, type: 'choice', shuffle: true,
      prompt: '“月”“风”这样的字，笔顺规则是：', options: ['先外后内', '先中间后两边'], answerText: '先外后内', source: '语文·第八单元 A卷' },
    { id: 'chinese-u8-a9-2', subject: 'chinese', unit: 8, type: 'choice', shuffle: true,
      prompt: '“小”“水”这样的字，笔顺规则是：', options: ['先中间后两边', '先外后内'], answerText: '先中间后两边', source: '语文·第八单元 A卷' },

    // ── 语文 · 第八单元（B卷 二、课文综合理解 / 三、书写规则）──
    { id: 'chinese-u8-b4-1', subject: 'chinese', unit: 8, type: 'choice', shuffle: true,
      prompt: '谁的尾巴好像一把伞？', options: ['松鼠', '兔子', '鸭子'], answerText: '松鼠', source: '语文·第八单元 B卷' },
    { id: 'chinese-u8-b5-1', subject: 'chinese', unit: 8, type: 'choice', shuffle: true,
      prompt: '乌鸦为什么能喝到水？最重要的原因是：', options: ['认真观察并想办法', '瓶子自己倒下了', '别的动物帮了它'], answerText: '认真观察并想办法', source: '语文·第八单元 B卷' },
    { id: 'chinese-u8-b7-1', subject: 'chinese', unit: 8, type: 'choice', shuffle: true,
      prompt: '“数不清的雨点儿”说明雨点儿：', options: ['很多', '很少', '一个也没有'], answerText: '很多', source: '语文·第八单元 B卷' },
    { id: 'chinese-u8-b9-1', subject: 'chinese', unit: 8, type: 'judge',
      prompt: '“小”“水”都是先写中间，再写两边。', answerText: '√', source: '语文·第八单元 B卷' },

    // ── 语文 · 期末模拟（A卷 一、读音 / 韵母分类 → 多选）──
    { id: 'chinese-final-a2-1', subject: 'chinese', unit: 90, type: 'choice', shuffle: true,
      prompt: '“尾巴”的“尾”读：', options: ['wěi', 'wéi'], answerText: 'wěi', source: '语文·期末模拟 A卷' },
    { id: 'chinese-final-a2-2', subject: 'chinese', unit: 90, type: 'choice', shuffle: true,
      prompt: '“叶子”的“叶”读：', options: ['yè', 'yé'], answerText: 'yè', source: '语文·期末模拟 A卷' },
    { id: 'chinese-final-a2-3', subject: 'chinese', unit: 90, type: 'choice', shuffle: true,
      prompt: '“升旗”的“升”读：', options: ['shēng', 'sēng'], answerText: 'shēng', source: '语文·期末模拟 A卷' },
    { id: 'chinese-final-a3-1', subject: 'chinese', unit: 90, type: 'multi', shuffle: true,
      prompt: '把前鼻韵母都点出来：', options: ['an', 'en', 'in', 'un', 'ang', 'eng', 'ing', 'ong'],
      answers: ['an', 'en', 'in', 'un'], source: '语文·期末模拟 A卷' },

    // ── 语文 · 期末模拟（A卷 三、课内知识）──
    { id: 'chinese-final-a8-1', subject: 'chinese', unit: 90, type: 'choice', shuffle: true,
      prompt: '《小小的船》中，“小船”指的是：', options: ['月亮', '星星'], answerText: '月亮', source: '语文·期末模拟 A卷' },
    { id: 'chinese-final-a9-1', subject: 'chinese', unit: 90, type: 'choice', shuffle: true,
      prompt: '《雪地里的小画家》中，小鸡的脚印像：', options: ['竹叶', '月牙'], answerText: '竹叶', source: '语文·期末模拟 A卷' },
    { id: 'chinese-final-a10-1', subject: 'chinese', unit: 90, type: 'choice', shuffle: true,
      prompt: '《乌鸦喝水》中，乌鸦最后用什么办法喝到水？', options: ['把小石子放进瓶子里', '把瓶子推倒'], answerText: '把小石子放进瓶子里', source: '语文·期末模拟 A卷' },
    { id: 'chinese-final-a11-1', subject: 'chinese', unit: 90, type: 'choice', shuffle: true,
      prompt: '《雨点儿》中，雨水能帮助：', options: ['花草生长', '石头长高'], answerText: '花草生长', source: '语文·期末模拟 A卷' },

    // ── 语文 · 期末模拟（B卷 一、拼音与识字；三、课内综合）──
    { id: 'chinese-final-b1-1', subject: 'chinese', unit: 90, type: 'choice', shuffle: true,
      prompt: '声母和另外两个不同的是：', options: ['shān', 'sān', 'shàng'], answerText: 'sān', source: '语文·期末模拟 B卷' },
    { id: 'chinese-final-b1-2', subject: 'chinese', unit: 90, type: 'choice', shuffle: true,
      prompt: '含有前鼻韵母的是：', options: ['yún', 'yú', 'yǔ'], answerText: 'yún', source: '语文·期末模拟 B卷' },
    { id: 'chinese-final-b2-1', subject: 'chinese', unit: 90, type: 'multi', shuffle: true,
      prompt: '把整体认读音节都点出来：', options: ['zhi', 'yu', 'ci', 'ying', 'an', 'ui', 'ong', 'er'],
      answers: ['zhi', 'yu', 'ci', 'ying'], source: '语文·期末模拟 B卷' },
    { id: 'chinese-final-b8-1', subject: 'chinese', unit: 90, type: 'choice', shuffle: true,
      prompt: '“弯弯的月亮像小船”，是把月亮和什么联系起来观察？', options: ['小船', '小鸟'], answerText: '小船', source: '语文·期末模拟 B卷' },

    // ── 英语 · Unit 2 New friends（A卷 三、应答选择）──
    { id: 'english-u2-a3-1', subject: 'english', unit: 2, type: 'choice', shuffle: true,
      prompt: '别人对你说 “Hello!”，你回：', options: ['Hi!', 'Goodbye!'], answerText: 'Hi!', source: '英语·Unit 2 A卷' },
    { id: 'english-u2-a3-2', subject: 'english', unit: 2, type: 'choice', shuffle: true,
      prompt: '新同学说 “My name is Shenshen.”，你回：', options: ['Hi, Shenshen.', 'Good evening.'], answerText: 'Hi, Shenshen.', source: '英语·Unit 2 A卷' },
    { id: 'english-u2-a3-3', subject: 'english', unit: 2, type: 'choice', shuffle: true,
      prompt: '别人对你说 “Welcome to China!”，你回：', options: ['Thank you.', 'Goodbye.'], answerText: 'Thank you.', source: '英语·Unit 2 A卷' },
    { id: 'english-u2-a3-4', subject: 'english', unit: 2, type: 'choice', shuffle: true,
      prompt: '新朋友说 “Nice to meet you.”，你回：', options: ['Nice to meet you.', 'Good morning.'], answerText: 'Nice to meet you.', source: '英语·Unit 2 A卷' },
    { id: 'english-u2-a3-5', subject: 'english', unit: 2, type: 'choice', shuffle: true,
      prompt: '新朋友说 “You can call me Lily.”，你回：', options: ['Hi, Lily.', 'Hi, White.'], answerText: 'Hi, Lily.', source: '英语·Unit 2 A卷' },

    // ── 英语 · Unit 2（A卷 四、情境选择）──
    { id: 'english-u2-a4-1', subject: 'english', unit: 2, type: 'choice', shuffle: true,
      prompt: '第一次见到新朋友：', options: ['Nice to meet you.', 'Good evening.'], answerText: 'Nice to meet you.', source: '英语·Unit 2 A卷' },
    { id: 'english-u2-a4-2', subject: 'english', unit: 2, type: 'choice', shuffle: true,
      prompt: '告诉别人自己的名字：', options: ['My name is Minmin.', 'Goodbye, Minmin.'], answerText: 'My name is Minmin.', source: '英语·Unit 2 A卷' },
    { id: 'english-u2-a4-3', subject: 'english', unit: 2, type: 'choice', shuffle: true,
      prompt: '欢迎 Lily 来中国：', options: ['Welcome to China!', 'Good afternoon!'], answerText: 'Welcome to China!', source: '英语·Unit 2 A卷' },
    { id: 'english-u2-a4-4', subject: 'english', unit: 2, type: 'choice', shuffle: true,
      prompt: '告诉别人可以叫自己 Lily：', options: ['You can call me Lily.', 'My name is White.'], answerText: 'You can call me Lily.', source: '英语·Unit 2 A卷' },

    // ── 英语 · Unit 3 My schoolbag（A卷 三、读句选学习用品）──
    { id: 'english-u3-a3-1', subject: 'english', unit: 3, type: 'choice', shuffle: true,
      prompt: '“I write with it.” 说的是：', options: ['pencil', 'book'], answerText: 'pencil', source: '英语·Unit 3 A卷' },
    { id: 'english-u3-a3-2', subject: 'english', unit: 3, type: 'choice', shuffle: true,
      prompt: '“I read it.” 说的是：', options: ['book', 'ruler'], answerText: 'book', source: '英语·Unit 3 A卷' },
    { id: 'english-u3-a3-3', subject: 'english', unit: 3, type: 'choice', shuffle: true,
      prompt: '“I erase with it.” 说的是：', options: ['eraser', 'schoolbag'], answerText: 'eraser', source: '英语·Unit 3 A卷' },
    { id: 'english-u3-a3-4', subject: 'english', unit: 3, type: 'choice', shuffle: true,
      prompt: '“I put pencils in it.” 说的是：', options: ['pencil case', 'book'], answerText: 'pencil case', source: '英语·Unit 3 A卷' },

    // ── 英语 · Unit 3（B卷 三、情境选择）──
    { id: 'english-u3-b3-1', subject: 'english', unit: 3, type: 'choice', shuffle: true,
      prompt: '把直尺放进书包：', options: ['Pack my ruler.', 'Use my ruler.'], answerText: 'Pack my ruler.', source: '英语·Unit 3 B卷' },
    { id: 'english-u3-b3-2', subject: 'english', unit: 3, type: 'choice', shuffle: true,
      prompt: '把铅笔借给同学：', options: ['Use my pencil.', 'Pack my pencil.'], answerText: 'Use my pencil.', source: '英语·Unit 3 B卷' },
    { id: 'english-u3-b3-3', subject: 'english', unit: 3, type: 'choice', shuffle: true,
      prompt: '同学找不到橡皮很着急，你安慰他：', options: ["Don't worry.", 'My schoolbag.'], answerText: "Don't worry.", source: '英语·Unit 3 B卷' },
    { id: 'english-u3-b3-4', subject: 'english', unit: 3, type: 'choice', shuffle: true,
      prompt: '把书本装进书包：', options: ['Pack my books.', 'Use my books.'], answerText: 'Pack my books.', source: '英语·Unit 3 B卷' },

    // ── 英语 · Unit 4 My classroom（A卷 三、情境选择）──
    { id: 'english-u4-a3-1', subject: 'english', unit: 4, type: 'choice', shuffle: true,
      prompt: '你想擦黑板：', options: ['Let me clean the blackboard.', 'Thank you.'], answerText: 'Let me clean the blackboard.', source: '英语·Unit 4 A卷' },
    { id: 'english-u4-a3-2', subject: 'english', unit: 4, type: 'choice', shuffle: true,
      prompt: '想问今天谁值日：', options: ["Who's on duty?", 'Clean the door.'], answerText: "Who's on duty?", source: '英语·Unit 4 A卷' },
    { id: 'english-u4-a3-3', subject: 'english', unit: 4, type: 'choice', shuffle: true,
      prompt: '同学帮你打扫后：', options: ['Thank you.', 'Put the books back.'], answerText: 'Thank you.', source: '英语·Unit 4 A卷' },
    { id: 'english-u4-a3-4', subject: 'english', unit: 4, type: 'choice', shuffle: true,
      prompt: '书本放乱了，请大家：', options: ['Put the books back.', 'Let me clean the floor.'], answerText: 'Put the books back.', source: '英语·Unit 4 A卷' },

    // ── 英语 · Unit 4（B卷 四、情境选择）──
    { id: 'english-u4-b4-1', subject: 'english', unit: 4, type: 'choice', shuffle: true,
      prompt: '地上有纸屑，你说：', options: ['Let me clean the floor.', 'Welcome to China!'], answerText: 'Let me clean the floor.', source: '英语·Unit 4 B卷' },
    { id: 'english-u4-b4-2', subject: 'english', unit: 4, type: 'choice', shuffle: true,
      prompt: '同学帮你把书放好：', options: ['Thank you.', "Who's on duty?"], answerText: 'Thank you.', source: '英语·Unit 4 B卷' },
    { id: 'english-u4-b4-3', subject: 'english', unit: 4, type: 'choice', shuffle: true,
      prompt: '黑板脏了：', options: ['Clean the blackboard.', 'Pack my schoolbag.'], answerText: 'Clean the blackboard.', source: '英语·Unit 4 B卷' },
    { id: 'english-u4-b4-4', subject: 'english', unit: 4, type: 'choice', shuffle: true,
      prompt: '书本散在桌上：', options: ['Put the books back.', 'Good evening.'], answerText: 'Put the books back.', source: '英语·Unit 4 B卷' },

    // ── 英语 · Unit 5 Lovely faces（B卷 五、情境选择）──
    { id: 'english-u5-b5-1', subject: 'english', unit: 5, type: 'choice', shuffle: true,
      prompt: '我看到两只眼睛：', options: ['I see two eyes.', 'I see two noses.'], answerText: 'I see two eyes.', source: '英语·Unit 5 B卷' },
    { id: 'english-u5-b5-2', subject: 'english', unit: 5, type: 'choice', shuffle: true,
      prompt: '请你画一张脸：', options: ['Draw a face.', 'Clean the floor.'], answerText: 'Draw a face.', source: '英语·Unit 5 B卷' },
    { id: 'english-u5-b5-3', subject: 'english', unit: 5, type: 'choice', shuffle: true,
      prompt: '我看到一只耳朵：', options: ['I see an ear.', 'I see a mouth.'], answerText: 'I see an ear.', source: '英语·Unit 5 B卷' },
    { id: 'english-u5-b5-4', subject: 'english', unit: 5, type: 'choice', shuffle: true,
      prompt: '夸这张脸真可爱：', options: ['A lovely face.', 'A schoolbag.'], answerText: 'A lovely face.', source: '英语·Unit 5 B卷' },

    // ── 英语 · Unit 6 My family（A卷 三、情境选择）──
    { id: 'english-u6-a3-1', subject: 'english', unit: 6, type: 'choice', shuffle: true,
      prompt: '指着妈妈介绍：', options: ['This is my mum.', 'This is my brother.'], answerText: 'This is my mum.', source: '英语·Unit 6 A卷' },
    { id: 'english-u6-a3-2', subject: 'english', unit: 6, type: 'choice', shuffle: true,
      prompt: '指着爸爸介绍：', options: ['This is my dad.', 'This is my sister.'], answerText: 'This is my dad.', source: '英语·Unit 6 A卷' },
    { id: 'english-u6-a3-3', subject: 'english', unit: 6, type: 'choice', shuffle: true,
      prompt: '告诉家人你爱他们：', options: ['I love my family.', 'Goodbye.'], answerText: 'I love my family.', source: '英语·Unit 6 A卷' },
    { id: 'english-u6-a3-4', subject: 'english', unit: 6, type: 'choice', shuffle: true,
      prompt: '指着照片里的自己：', options: ['This is me.', 'This is my mum.'], answerText: 'This is me.', source: '英语·Unit 6 A卷' },

    // ── 英语 · Unit 6（B卷 四、情境选择）──
    { id: 'english-u6-b4-1', subject: 'english', unit: 6, type: 'choice', shuffle: true,
      prompt: '介绍你的哥哥：', options: ['This is my brother.', 'This is my ruler.'], answerText: 'This is my brother.', source: '英语·Unit 6 B卷' },
    { id: 'english-u6-b4-2', subject: 'english', unit: 6, type: 'choice', shuffle: true,
      prompt: '对妈妈表达爱：', options: ['I love my mum.', 'Pack my schoolbag.'], answerText: 'I love my mum.', source: '英语·Unit 6 B卷' },
    { id: 'english-u6-b4-3', subject: 'english', unit: 6, type: 'choice', shuffle: true,
      prompt: '看着全家福介绍：', options: ['This is my family.', 'Clean the floor.'], answerText: 'This is my family.', source: '英语·Unit 6 B卷' },
    { id: 'english-u6-b4-4', subject: 'english', unit: 6, type: 'choice', shuffle: true,
      prompt: '介绍照片里的自己：', options: ['This is me.', 'This is my dad.'], answerText: 'This is me.', source: '英语·Unit 6 B卷' },
  ],
};
