/**
 * Tests for YApi menu virtual grouping helpers.
 */

const {
  extractMonth,
  groupByMonth,
  pickDefaultExpandedMonth,
  deriveCatKey,
  buildHeaderLi,
  GROUPING_MIN_INTERFACES,
} = require('../src/helpers/yapi-menu-grouping.js');

describe('extractMonth', () => {
  test('[YYYY-MM-DD] 前缀', () => {
    expect(extractMonth('[2026-04-21] AI Girls')).toBe('2026-04');
  });
  test('· YYYY-MM-DD · 中点格式', () => {
    expect(extractMonth('客户问题反馈 · 2026-05-13 · 复盘')).toBe('2026-05');
  });
  test('单位数月份 (2026-3) 不匹配（要求 0-pad）', () => {
    expect(extractMonth('[2026-3-1] x')).toBe(null);
  });
  test('版本号点分隔不匹配', () => {
    expect(extractMonth('v2026.04 release')).toBe(null);
  });
  test('未来日期 (2099-12)', () => {
    expect(extractMonth('2099-12-31')).toBe('2099-12');
  });
  test('年份下界 1999 不匹配', () => {
    expect(extractMonth('1999-01-01')).toBe(null);
  });
  test('年份上界 3000 不匹配', () => {
    expect(extractMonth('3000-01-01')).toBe(null);
  });
  test('月份越界 (2026-13) 不匹配', () => {
    expect(extractMonth('2026-13-01')).toBe(null);
  });
  test('空 / null / undefined → null', () => {
    expect(extractMonth('')).toBe(null);
    expect(extractMonth(null)).toBe(null);
    expect(extractMonth(undefined)).toBe(null);
  });
  test('无日期标题 → null', () => {
    expect(extractMonth('AI Girls YApi 知识库总册')).toBe(null);
  });
});

describe('groupByMonth', () => {
  test('空数组 → []', () => {
    expect(groupByMonth([])).toEqual([]);
  });
  test('单月份单条', () => {
    const r = groupByMonth([{ title: '[2026-04-21] x' }]);
    expect(r).toEqual([{ month: '2026-04', items: [{ title: '[2026-04-21] x' }] }]);
  });
  test('多月混合按 desc 排序，null 最后', () => {
    const items = [
      { title: '[2026-03-31] a' },
      { title: '[2026-04-21] b' },
      { title: 'no date' },
      { title: '· 2026-05-13 · c' },
      { title: '[2026-04-14] d' },
    ];
    const r = groupByMonth(items);
    expect(r.map((g) => g.month)).toEqual(['2026-05', '2026-04', '2026-03', null]);
    expect(r.find((g) => g.month === '2026-04').items).toHaveLength(2);
  });
  test('全 null', () => {
    const r = groupByMonth([{ title: 'a' }, { title: 'b' }]);
    expect(r).toEqual([{ month: null, items: [{ title: 'a' }, { title: 'b' }] }]);
  });
});

describe('pickDefaultExpandedMonth', () => {
  test('空数组 → null', () => {
    expect(pickDefaultExpandedMonth([])).toBe(null);
  });
  test('只有 null 组 → null', () => {
    expect(pickDefaultExpandedMonth([{ month: null, items: [{}] }])).toBe(null);
  });
  test('多月返回最新（第一个 month 非 null）', () => {
    const r = pickDefaultExpandedMonth([
      { month: '2026-05', items: [] },
      { month: '2026-04', items: [] },
      { month: null, items: [] },
    ]);
    expect(r).toBe('2026-05');
  });
});

describe('deriveCatKey', () => {
  function makeCatLi(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.firstElementChild;
  }

  test('优先使用 data-cat-id', () => {
    const li = makeCatLi('<li data-cat-id="42"><div class="ant-tree-title">文档</div></li>');
    expect(deriveCatKey(li)).toBe('42');
  });
  test('退化用 .ant-tree-title textContent', () => {
    const li = makeCatLi('<li><div class="ant-tree-title">文档</div></li>');
    expect(deriveCatKey(li)).toBe('文档');
  });
  test('剥离尾部 (N) 计数', () => {
    const li = makeCatLi('<li><div class="ant-tree-title">文档 (28)</div></li>');
    expect(deriveCatKey(li)).toBe('文档');
  });
  test('剥离尾部全角（N）计数', () => {
    const li = makeCatLi('<li><div class="ant-tree-title">文档（28）</div></li>');
    expect(deriveCatKey(li)).toBe('文档');
  });
  test('剥离尾部 N 项', () => {
    const li = makeCatLi('<li><div class="ant-tree-title">文档 28 项</div></li>');
    expect(deriveCatKey(li)).toBe('文档');
  });
  test('空 li → 空 string', () => {
    expect(deriveCatKey(null)).toBe('');
  });
});

describe('buildHeaderLi', () => {
  test('生成的 li 含所有必要 data 属性 + 三个 span', () => {
    const li = buildHeaderLi('2026-04', 3, '383:文档', false);
    expect(li.tagName).toBe('LI');
    expect(li.classList.contains('crm-month-header')).toBe(true);
    expect(li.dataset.crmCatKey).toBe('383:文档');
    expect(li.dataset.crmMonth).toBe('2026-04');
    expect(li.dataset.crmCollapsed).toBe('false');
    expect(li.querySelector('.crm-month-toggle')).toBeTruthy();
    expect(li.querySelector('.crm-month-label').textContent).toBe('2026-04');
    expect(li.querySelector('.crm-month-count').textContent).toBe('3');
  });
  test('collapsed=true 时 data-crm-collapsed=true', () => {
    const li = buildHeaderLi('2026-04', 1, 'x', true);
    expect(li.dataset.crmCollapsed).toBe('true');
  });
});

describe('GROUPING_MIN_INTERFACES', () => {
  test('门槛是 5', () => {
    expect(GROUPING_MIN_INTERFACES).toBe(5);
  });
});
