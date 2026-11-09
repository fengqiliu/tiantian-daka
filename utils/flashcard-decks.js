// 记忆卡牌组数据（纯数据，无依赖；客户端与 family 云函数共用，云端用它校验布置的牌组）
// ⚠️ 云函数副本 cloudfunctions/family/lib/flashcard-decks.js 由 scripts/sync-cloud-libs.js 复制，勿直接改
// 卡片内容取自试卷知识库答案页实际考到的字/词（content/exams/data/*.json），数学卡由算式生成。

// ── 语文生字牌库（组词为教材常用义）──
const CN_U1 = ['天:白天', '地:土地', '你:你好', '我:我们', '他:他们', '口:口水', '耳:耳朵', '目:目光', '手:小手', '足:手足', '上:上面', '下:下面', '日:日子', '月:月亮', '水:喝水', '火:火苗', '山:大山', '田:田地', '禾:禾苗', '站:站立', '坐:坐下', '一:一个', '三:三个', '六:六个', '八:八个', '十:十个'];
const CN_U5 = ['人:大人', '大:大小', '可:可以', '东:东西', '西:西瓜', '是:不是', '四:四个', '秋:秋天', '莲:莲叶', '竹:竹子', '冬:冬天', '条:一条', '片:一片', '群:一群', '只:一只'];
const CN_U6 = ['云:白云', '虫:虫子', '书:书本', '尺:尺子', '中:中间', '森:森林', '林:树林', '明:明天', '从:从前', '尘:灰尘', '立:立正', '旗:国旗'];
const CN_U7 = ['儿:儿子', '里:里面', '左:左边', '右:右边', '见:看见', '贝:宝贝', '在:正在', '才:刚才', '弯:弯弯', '影:影子', '事:事情'];
const CN_U8 = ['比:比一比', '巴:尾巴', '石:石头', '出:出来', '回:回去', '半:一半', '多:多少', '短:长短', '少:多少', '进:进来', '低:低头', '友:朋友', '有:没有'];

// ── 语文拼音牌库（第 2-4 单元，音节 → 汉字；全部取自试卷答案页的「拼音和汉字手拉手」「看图选音节」等题）──
const PY_U2 = ['bā:八', 'tǔ:土', 'mù:木', 'nǐ:你', 'tā:他', 'dì:地'];
const PY_U3 = ['shí:十', 'rì:日', 'qī:七', 'xià:下', 'tǔ:土', 'mù:木'];
const PY_U4 = ['bái yún:白云', 'qì qiú:气球', 'yuè liang:月亮', 'míng liàng:明亮', 'mào zi:帽子', 'tài yáng:太阳', 'cǎi hóng:彩虹', 'mèi mei:妹妹'];

// ── 英语单词牌库（back = 教材中文义）──
const EN_U2 = ['friend:朋友', 'name:姓名', 'welcome:欢迎', 'China:中国'];
const EN_U3 = ['schoolbag:书包', 'pencil:铅笔', 'ruler:尺子', 'book:书', 'eraser:橡皮', 'pencil case:铅笔盒'];
const EN_U4 = ['desk:课桌', 'chair:椅子', 'door:门', 'blackboard:黑板', 'floor:地面', 'classroom:教室'];
const EN_U5 = ['eye:眼睛', 'ear:耳朵', 'nose:鼻子', 'mouth:嘴巴', 'face:脸'];
const EN_U6 = ['mum:妈妈', 'dad:爸爸', 'sister:姐妹', 'brother:兄弟', 'family:家庭'];

// ── 数学牌库（由算式生成，答案不会写错）──
// 凑十搭档：对应第三、四单元"10 的分与合"，也是第六单元凑十法的基础
const MA_TEN = Array.from({ length: 9 }, (_, i) => (i + 1) + ' 和几凑成 10？:' + (10 - (i + 1)));
// 20 以内数的组成：对应第五单元"1 个十和几个一"
const MA_U5 = Array.from({ length: 9 }, (_, i) => '1 个十和 ' + (i + 1) + ' 个一是几？:' + (11 + i)).concat(['2 个十是几？:20']);

function toCards(pairs) {
  return pairs.map(pair => {
    const i = pair.indexOf(':');
    return { front: pair.slice(0, i), back: pair.slice(i + 1) };
  });
}

const DECKS = [
  { id: 'cn-u1', subject: 'chinese', unit: 1, name: '语文 · 第 1 单元生字', cards: toCards(CN_U1) },
  { id: 'cn-u2', subject: 'chinese', unit: 2, kind: 'pinyin', name: '语文 · 第 2 单元拼音', cards: toCards(PY_U2) },
  { id: 'cn-u3', subject: 'chinese', unit: 3, kind: 'pinyin', name: '语文 · 第 3 单元拼音', cards: toCards(PY_U3) },
  { id: 'cn-u4', subject: 'chinese', unit: 4, kind: 'pinyin', name: '语文 · 第 4 单元拼音', cards: toCards(PY_U4) },
  { id: 'cn-u5', subject: 'chinese', unit: 5, name: '语文 · 第 5 单元生字', cards: toCards(CN_U5) },
  { id: 'cn-u6', subject: 'chinese', unit: 6, name: '语文 · 第 6 单元生字', cards: toCards(CN_U6) },
  { id: 'cn-u7', subject: 'chinese', unit: 7, name: '语文 · 第 7 单元生字', cards: toCards(CN_U7) },
  { id: 'cn-u8', subject: 'chinese', unit: 8, name: '语文 · 第 8 单元生字', cards: toCards(CN_U8) },
  { id: 'en-u2', subject: 'english', unit: 2, name: '英语 · U2 新朋友', cards: toCards(EN_U2) },
  { id: 'en-u3', subject: 'english', unit: 3, name: '英语 · U3 我的书包', cards: toCards(EN_U3) },
  { id: 'en-u4', subject: 'english', unit: 4, name: '英语 · U4 我的教室', cards: toCards(EN_U4) },
  { id: 'en-u5', subject: 'english', unit: 5, name: '英语 · U5 可爱的脸', cards: toCards(EN_U5) },
  { id: 'en-u6', subject: 'english', unit: 6, name: '英语 · U6 我的家庭', cards: toCards(EN_U6) },
  { id: 'ma-ten', subject: 'math', unit: 3, name: '数学 · 凑十搭档', cards: toCards(MA_TEN) },
  { id: 'ma-u5', subject: 'math', unit: 5, name: '数学 · 20 以内数的组成', cards: toCards(MA_U5) },
];

function getDeck(id) { return DECKS.find(d => d.id === id) || null; }

module.exports = { DECKS, getDeck };
