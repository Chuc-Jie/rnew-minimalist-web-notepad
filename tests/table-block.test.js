// table-block.js 纯函数测试：Markdown 表格 ↔ 二维矩阵 的转换、规范化与裁剪
// 这些函数不依赖 Jspreadsheet 库，可在 jsdom 下直接测
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'table-block.js'), 'utf8');
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', { runScripts: 'outside-only' });
dom.window.eval(src);
const T = dom.window.NotepadTable;

let pass = 0, fail = 0;
function check(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; console.log('  ✓ ' + name); }
  else {
    fail++;
    console.log('  ✗ ' + name);
    console.log('    want: ' + JSON.stringify(want));
    console.log('    got : ' + JSON.stringify(got));
  }
}

console.log('\n── mdToMatrix（Markdown → 矩阵）──');
check('空单元格保留', T.mdToMatrix('| a |  | c |\n| --- | --- | --- |\n| 1 |  | 3 |'),
  [['a', '', 'c'], ['1', '', '3']]);
check('转义竖线还原', T.mdToMatrix('| a\\|b | c |')[0][0], 'a|b');
check('单元格内 <br> 还原为换行', T.mdToMatrix('| a<br>b |')[0][0], 'a\nb');
check('分隔行被跳过', T.mdToMatrix('| a |\n| --- |\n| 1 |').length, 2);
check('列数不足时补齐', T.mdToMatrix('| a |\n| --- | --- |\n| 1 | 2 |'), [['a', ''], ['1', '2']]);
check('空文本 → 空矩阵', T.mdToMatrix(''), []);

console.log('\n── matrixToMd（矩阵 → Markdown）──');
check('尾部空列不写出', T.matrixToMd([['a', 'b', ''], ['1', '2', '']]),
  '| a | b |\n| --- | --- |\n| 1 | 2 |');
check('只裁尾部空行，中间空行保留', T.matrixToMd([['a'], [''], ['1'], ['']]),
  '| a |\n| --- |\n|  |\n| 1 |');
check('换行写成 <br>', T.matrixToMd([['x'], ['a\nb']]),
  '| x |\n| --- |\n| a<br>b |');
check('竖线转义', T.matrixToMd([['x'], ['a|b']]),
  '| x |\n| --- |\n| a\\|b |');
check('空矩阵 → 空串', T.matrixToMd([]), '');
check('全空矩阵 → 空串', T.matrixToMd([['', ''], ['', '']]), '');

console.log('\n── 往返守恒（matrixToMd ∘ mdToMatrix）──');
[
  '| a | b |\n| --- | --- |\n| 1 | 2 |',
  '| a |  | c |\n| --- | --- | --- |\n| 1 |  | 3 |',
  '| a\\|b | c |\n| --- | --- |\n| x\\|y | z |',
  '| a<br>b | c |\n| --- | --- |\n| 1 | 2 |',
  '| 姓名 | 备注 |\n| --- | --- |\n| 张三 | 无 |',
].forEach(function (s) {
  check('往返守恒: ' + s.split('\n')[0], T.matrixToMd(T.mdToMatrix(s)), s);
});

console.log('\n── trimMatrix（只裁尾部）──');
check('裁掉尾部全空行', T.trimMatrix([['a'], ['1'], ['', '']]), [['a'], ['1']]);
check('裁掉尾部全空列', T.trimMatrix([['a', 'b', ''], ['1', '2', '']]), [['a', 'b'], ['1', '2']]);
check('保留中间的空单元格行', T.trimMatrix([['a', 'b'], ['', ''], ['1', '2']]),
  [['a', 'b'], ['', ''], ['1', '2']]);

console.log('\n── 粘贴识别（TSV / Markdown）──');
check('识别 TSV', T.looksLikeTabular('a\tb\nc\td'), true);
check('识别 Markdown 表格', T.looksLikeTabular('| a |\n| --- |\n| 1 |'), true);
check('单行不算表格', T.looksLikeTabular('普通文字'), false);
check('空串不算表格', T.looksLikeTabular(''), false);
check('TSV 解析为矩阵', T.parseTabular('a\tb\nc\td'), [['a', 'b'], ['c', 'd']]);
check('Markdown 解析为矩阵', T.parseTabular('| a | b |\n| --- | --- |\n| 1 | 2 |'),
  [['a', 'b'], ['1', '2']]);

console.log('\n────────────────────────────');
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
