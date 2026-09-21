/**
 * 无头冒烟测试：把 viewer.html 在 jsdom 里跑起来，断言记忆结构那一半的渲染与内置校验。
 *
 *   node --experimental-strip-types .agents/works/w00005-novel-understanding-spike/tasks/t02-novel-memory-model-design/scripts/smoke-viewer.ts
 *
 * 必须用 node 跑，不能用 bun：bun 的 vm 实现与 jsdom 冲突
 * （Proxy is not allowed in the global prototype chain）。
 *
 * 覆盖：空态、两半合起来的渲染、叙述位置滑杆真的会改变可见量、
 *       显示名随位置改写、第 5.6 节的求值与两两判定、W11 那个错答案、
 *       时刻下界、页面内置校验器在正确数据上全绿与在人为破坏的数据上能报错、
 *       图上有节点与边、搜索会减少行数。
 * 不覆盖：视觉呈现、字体、布局、力导向的收敛质量、拖放、真实浏览器行为。
 *         这些要单独的浏览器人工验收授权。
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MEM = join(root, 'chapter-01.json');
const BEATS = join(root, 'evidences', 'chapter-01-beats.json');

let failed = 0;
const ok = (cond: unknown, label: string, detail = '') => {
  if (cond) console.log(`  pass  ${label}${detail ? '  · ' + detail : ''}`);
  else { failed++; console.log(`  FAIL  ${label}${detail ? '  · ' + detail : ''}`); }
};

const shell = readFileSync(join(root, 'viewer.html'), 'utf8');
const memRaw = JSON.parse(readFileSync(MEM, 'utf8'));
const beatsRaw = JSON.parse(readFileSync(BEATS, 'utf8'));

const OPEN = '<script type="application/json" id="dataset">';
const CLOSE = '</' + 'script>';

/** 照 build-viewer.ts 的写法把 payload 注进去（同样的转义） */
function load(payload: unknown) {
  const body = JSON.stringify(payload)
    .replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026');
  const a = shell.indexOf(OPEN);
  const b = shell.indexOf(CLOSE, a);
  const html = shell.slice(0, a + OPEN.length) + '\n' + body + '\n' + shell.slice(b);
  const errors: string[] = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: vc });
  const win = dom.window as any;
  const doc = win.document as any;
  const setK = (k: number) => {
    const s = doc.getElementById('slider');
    s.value = String(k);
    s.dispatchEvent(new win.Event('input', { bubbles: true }));
  };
  const text = (id: string) => doc.getElementById(id).textContent as string;
  return { dom, win, doc, errors, setK, text };
}

const full = (over: Partial<{ memory: unknown; beats: unknown }> = {}) =>
  load({ memory: over.memory ?? memRaw, beats: over.beats ?? beatsRaw });

/* ═══ 空态 ═══════════════════════════════════════════════ */
console.log('viewer.html · 空态');
{
  const { doc, errors } = load({});
  ok(errors.length === 0, '脚本无未捕获异常', errors.join(' | '));
  ok(/没有数据/.test(doc.querySelector('.body').textContent), '显示载入指引');
  ok(/build-viewer/.test(doc.querySelector('.body').textContent), '指引里写了怎么生成');
}

/* ═══ 只有记忆那一半 ═════════════════════════════════════ */
console.log('\nviewer.html · 只载入 chapter-01.json');
{
  const { doc, errors, text } = load({ memory: memRaw });
  ok(errors.length === 0, '脚本无未捕获异常', errors.join(' | '));
  ok(/缺 beats/.test(text('schemaTag')), '标出缺 beats');
  ok(doc.querySelectorAll('.row[data-pick^="entity:"]').length === memRaw.entities.length,
     `主体仍然全部列出（${memRaw.entities.length} 个）`);
  ok(/只载入了记忆那一半/.test(doc.getElementById('sideBody').textContent) ||
     text('vBadge').includes('提醒'), '校验器提醒时刻检查被跳过');
}

