// 모델이 전체 코드를 다시 쓰는 대신 "바뀐 부분만" 보내도록 하는 편집 블록 처리.
//
// <<<<<<< SEARCH
// (현재 코드에 있는 줄)
// =======
// (바꾼 뒤의 줄)
// >>>>>>> REPLACE

export const SEARCH_MARK = '<<<<<<< SEARCH';

const BLOCK_RE = /<<<<<<< SEARCH\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n?>>>>>>> REPLACE/g;
const normalize = (text) => text.replace(/\r\n/g, '\n');

// complete 는 시작 표시 개수와 온전히 읽힌 블록 개수가 같을 때만 true (중간에 잘린 응답을 걸러낸다).
export function parseEditBlocks(text) {
  const blocks = [];
  for (const m of text.matchAll(BLOCK_RE)) {
    blocks.push({ search: normalize(m[1]), replace: normalize(m[2]) });
  }
  const starts = text.split(SEARCH_MARK).length - 1;
  return { blocks, complete: blocks.length > 0 && blocks.length === starts };
}

const leadingSpace = (line) => line.match(/^[ \t]*/)[0];

function applyOne(code, { search, replace }) {
  if (!search.trim()) return { ok: false, reason: 'empty search' };

  const first = code.indexOf(search);
  if (first >= 0) {
    if (code.indexOf(search, first + 1) >= 0) return { ok: false, reason: 'search matches more than once' };
    return { ok: true, code: code.slice(0, first) + replace + code.slice(first + search.length) };
  }

  // 글자 그대로는 없을 때: 들여쓰기와 줄 끝 공백 차이만 무시하고 줄 단위로 다시 찾는다.
  const codeLines = code.split('\n');
  const searchLines = search.split('\n');
  while (searchLines.length && !searchLines[0].trim()) searchLines.shift();
  while (searchLines.length && !searchLines[searchLines.length - 1].trim()) searchLines.pop();
  const wanted = searchLines.map((l) => l.trim());
  const hits = [];
  for (let i = 0; i + wanted.length <= codeLines.length; i++) {
    if (wanted.every((w, j) => codeLines[i + j].trim() === w)) hits.push(i);
  }
  if (hits.length === 0) return { ok: false, reason: 'search not found' };
  if (hits.length > 1) return { ok: false, reason: 'search matches more than once' };

  // 모델이 쓴 들여쓰기가 실제 코드와 다르면 바꿀 내용의 들여쓰기도 실제 코드에 맞춘다.
  const start = hits[0];
  const actualIndent = leadingSpace(codeLines[start]);
  const modelIndent = leadingSpace(searchLines[0]);
  const replaceLines = replace === '' ? [] : replace.split('\n').map((line) => (
    actualIndent !== modelIndent && line.startsWith(modelIndent) ? actualIndent + line.slice(modelIndent.length) : line
  ));
  codeLines.splice(start, wanted.length, ...replaceLines);
  return { ok: true, code: codeLines.join('\n') };
}

// 블록을 순서대로 적용한다. 하나라도 적용할 수 없으면 아무것도 바꾸지 않고 실패를 알린다.
export function applyEdits(code, blocks) {
  let current = normalize(code);
  for (let i = 0; i < blocks.length; i++) {
    const result = applyOne(current, blocks[i]);
    if (!result.ok) return { ok: false, reason: `block ${i + 1}: ${result.reason}` };
    current = result.code;
  }
  return { ok: true, code: current };
}
