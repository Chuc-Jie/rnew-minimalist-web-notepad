// 交互冒烟测试：模拟用户点按钮插表格、Tab 跳格、右键增删行列、自动保存
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const appSrc = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');

function boot(initial) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div class="stack">
      <div id="content" contenteditable="true"></div>
      <div class="flag"><button id="btn-table"></button></div>
    </div>
    <div id="printable"></div>
    <div id="status-bar"><span id="status-indicator"></span><span id="status-text"></span></div>
    <div id="ctx-menu"></div>
  </body></html>`, { runScripts: 'outside-only', url: 'http://localhost:3000/abcde' });
  const w = dom.window;
  w.initialContent = initial || '';
  const saved = [];
  w.fetch = (url, opt) => {
    saved.push(opt && opt.body ? String(opt.body) : '');
    return Promise.resolve({ ok: true, status: 200 });
  };
  w.navigator.sendBeacon = () => true;
  w.document.execCommand = () => false;
  w.eval(appSrc);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w: w, saved: saved, doc: w.document };
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

console.log('\n── 交互冒烟 ──');

// 1. 点「＋表格」按钮 -> 弹对话框 -> 确认插入 3x3
{
  const { w, doc } = boot('');
  const err = [];
  w.addEventListener('error', e => err.push(e.message));
  doc.getElementById('btn-table').click();
  check('点击按钮弹出对话框', !!doc.getElementById('dialog-overlay'), true);
  doc.getElementById('d-ok').click();
  const t = doc.querySelector('#content table');
  check('插入 3x3 表格（2 行：表头 + 1 数据行）', t ? t.rows.length : 0, 3);
  check('列数为 3', t ? t.rows[0].cells.length : 0, 3);
  check('首行是表头 th', t ? t.rows[0].cells[0].tagName : '', 'TH');
  check('对话框已关闭', !!doc.getElementById('dialog-overlay'), false);
  const md = w.__notepad.getContent();
  check('保存内容为 Markdown 表格', /^\|.*\|\n\| --- \|/.test(md), true);
  check('无运行时异常', err.length, 0);
}

// 2. 表格内 Tab 跳格
{
  const { w, doc } = boot('| a | b |\n| --- | --- |\n| 1 | 2 |');
  const cells = doc.querySelectorAll('#content td, #content th');
  const c0 = cells[0], c1 = cells[1];
  c0.focus();
  const ev = new w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  c0.dispatchEvent(ev);
  check('表格内 Tab 被拦截（不插入制表符）', ev.defaultPrevented, true);
  const ev2 = new w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  doc.getElementById('content').dispatchEvent(ev2);
  check('表格外 Tab 拦截并插入制表符', ev2.defaultPrevented, true);
}

// 3. 右键菜单：表格内的行列增删自 v2 起交给表格库（Jspreadsheet 自带菜单），
//    我们的自研菜单不再介入，只保留「插入表格」
{
  const { w, doc } = boot('| a | b |\n| --- | --- |\n| 1 | 2 |');
  const cell = doc.querySelectorAll('#content td, #content th')[0];
  cell.dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  const menu = doc.getElementById('ctx-menu');
  const labels = Array.from(menu.querySelectorAll('button'))
    .filter(b => b.style.display !== 'none').map(b => b.textContent);
  check('自研的行列操作已从菜单移除', labels.some(t => /插入行|删除表格|删除当前列|表头/.test(t)), false);
  check('菜单可见', menu.style.display !== 'none', true);
}

// 4. 表格外右键只显示插入表格
{
  const { w, doc } = boot('plain text');
  doc.getElementById('content').dispatchEvent(
    new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true })
  );
  const labels = Array.from(doc.querySelectorAll('#ctx-menu button'))
    .filter(b => b.style.display !== 'none').map(b => b.textContent);
  check('表格外右键只显示「插入表格」', labels.length === 1 && /表格/.test(labels[0]), true);
}

// 5. 自动保存：编辑后 1.2s 内应发起一次 POST，且内容与编辑器一致
{
  const { w, doc, saved } = boot('| a |\n| --- |\n| 1 |');
  doc.getElementById('content').dispatchEvent(new w.Event('input', { bubbles: true }));
  check('未编辑时轮询不上传', saved.length, 0);
  setTimeout(() => {
    // markDirty 由 input 触发，这里手动改内容再触发 input
    const cell = doc.querySelectorAll('#content td, #content th')[1];
    cell.textContent = '42';
    doc.getElementById('content').dispatchEvent(new w.Event('input', { bubbles: true }));
    setTimeout(() => {
      check('编辑后自动保存一次', saved.length >= 1, true);
      if (saved.length) {
        const body = decodeURIComponent(saved[0]);
        check('保存正文含修改后的值', /42/.test(body), true);
      }
      console.log('\n────────────────────────────');
      console.log(`通过 ${pass} 项，失败 ${fail} 项`);
      process.exit(fail ? 1 : 0);
    }, 1400);
  }, 1200);
}