/* ═══ 两半都载入 ═════════════════════════════════════════ */
console.log('\nviewer.html · 两半都载入');
const V = full();
{
  const { doc, win, errors, setK, text } = V;
  ok(errors.length === 0, '脚本无未捕获异常', errors.join(' | '));

  /* 顶栏 */
  ok(text('chapTitle').includes(`共 ${memRaw.paragraphCount} 段`), '标题写出总段数');
  ok(text('schemaTag').includes('nbook.novel-memory/v4-spike'), '标出记忆 schema 串');
  ok(text('schemaTag').includes('nbook.novel-beats/v4-spike'), '标出 beats schema 串');

  /* 内置校验器：与 schema.ts 相互独立，必须也全绿 */
  ok(text('vBadge') === '0 错误 0 提醒', '内置校验器 0 错误 0 提醒', text('vBadge'));
  doc.querySelector('.tab[data-tab=check]').dispatchEvent(new win.Event('click', { bubbles: true }));
  ok(doc.querySelectorAll('.vitem.bad').length === 0, '校验页没有不通过项');
  ok(/相互独立/.test(doc.getElementById('sideBody').textContent), '校验页写明与 schema.ts 独立');
  doc.querySelector('.tab[data-tab=entity]').dispatchEvent(new win.Event('click', { bubbles: true }));

  /* 叙述位置滑杆真的会改变可见量 */
  setK(1);
  const at1 = text('statLine');
  ok(/主体 0\b/.test(at1), '第 1 段没有 Entity 主体出场（标题披露挂 Kind 槽）', at1);
  ok(/披露 1\b/.test(at1), '第 1 段只有 1 条披露（标题那条剧透）', at1);
  setK(memRaw.paragraphCount);
  const atEnd = text('statLine');
  ok(atEnd.includes(`主体 ${memRaw.entities.length}`), `读完有 ${memRaw.entities.length} 个主体`, atEnd);
  ok(atEnd.includes(`披露 ${memRaw.disclosures.length}`), `读完有 ${memRaw.disclosures.length} 条披露`, atEnd);
  ok(atEnd.includes(`槽 ${memRaw.slots.length}`), `读完 ${memRaw.slots.length} 个槽都有披露`, atEnd);

  /* Beat 定位是算出来的 */
  setK(1);
  ok(/B01/.test(text('beatLine')), '第 1 段落在 B01');
  ok(/故事外/.test(text('beatLine')), 'B01 是故事外');
  ok(/不停在时刻上/.test(text('beatLine')), '故事外的 Beat 不停在时刻上');
  setK(16);
  ok(/M_b/.test(text('beatLine')), '第 16 段所在的 Beat 停在 M_b');

  /* 显示名随叙述位置改写 */
  const nameOf = (id: string, k: number) => {
    setK(k);
    const row = [...doc.querySelectorAll(`.row[data-pick="entity:${id}"] .nm`)][0] as any;
    return row ? (row.textContent as string) : '';
  };
  ok(nameOf('codex', 8).startsWith('黑色古书'), '第 8 段古书叫「黑色古书」', nameOf('codex', 8));
  ok(nameOf('codex', 30).startsWith('墨丘利秘典'), '第 30 段古书叫「墨丘利秘典」', nameOf('codex', 30));
  ok(nameOf('codex', 77).startsWith('墨丘利秘典'), '读完之后不会被「小破书」顶掉', nameOf('codex', 77));
  ok(nameOf('body_fox', 10).includes('身影'), '第 10 段身体还是「一道陌生的娇小身影」', nameOf('body_fox', 10));
  ok(nameOf('body_fox', 11).includes('狐女'), '第 11 段身体改叫「狐女」', nameOf('body_fox', 11));

  /* 选中主体：检视器里要有名字时间线与类 */
  setK(memRaw.paragraphCount);
  (doc.querySelector('.row[data-pick="entity:codex"]') as any).dispatchEvent(new win.Event('click', { bubbles: true }));
  const ins = () => doc.getElementById('ins').textContent as string;
  ok(/它叫什么，随位置变/.test(ins()), '检视器列出名字时间线');
  ok(/第 30 段起 墨丘利秘典/.test(ins()), '时间线标出第 30 段起改名');
  ok(/库内分类/.test(ins()) && /文本给的类/.test(ins()), '分类与类分开显示');
  ok(/典籍/.test(ins()), '古书带着「典籍」这个类');

  /* W11：单值谓词上两个互斥的值同时为真 */
  ok(/互斥同真/.test(text('statLine')), '读完之后顶栏标出互斥同真');
  doc.querySelector('.tab[data-tab=slot]').dispatchEvent(new win.Event('click', { bubbles: true }));
  ok(doc.querySelectorAll('.row[data-pick^="slot:"]').length === memRaw.slots.length,
     `槽页列出全部 ${memRaw.slots.length} 个槽`);
  ok(/互斥同真/.test(doc.getElementById('sideBody').textContent), '槽页给出错的那个槽打上标');
  (doc.querySelector('.row[data-pick="slot:S_contract_state"]') as any)
    .dispatchEvent(new win.Event('click', { bubbles: true }));
  ok(/互斥同真（W11）/.test(ins()), '契约状态这个槽被标成 W11');
  ok(/尚未签订/.test(ins()) && /成立/.test(ins()), '两个互斥的值都摆出来了');
  ok(/认识论并存/.test(ins()), '给出成因：判成了认识论并存');
  ok(/两两判定/.test(ins()), '列出两两判定');

  /* 第 5.6 节的三堆 */
  (doc.querySelector('.row[data-pick="slot:S_su_kind"]') as any)
    .dispatchEvent(new win.Event('click', { bubbles: true }));
  ok(/为真/.test(ins()), '求值分出「为真」那一堆');
  ok(/并列累加/.test(ins()), '多值谓词上判成并列累加，不是竞争');

  /* 读者推断要标出推断自哪些槽 */
  const inf = memRaw.disclosures.find((d: any) => d.source.channel === 'reader_inference');
  const infSlot = inf.slot;
  (doc.querySelector(`.row[data-pick="slot:${infSlot}"]`) as any)
    .dispatchEvent(new win.Event('click', { bubbles: true }));
  ok(/读者推断/.test(ins()), '推断的来源通道显示为读者推断');
  ok(/推断自/.test(ins()), '推断列出 inferredFrom，而不是叫「支持」');

  /* 首页检视器：时刻与下界 */
  win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok(/M_b → M_c 下界：3 分钟/.test(ins()), '首页给出 M_b → M_c 至少 3 分钟');
  ok(/同一章内，叙述当下按段号单调不减/.test(ins()), '把这个下界依赖的假设写出来');
  ok(/M_nightshifts/.test(ins()), '列出没有 Beat 停在上面的那个时刻');
  ok(/没有 Beat 停在这/.test(ins()), '标出它没有 Beat 停在上面（两个挂钩，一种节点）');
  ok(/披露指向这/.test(ins()), '标出有披露指向它');
  const beatChip = [...doc.querySelectorAll('#ins .chip')].find(c => /Beat 停在这/.test(c.textContent));
  ok(!!beatChip && beatChip.classList.contains('beat-list'),
     'Beat 停在这的长列表用可断行标签，不再撑宽检视器');
  ok(!!beatChip && win.getComputedStyle(beatChip).whiteSpace !== 'nowrap',
     'Beat 停在这标签允许换行');

  /* 图 */
  const svg = doc.getElementById('graph');
  ok(svg.querySelectorAll('[data-node]').length > 0, '图上有节点',
     `${svg.querySelectorAll('[data-node]').length} 个`);
  ok(svg.querySelectorAll('line[data-slot]').length > 0, '图上有边',
     `${svg.querySelectorAll('line[data-slot]').length} 条`);
  setK(1);
  const n1 = svg.querySelectorAll('[data-node]').length;
  setK(memRaw.paragraphCount);
  const nEnd = svg.querySelectorAll('[data-node]').length;
  ok(nEnd > n1, `图随叙述位置长大：第 1 段 ${n1} 个节点 → 读完 ${nEnd} 个`);

  /* 搜索 */
  doc.querySelector('.tab[data-tab=entity]').dispatchEvent(new win.Event('click', { bubbles: true }));
  const before = doc.querySelectorAll('.row[data-pick^="entity:"]').length;
  const q = doc.getElementById('q');
  q.value = '狐';
  q.dispatchEvent(new win.Event('input', { bubbles: true }));
  const after = doc.querySelectorAll('.row[data-pick^="entity:"]').length;
  ok(after > 0 && after < before, `搜「狐」后主体从 ${before} 行减到 ${after} 行`);
  q.value = '';
  q.dispatchEvent(new win.Event('input', { bubbles: true }));
  ok(doc.querySelectorAll('.row[data-pick^="entity:"]').length === before, '清空搜索后恢复');
}

