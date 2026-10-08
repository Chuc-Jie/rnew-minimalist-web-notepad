// 表格功能往返测试：验证 内容 -> DOM -> 内容 不丢信息
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const appSrc = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');

function boot(initial) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div class="stack">
      <div id="content" contenteditable="true" spellcheck="false" autofocus></div>
      <div class="flag"><button id="btn-table"></button></div>
    </div>
    <div id="printable"></div>
    <div id="status-bar"><span id="status-indicator"></span><span id="status-text"></span></div>
    <div id="ctx-menu"></div>
  </body></html>`, { runScripts: 'outside-only', url: 'http://localhost:3000/abcde' });
  const w = dom.window;
  w.initialContent = initial;
  w.fetch = () => Promise.resolve({ ok: true, status: 200 });
  w.navigator.sendBeacon = () => true;
  w.document.execCommand = () => false;
  w.eval(appSrc);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return w;
}

let pass = 0, fail = 0;
function check(name, got, want) {
  if (got === want) { pass++; console.log('  ✓ ' + name); }
  else {
    fail++;
    console.log('  ✗ ' + name);
    console.log('    want: ' + JSON.stringify(want));
    console.log('    got : ' + JSON.stringify(got));
  }
}

// 往返：文本 -> DOM -> 文本，期望原样回来
function rt(name, text) {
  const w = boot(text);
  check(name, w.__notepad.getContent(), text.replace(/^\n+|\n+$/g, ''));
}

const H = '| --- | --- |';
const cases = {
  '纯文本': 'hello world',
  '多行文本': 'line1\nline2\nline3',
  '文本+空行': 'a\n\nb',
  '连续多个空行': 'a\n\n\n\n\nb',
  '表格-基础': '| a | b |\n' + '| --- | --- |\n' + '| 1 | 2 |',
  '表格-含空单元格': '| a |  | c |\n| --- | --- | --- |\n| 1 |  | 3 |',
  '表格-整行全空': '| a | b |\n| --- | --- |\n|  |  |',
  '表格-含转义竖线': '| a\\|b | c |\n| --- | --- |\n| x\\|y | z |',
  '表格-单元格内换行': '| a<br>b | c |\n| --- | --- |\n| 1 | 2 |',
  '文本+表格+文本': 'before\n| a | b |\n| --- | --- |\n| 1 | 2 |\nafter',
  '表格在开头': '| a | b |\n| --- | --- |\n| 1 | 2 |\ntail',
  '表格在结尾': 'head\n| a | b |\n| --- | --- |\n| 1 | 2 |',
  '两个表格': '| a |\n| --- |\n| 1 |\nmid\n| b |\n| --- |\n| 2 |',
  '表格-中文': '| 姓名 | 备注 |\n| --- | --- |\n| 张三 | 无 |',
  '空内容': '',
  '只有换行': '\n\n',
  '行内 Markdown 不解析': '# 标题\n**粗体** 文字',
  '表格-末尾空行': '| a |\n| --- |\n| 1 |\n\n',
};

console.log('\n── 往返守恒（文本 -> DOM -> 文本）──');
for (const [name, text] of Object.entries(cases)) rt(name, text);

console.log('\n── 规范化（输入被补全，属预期行为）──');
for (const [name, src, want] of [
  ['无分隔行自动补', '| a | b |\n| 1 | 2 |', '| a | b |\n| --- | --- |\n| 1 | 2 |'],
  ['单行表格补分隔行', '| a | b |', '| a | b |\n| --- | --- |'],
  ['列数不齐补齐', '| a |\n| --- | --- |\n| 1 | 2 | 3 |', '| a |  |  |\n| --- | --- | --- |\n| 1 | 2 | 3 |'],
]) {
  const w = boot(src);
  check(name, w.__notepad.getContent(), want);
}

console.log('\n── 幂等：重复往返不再变化 ──');
for (const [name, text] of Object.entries(cases)) {
  const w = boot(text);
  w.__notepad.setContent(text);
  const once = w.__notepad.getContent();
  const w2 = boot(once);
  w2.__notepad.setContent(once);
  check('幂等 ' + name, w2.__notepad.getContent(), once);
}

console.log('\n── 已知历史 bug 的回归 ──');
{
  // 1. 空单元格不能丢（旧实现 filter 掉空格子导致列数错乱）
  const w = boot('| a |  | c |\n| --- | --- | --- |\n| 1 |  | 3 |');
  w.__notepad.setContent('| a |  | c |\n| --- | --- | --- |\n| 1 |  | 3 |');
  const t = w.document.querySelector('#content table');
  check('空单元格渲染成 3 列', t.rows[0].cells.length, 3);
  check('空单元格渲染成 2 行', t.rows.length, 2);

  // 2. 单元格里的 | 要转义，不能撑开列数
  const w2 = boot('');
  w2.__notepad.setContent('| a\\|b | c |\n| --- | --- |\n| 1 | 2 |');
  const t2 = w2.document.querySelector('#content table');
  check('转义竖线不撑开列数', t2.rows[0].cells.length, 2);
  check('转义竖线还原为字面量', t2.rows[0].cells[0].textContent, 'a|b');

  // 3. 脏 DOM（span/b，浏览器粘贴、Ctrl+B 会产出）内容不能丢
  // 3. 脏 DOM：浏览器粘贴 / Ctrl+B 会产出 span、b、font 等标签，内容不能丢
  const w3 = boot('');
  const c3 = w3.document.getElementById('content');
  c3.innerHTML = '<div>hello <b>world</b> <span style="color:red">red</span></div><div>plain</div>';
  check('脏 DOM 内容不丢失', w3.__notepad.getContent(), 'hello world red\nplain');

  // 4. 分隔行不参与渲染
  const w4 = boot('');
  w4.__notepad.setContent('| a |\n| --- |\n| --- |\n| 1 |');
  check('多余分隔行被跳过', w4.__notepad.getContent(), '| a |\n| --- |\n| 1 |');

  // 5. printable 里要有真表格
  const w5 = boot('| a | b |\n| --- | --- |\n| 1 | 2 |');
  w5.__notepad.setContent('| a | b |\n| --- | --- |\n| 1 | 2 |');
  check('打印视图渲染出表格', w5.document.querySelectorAll('#printable table').length, 1);
}

console.log('\n────────────────────────────');
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
