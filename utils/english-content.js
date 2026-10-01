// 英语跟读内容库（与试卷知识库 content/exams/data/english-g1s1-u1.json 同源）
// 教材：沪教版（五四制）2024新教材 · Unit 1 Greetings
// 后续单元在 units 数组追加即可，页面按年级自动匹配（暂只有一上内容，各年级先共用）
module.exports = {
  textbook: '沪教版（五四制）2024新教材',
  units: [
    {
      id: 'english-g1s1-u1',
      unit: 1,
      grade: 1,
      semester: '上',
      title: 'Unit 1 Greetings',
      sentences: [
        { id: 'u1-s1', text: 'Hello! / Hi!', tip: '打招呼：你好！' },
        { id: 'u1-s2', text: 'Good morning.', tip: '早晨问好' },
        { id: 'u1-s3', text: 'Good afternoon.', tip: '下午问好' },
        { id: 'u1-s4', text: 'Good evening.', tip: '晚上问好' },
        { id: 'u1-s5', text: 'How are you?', tip: '问候近况' },
        { id: 'u1-s6', text: "I'm fine. Thank you.", tip: '应答：我很好，谢谢' },
        { id: 'u1-s7', text: 'Goodbye.', tip: '告别' },
      ],
      scenes: [
        { id: 'u1-sc1', when: '早晨到校见到老师', say: 'Good morning!' },
        { id: 'u1-sc2', when: '下午见到同学', say: 'Good afternoon!' },
        { id: 'u1-sc3', when: '晚上见到家人', say: 'Good evening!' },
        { id: 'u1-sc4', when: '放学和老师告别', say: 'Goodbye!' },
      ],
    },
  ],
};