/* ═══ 内置校验器要能真的报错 ═════════════════════════════ */
console.log('\nviewer.html · 内置校验器对坏数据');
const bad = (mutate: (m: any, b: any) => void, frag: RegExp, label: string) => {
  const m = JSON.parse(JSON.stringify(memRaw));
  const b = JSON.parse(JSON.stringify(beatsRaw));
  mutate(m, b);
  const { doc, win } = load({ memory: m, beats: b });
  doc.querySelector('.tab[data-tab=check]').dispatchEvent(new win.Event('click', { bubbles: true }));
  const t = doc.getElementById('sideBody').textContent as string;
  ok(frag.test(t), label, frag.test(t) ? '' : t.slice(0, 160));
};

bad((m) => { m.slots.push({ ...m.slots[0], id: 'S_dup_pair' }); },
    /槽必须唯一/, '同一对（主体,谓词）建两个槽 → 报错');
bad((m) => { m.disclosures[3].slot = 'S_nope'; },
    /槽 S_nope 不存在/, '披露指向不存在的槽 → 报错');
bad((m) => { const d = m.disclosures.find((x: any) => x.slot); d.refutes = m.disclosures[0].id; },
    /二选一/, 'slot 与 refutes 同时填 → 报错');
bad((m) => { const d = m.disclosures.find((x: any) => x.source.channel === 'narrator'); d.source.holder = 'su_tianqing'; },
    /叙述者不该有 holder/, '叙述者带 holder → 报错');
