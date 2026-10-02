const store = require('../../utils/store');
const T = require('../../utils/tasks');
const D = require('../../utils/date');
const CTX = require('../../utils/context');
const cloud = require('../../utils/cloud');

const EMOJIS = ['⭐', '🎹', '🎨', '🧩', '📖', '✍️', '🧮', '🎧', '🪢', '⚽', '🌞', '🎲', '🧹', '🌙', '🐄', '🥕'];

Page({
  data: {
    dateLabel: '',
    gradeLabel: '',
    groups: [],
    editingId: '',
    editValue: 0,
    editStep: 5,
    customs: [],
    // 新增自定义任务表单
    formOpen: false,
    formName: '',
    formEmoji: '⭐',
    formSection: 'fun',
    formType: 'duration',
    formTarget: 20,
    emojis: EMOJIS,
    sections: [],
    types: [
      { key: 'duration', name: '时长（分钟）' },
      { key: 'count', name: '计数' },
      { key: 'done', name: '完成即可' },
    ],
  },

  onLoad() {
    // 用 scope() 而非 profile：家长模式下 profile.grade 为 0，需取孩子缓存的年级
    this.grade = CTX.scope().grade;
    this.setData({
      gradeLabel: this.grade + ' 年级 · 上海',
      sections: T.SECTION_ORDER.map(k => ({ key: k, name: T.SECTIONS[k].name, color: T.SECTIONS[k].color })),
    });
    this.refresh();
  },

  refresh() {
    const today = D.todayStr();
    const overrides = store.getTaskOverrides();
    const tasks = T.generateDailyTasks(this.grade, today);
    const groups = T.SECTION_ORDER.map(key => {
      const meta = T.SECTIONS[key];
      const ts = tasks.filter(t => t.section === key);
      return {
        key, color: meta.color, bg: meta.bg, name: meta.name,
        tasks: ts.map(t => ({
          id: t.id, name: t.name, emoji: t.emoji, must: t.must,
          type: t.type, unit: t.unit, target: t.target, targetLabel: t.targetLabel,
          customized: !!t.customized, custom: !!t.custom,
        })),
      };
    }).filter(g => g.tasks.length > 0);
    this.setData({
      dateLabel: D.dateLabel(today),
      groups,
      customs: overrides.customs || [],
    });
  },

  // ── 调整内置任务目标 ──
  onEdit(e) {
    const id = e.currentTarget.dataset.id;
    const task = this._findTask(id);
    if (!task || task.type === 'done') {
      wx.showToast({ title: '该任务完成即可，无需调整', icon: 'none' });
      return;
    }
    this.setData({
      editingId: id,
      editValue: task.target,
      editStep: task.type === 'duration' ? 5 : (task.target >= 50 ? 10 : 1),
    });
  },

  _findTask(id) {
    for (const g of this.data.groups) {
      const t = g.tasks.find(x => x.id === id);
      if (t) return t;
    }
    return null;
  },

  onEditMinus() {
    this.setData({ editValue: Math.max(this.data.editStep, this.data.editValue - this.data.editStep) });
  },

  onEditPlus() {
    this.setData({ editValue: Math.min(999, this.data.editValue + this.data.editStep) });
  },

  onEditSave() {
    const { editingId, editValue } = this.data;
    if (!editingId || !editValue || editValue <= 0) return;
    const o = store.getTaskOverrides();
    o.targets = o.targets || {};
    o.targets[editingId] = editValue;
    store.saveTaskOverrides(o);
    cloud.syncAll(); // 覆盖上云，孩子端下次同步生效（静默失败下次再试）
    this.setData({ editingId: '' });
    this.refresh();
    wx.showToast({ title: '已保存 ✓', icon: 'none' });
  },

  onEditReset() {
    const { editingId } = this.data;
    if (!editingId) return;
    const o = store.getTaskOverrides();
    if (o.targets) delete o.targets[editingId];
    store.saveTaskOverrides(o);
    cloud.syncAll();
    this.setData({ editingId: '' });
    this.refresh();
    wx.showToast({ title: '已恢复默认', icon: 'none' });
  },

  // ── 自定义任务 ──
  onToggleForm() { this.setData({ formOpen: !this.data.formOpen }); },
  onFormName(e) { this.setData({ formName: e.detail.value }); },
  onFormEmoji(e) { this.setData({ formEmoji: e.currentTarget.dataset.emoji }); },
  onFormSection(e) { this.setData({ formSection: e.currentTarget.dataset.key }); },
  onFormType(e) {
    const type = e.currentTarget.dataset.key;
    this.setData({ formType: type, formTarget: type === 'done' ? 1 : this.data.formTarget });
  },
  onFormTargetInput(e) { this.setData({ formTarget: Number(e.detail.value) || 0 }); },
  onFormTargetMinus() { this.setData({ formTarget: Math.max(1, this.data.formTarget - 5) }); },
  onFormTargetPlus() { this.setData({ formTarget: Math.min(999, this.data.formTarget + 5) }); },

  onFormSubmit() {
    const { formName, formEmoji, formSection, formType, formTarget, customs } = this.data;
    if (!formName) {
      wx.showToast({ title: '先给任务起个名字', icon: 'none' });
      return;
    }
    if (formType !== 'done' && (!formTarget || formTarget <= 0)) {
      wx.showToast({ title: '目标值要大于 0', icon: 'none' });
      return;
    }
    const o = store.getTaskOverrides();
    o.customs = o.customs || [];
    o.customs.push({
      id: 'custom_' + Date.now().toString(36),
      section: formSection,
      name: formName,
      emoji: formEmoji,
      type: formType,
      unit: formType === 'duration' ? '分钟' : formType === 'count' ? '个' : '',
      target: formType === 'done' ? 1 : formTarget,
      desc: '自定义任务',
    });
    store.saveTaskOverrides(o);
    cloud.syncAll();
    this.setData({ formOpen: false, formName: '', formTarget: 20 });
    this.refresh();
    wx.showToast({ title: '已添加，明天开始生效 ✓', icon: 'none' });
  },

  onDelCustom(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.customs.find(c => c.id === id);
    wx.showModal({
      title: '删除自定义任务',
      content: '「' + (item ? item.name : '') + '」将从每日清单移除（历史打卡记录保留）。确定删除吗？',
      confirmColor: '#FF5A3C',
      success: res => {
        if (!res.confirm) return;
        const o = store.getTaskOverrides();
        o.customs = (o.customs || []).filter(c => c.id !== id);
        store.saveTaskOverrides(o);
        cloud.syncAll();
        this.refresh();
      },
    });
  },
});
