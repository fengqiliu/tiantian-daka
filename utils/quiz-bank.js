// 每周一卷题库：从试卷知识库（content/exams/data/*.json）转录适合 App 内作答的题目
// —— 判断、选择、比大小；连线/圈画/书写/听力类不上屏。
// source 字段保留原卷出处，便于对照纸质卷讲评。
// type: 'choice'（options + answerText；shuffle:true 表示每次作答打乱选项顺序）
//       'judge'（判断题，统一渲染为 √/× 两选项）
module.exports = {
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
  ],
};