bad((m) => { const d = m.disclosures.find((x: any) => x.source.channel === 'speech'); d.source.holder = null; },
    /必须写明是谁说的/, '角色说出口却没写是谁 → 报错');
bad((m) => { m.disclosures[5].at = 999; },
    /不在 1\.\.77/, '叙述位置越界 → 报错');
bad((m) => { const d = m.disclosures.find((x: any) => x.source.channel === 'reader_inference'); delete d.inferredFrom; },
    /读者推断必须写明推断自哪些槽/, '推断不写 inferredFrom → 报错');
bad((m) => {
      const d = m.disclosures.find((x: any) => x.source.channel === 'reader_inference');
      // 让它推断自一个只有推断的槽：推断不能当另一条推断的证据
      const only = m.disclosures.filter((o: any) => o.source.channel === 'reader_inference');
      d.inferredFrom = [only.find((o: any) => o.id !== d.id && o.slot)?.slot ?? d.inferredFrom[0]];
      for (const o of m.disclosures) if (o.slot === d.inferredFrom[0] && o.source.channel !== 'reader_inference') o.slot = undefined, o.refutes = m.disclosures[0].id;
    },
    /只有推断，没有文本给的披露|二选一/, '推断拿另一条推断当证据 → 报错');
bad((m) => { const d = m.disclosures.find((x: any) => x.value.t === 'kind'); d.value.id = 'K_nope'; },
    /值指向的类 K_nope 不存在/, '值指向不存在的类 → 报错');
bad((_m, b) => { b.beats[2].paragraphs = [10, 12]; },
    /有缝或有重叠/, 'Beat 之间挖出缝 → 报错');
bad((_m, b) => { b.beats[0].moment = 'M_a'; },
    /故事外的 Beat 不该停在某个时刻上/, '故事外的 Beat 挂时刻 → 报错');
bad((_m, b) => { b.beats.find((x: any) => x.id === 'B10').moment = 'M_b'; },
    /在这个场里，却挂在时刻/, '场内混入别的时刻 → 报错');
bad((_m, b) => { b.moments[1].label = '五分钟前'; },
    /相对时间词/, '时刻的名字里写相对时间词 → 报错');
bad((_m, b) => { b.momentRelations[0].subject = 'M_zzz'; },
    /主语 M_zzz 不是时刻/, '时刻关系主语悬空 → 报错');
bad((_m, b) => { delete b.momentRelations[0].source; },
    /时刻关系必须有来源/, '时刻关系缺来源 → 报错');
bad((_m, b) => { b.momentRelations[2].predicate = 'same'; b.momentRelations[2].offset = { value: 5, unit: '分钟' }; },
    /只有早于\/晚于才能带偏移/, '「同一」带偏移 → 报错');
bad((_m, b) => { b.momentRelations[0].offset = { value: 5, unit: 'furlong' }; },
    /偏移单位 furlong 不认识/, '偏移单位认不出来 → 报错');
bad((_m, b) => { b.scenes.find((s: any) => s.povDrift).povDrift.push('B01'); },
    /不在这个场里/, '视角漂移标到场外的 Beat → 报错');
bad((m, b) => { b.chapter = 99; },
    /不是同一章/, '两半不是同一章 → 报错');
bad((m) => { m.kinds.push({ id: 'K_ghost', name: '幽灵' }); },
    /类没有被任何披露挂到主体上/, '建了没人用的类 → 提醒');

console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
