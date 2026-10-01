Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index', text: '今日', icon: '☀️' },
      { pagePath: '/pages/calendar/calendar', text: '日历', icon: '📅' },
      { pagePath: '/pages/growth/growth', text: '成长', icon: '🌱' },
      { pagePath: '/pages/profile/profile', text: '我的', icon: '🙂' },
    ],
  },
  methods: {
    onTap(e) {
      const index = e.currentTarget.dataset.index;
      wx.switchTab({ url: this.data.list[index].pagePath });
    },
  },
});
