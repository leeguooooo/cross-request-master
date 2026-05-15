/**
 * Tests for YApi document immersive mode helpers.
 */

const { isImmersiveDoc, tagSections } = require('../src/helpers/yapi-doc-immersive.js');

describe('isImmersiveDoc', () => {
  test('desc 以 <iframe srcdoc= 开头 → true', () => {
    expect(
      isImmersiveDoc({ desc: '<iframe srcdoc="x" sandbox="allow-same-origin"></iframe>' }),
    ).toBe(true);
  });

  test('desc 前面有空白也能识别', () => {
    expect(isImmersiveDoc({ desc: '   \n<iframe srcdoc="x"></iframe>' })).toBe(true);
  });

  test('desc 含 srcdoc = 空格变体也能识别', () => {
    expect(isImmersiveDoc({ desc: '<iframe srcdoc = "x"></iframe>' })).toBe(true);
  });

  test('markdown 以警告横幅开头 → true', () => {
    expect(
      isImmersiveDoc({
        markdown:
          '> ⚠️ 此文档由 HTML 源生成，请勿编辑\n\n```html\n<p>x</p>\n```',
      }),
    ).toBe(true);
  });

  test('markdown 多空格变体', () => {
    expect(isImmersiveDoc({ markdown: '>  ⚠️  此文档由  HTML  源生成 — 详情' })).toBe(true);
  });

  test('两者都不匹配 → false', () => {
    expect(isImmersiveDoc({ desc: '<div>hi</div>', markdown: '# H1\nbody' })).toBe(false);
  });

  test('data = null → false', () => {
    expect(isImmersiveDoc(null)).toBe(false);
  });

  test('data = {} → false', () => {
    expect(isImmersiveDoc({})).toBe(false);
  });

  test('desc 非字符串（number）→ false 不抛错', () => {
    expect(isImmersiveDoc({ desc: 123 })).toBe(false);
  });

  test('desc / markdown 是 null（YApi 偶尔返回 null）→ false', () => {
    expect(isImmersiveDoc({ desc: null, markdown: null })).toBe(false);
  });
});

function makeDom(html) {
  // Jest 跑在 jsdom 环境（package.json: jest.testEnvironment = "jsdom"），
  // 这里用全局 document.implementation 造一个独立文档，避免污染主测试 document。
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    'text/html',
  );
  return doc;
}

describe('tagSections', () => {
  test('平级兄弟：h2 + 内容兄弟节点都被打标', () => {
    const doc = makeDom(`
      <div>
        <h2 class="interface-title">基本信息</h2>
        <div id="basic-fields">fields</div>
        <p id="basic-extra">extra</p>
        <h2 class="interface-title">请求参数</h2>
        <div id="req-body">req</div>
        <h2 class="interface-title">备注</h2>
        <div id="notes-body">notes</div>
      </div>
    `);
    tagSections(doc);
    expect(doc.querySelector('h2.interface-title[data-crm-section="basic"]')).toBeTruthy();
    expect(doc.getElementById('basic-fields').dataset.crmSection).toBe('basic');
    expect(doc.getElementById('basic-extra').dataset.crmSection).toBe('basic');
    expect(doc.getElementById('req-body').dataset.crmSection).toBe('req');
    expect(doc.getElementById('notes-body').dataset.crmSection).toBe('notes');
  });

  test('嵌套：每个 section 容器只含一个 h2 → section 自身被打标', () => {
    const doc = makeDom(`
      <section id="s-basic">
        <h2 class="interface-title">基本信息</h2>
        <div>fields</div>
      </section>
      <section id="s-req">
        <h2 class="interface-title">请求参数</h2>
        <div>req</div>
      </section>
    `);
    tagSections(doc);
    expect(doc.getElementById('s-basic').dataset.crmSection).toBe('basic');
    expect(doc.getElementById('s-req').dataset.crmSection).toBe('req');
  });

  test('深层嵌套：多层只含本 h2 的祖先都被打标', () => {
    const doc = makeDom(`
      <div id="outer">
        <div id="middle">
          <h2 class="interface-title">基本信息</h2>
          <p>x</p>
        </div>
      </div>
    `);
    tagSections(doc);
    expect(doc.getElementById('middle').dataset.crmSection).toBe('basic');
    expect(doc.getElementById('outer').dataset.crmSection).toBe('basic');
  });

  test('祖先含多个 h2 时停止向上打标', () => {
    const doc = makeDom(`
      <div id="all-in-one">
        <h2 class="interface-title">基本信息</h2>
        <h2 class="interface-title">请求参数</h2>
      </div>
    `);
    tagSections(doc);
    expect(doc.getElementById('all-in-one').dataset.crmSection).toBeUndefined();
    const h2s = doc.querySelectorAll('h2.interface-title');
    expect(h2s[0].dataset.crmSection).toBe('basic');
    expect(h2s[1].dataset.crmSection).toBe('req');
  });

  test('h2 文本不在 SECTION_LABELS：不打标', () => {
    const doc = makeDom(`<h2 class="interface-title">示例代码</h2><div>x</div>`);
    tagSections(doc);
    expect(doc.querySelector('h2').dataset.crmSection).toBeUndefined();
  });

  test('幂等：同一 DOM 跑两次结果一样', () => {
    const doc = makeDom(`
      <h2 class="interface-title">基本信息</h2><div id="x">fields</div>
      <h2 class="interface-title">备注</h2><div>notes</div>
    `);
    tagSections(doc);
    const first = doc.getElementById('x').dataset.crmSection;
    tagSections(doc);
    const second = doc.getElementById('x').dataset.crmSection;
    expect(first).toBe('basic');
    expect(second).toBe('basic');
  });

  test('已打标但 h2 文本变化：旧标记被清理', () => {
    const doc = makeDom(`<h2 class="interface-title">基本信息</h2>`);
    tagSections(doc);
    expect(doc.querySelector('h2').dataset.crmSection).toBe('basic');
    doc.querySelector('h2').textContent = '示例代码';
    tagSections(doc);
    expect(doc.querySelector('h2').dataset.crmSection).toBeUndefined();
  });

  test('"备注" 被打标但 CSS 不会隐藏（CSS 选择器只针对 basic/req/res）', () => {
    const doc = makeDom(`<h2 class="interface-title">备注</h2><div id="n">notes</div>`);
    tagSections(doc);
    expect(doc.getElementById('n').dataset.crmSection).toBe('notes');
  });
});
