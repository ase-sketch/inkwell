/**
 * 校验第一章的两份数据，把合并结果注入两个页面。
 *
 *   node --experimental-strip-types .agents/works/w00005-novel-understanding-spike/tasks/t02-novel-memory-model-design/scripts/build-viewer.ts
 *
 * 一章分两份存：
 *   evidences/chapter-01-beats.json   正文怎么切（Beat、场、时刻）
 *   chapter-01.json                   记住了什么（类、主体、谓词、槽、披露）
 * 两份都是真源，两个页面里的副本由本脚本写入，不要手改。
 *
 * 两个页面拿到的东西不一样，这是故意的：
 *   viewer.html          只拿两份原始数据，页面自带一套独立实现的求值与校验。
 *                        两边都报 0 错误才算数——它是 schema.ts 的第二意见。
 *   chapter-01-graph.html 拿原始数据 + 本脚本用 schema.ts 算好的 derived。
 *                        它是一篇走查，展示的每个数都必须真的出自 schema.ts，
 *                        不能是页面里另写一遍的近似值（v2 那一版就是这么写歪的）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  merge, validate, disclosureLoad, readerState, evaluateSlot, relationOf, compareMoments,
  quantitativeBounds, displayName, entityKnownAt, valueKey,
  RELATION_ZH, CHANNEL_ZH, HEDGE_ZH, NOW_ASSUMPTION,
  type BeatsDoc, type MemoryDoc, type Chapter, type Relation, type Disclosure,
  type Value, type ID,
} from '../schema.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const MEM = join(root, 'chapter-01.json');
const BEATS = join(root, 'evidences', 'chapter-01-beats.json');
const VIEW = join(root, 'viewer.html');
const GRAPH = join(root, 'chapter-01-graph.html');

const mem = JSON.parse(readFileSync(MEM, 'utf8')) as MemoryDoc;
const beats = JSON.parse(readFileSync(BEATS, 'utf8')) as BeatsDoc;

if (mem.schema !== 'nbook.novel-memory/v4-spike') throw new Error(`chapter-01.json 的 schema 不对 -> ${mem.schema}`);
if (beats.schema !== 'nbook.novel-beats/v4-spike') throw new Error(`chapter-01-beats.json 的 schema 不对 -> ${beats.schema}`);
if (mem.chapter !== beats.chapter) throw new Error('两份数据不是同一章');

const c = merge(mem, beats);
const N = c.paragraphCount;
const issues = validate(c);
const errors = issues.filter(i => i.level === 'error');
const warns = issues.filter(i => i.level === 'warn');

console.log('memory   ' + MEM);
console.log('beats    ' + BEATS);
console.log('counts   ' + Object.entries({
  kind: c.kinds.length, entity: c.entities.length, predicate: c.predicates.length,
  slot: c.slots.length, disclosure: c.disclosures.length,
  beat: c.beats.length, scene: c.scenes.length,
  moment: c.moments.length, momentRelation: c.momentRelations.length,
}).map(([k, v]) => `${k}=${v}`).join(' '));

const byChannel = c.disclosures.reduce<Record<string, number>>(
  (a, d) => ((a[d.source.channel] = (a[d.source.channel] ?? 0) + 1), a), {});
console.log('channel  ' + Object.entries(byChannel).map(([k, v]) => `${k}=${v}`).join(' '));

const hedged = c.disclosures.filter(d => d.source.hedge !== 'plain').length;
console.log(`hedge    plain=${c.disclosures.length - hedged} 其它=${hedged}`);

console.log('load     ' + disclosureLoad(c).slice(0, 5).map(x => `${x.slot}:${x.n}`).join('  '));

// 第 5.6 节那张表在这一章上各命中几次（按槽计：一个槽里出现过这种关系就算一次）
const rel: Record<string, number> = {};
for (const s of readerState(c, N))
  for (const r of s.relations) rel[r] = (rel[r] ?? 0) + 1;
console.log('relation ' + (Object.entries(rel).length
  ? Object.entries(rel).map(([k, v]) => `${RELATION_ZH[k as Relation]}=${v}槽`).join(' ')
  : '（无同槽多披露）'));

// 第 5.7.6 节那句「开场白至少比面摊晚 3 分钟」，由 quantitativeBounds 算出来
const lo = quantitativeBounds(c);
const gap = lo.get('M_b->M_c');
console.log(`moment   M_b → M_c 下界 ${gap === undefined || gap === -Infinity ? '推不出' : gap + ' 分钟'}（假设：${NOW_ASSUMPTION}）`);

// 叙述位置切片真的会改名
const codex = c.entities.find(e => e.id === 'codex');
if (codex) console.log('slice    codex ' + [8, 11, 30, 77].map(k => `@${k}=${displayName(c, codex, k)}`).join('  '));

for (const w of warns) console.log(`WARN  ${w.at}: ${w.message}`);
for (const e of errors) console.log(`ERROR ${e.at}: ${e.message}`);

if (errors.length) {
  console.log(`\n${errors.length} error(s) — 页面未更新。`);
  process.exit(1);
}

/* ═══ 算给走查页看的那些数 ═══════════════════════════════
   全部走 schema.ts。页面只负责摆，不负责算。
   ═════════════════════════════════════════════════════ */

const predName = (id: ID) => c.predicates.find(p => p.id === id)?.name ?? id;
const slotTitle = (id: ID) => {
  const s = c.slots.find(x => x.id === id);
  if (!s) return id;
  let subjectLabel: string;
  if (s.subject.type === 'entity') {
    const e = c.entities.find(x => x.id === s.subject.id);
    subjectLabel = e ? e.label : s.subject.id;
  } else {
    const k = c.kinds.find(x => x.id === s.subject.id);
    subjectLabel = k ? k.name : s.subject.id;
  }
  return `${subjectLabel} · ${predName(s.predicate)}`;
};
const valueText = (v: Value, k: number): string =>
  v.t === 'literal' ? v.v
  : v.t === 'number' ? v.v + (v.unit ?? '')
  : v.t === 'ref' ? (() => { const e = c.entities.find(x => x.id === v.id); return e ? displayName(c, e, k) : v.id; })()
  : v.t === 'kind' ? (c.kinds.find(x => x.id === v.id)?.name ?? v.id)
  : v.v === 'UNKNOWN' ? '（文本明确留白）' : '（明确没有）';

/** 显示名在哪几段换过 */
const nameTimeline = (id: ID) => {
  const e = c.entities.find(x => x.id === id)!;
  const out: Array<{ at: number; name: string }> = [];
  let last: string | null = null;
  for (let k = 1; k <= N; k++) {
    const n = displayName(c, e, k);
    if (n !== last) { out.push({ at: k, name: n }); last = n; }
  }
  return out;
};

const entityFirstAt: Record<ID, number> = {};
for (const e of c.entities) {
  let at = Infinity;
  for (let k = 1; k <= N; k++) if (entityKnownAt(c, e, k)) { at = k; break; }
  entityFirstAt[e.id] = at === Infinity ? 0 : at;
}

const sliceCounts = Array.from({ length: N }, (_, i) => {
  const k = i + 1;
  return {
    k,
    entities: c.entities.filter(e => entityKnownAt(c, e, k)).length,
    slots: readerState(c, k).length,
    disclosures: c.disclosures.filter(d => d.at <= k).length,
  };
});

const beatLoad = c.beats.map(b => ({
  id: b.id, type: b.type, from: b.paragraphs[0], to: b.paragraphs[1],
  moment: b.moment, gist: b.gist,
  n: c.disclosures.filter(d => d.at >= b.paragraphs[0] && d.at <= b.paragraphs[1]).length,
}));

/** 第 5.6 节那张表在这一章上每一次命中，连判据一起带出来 */
const relationHits: Array<{
  relation: Relation; slot: ID; slotTitle: string; a: ID; b: ID;
  valueA: string; valueB: string; moment: string; sameValue: boolean; sameChannel: boolean;
  cardinality: string;
}> = [];
for (const s of c.slots) {
  const st = evaluateSlot(c, s, N);
  const live = [...st.held, ...st.pending].sort((x, y) => x.at - y.at);
  const card = c.predicates.find(p => p.id === s.predicate)?.cardinality ?? 'single';
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const x = live[i], y = live[j];
    relationHits.push({
      relation: relationOf(c, x, y), slot: s.id, slotTitle: slotTitle(s.id),
      a: x.id, b: y.id, valueA: valueText(x.value, N), valueB: valueText(y.value, N),
      moment: compareMoments(c, x.timeRef, y.timeRef),
      sameValue: valueKey(x.value) === valueKey(y.value),
      sameChannel: x.source.channel === y.source.channel && x.source.holder === y.source.holder,
      cardinality: card,
    });
  }
}

const finalState = readerState(c, N).map(st => ({
  slot: st.slot.id, title: slotTitle(st.slot.id), subject: st.slot.subject,
  predicate: predName(st.slot.predicate),
  cardinality: c.predicates.find(p => p.id === st.slot.predicate)?.cardinality ?? 'single',
  held: st.held.map(d => d.id), pending: st.pending.map(d => d.id),
  refuted: st.refuted.map(d => d.id), relations: st.relations,
  heldText: st.held.map(d => valueText(d.value, N)),
}));

/** 单值谓词却同时有两个互斥的值为真 —— 这一章唯一的错答案，W11 的由来 */
const w11 = finalState.filter(s =>
  s.cardinality === 'single' && new Set(s.heldText).size > 1);

const momentBounds: Array<{ from: string; to: string; minutes: number }> = [];
for (const a of c.moments) for (const b of c.moments) {
  if (a.id === b.id) continue;
  const v = lo.get(`${a.id}->${b.id}`);
  if (v !== undefined && v !== -Infinity && v > 0) momentBounds.push({ from: a.id, to: b.id, minutes: v });
}

const momentUse = c.moments.map(m => ({
  id: m.id, grain: m.grain, label: m.label, note: m.note ?? '',
  beats: c.beats.filter(b => b.moment === m.id).map(b => b.id),
  scenes: c.scenes.filter(s => s.moment === m.id).map(s => s.id),
  disclosures: c.disclosures.filter(d => d.timeRef === m.id).map(d => d.id),
  relations: c.momentRelations.filter(r => r.subject === m.id || r.anchor?.ref === m.id).length,
}));

/** 一次查询走一遍。步骤是算出来的，不是写死的。 */
function trace(subject: ID, pname: string, k: number) {
  const steps: Array<{ step: string; detail: string }> = [];
  let e = c.entities.find(x => x.id === subject);
  let subjectName: string;
  let subjectType: 'entity' | 'kind' | null = null;
  if (e) {
    subjectType = 'entity';
    subjectName = displayName(c, e, k);
  } else {
    // 尝试作为 Kind
    const kind = c.kinds.find(x => x.id === subject);
    if (kind) {
      subjectType = 'kind';
      subjectName = kind.name;
    } else {
      subjectName = subject;
    }
  }
  steps.push({ step: '问题', detail: `读到第 ${k} 段，${subjectName}的「${pname}」是什么？` });
  const s = c.slots.find(x =>
    x.subject.type === subjectType && x.subject.id === subject && predName(x.predicate) === pname
  );
  if (!s) { steps.push({ step: '找槽', detail: '库里没有这个槽 —— 这不是「不知道」，是「没人说过」' }); return steps; }
  const p = c.predicates.find(x => x.id === s.predicate)!;
  steps.push({ step: '找槽', detail: `${s.id}（${p.cardinality === 'multi' ? '多值' : '单值'}，易变度 ${p.volatility}）—— 槽是节点，值不是` });
  const all = c.disclosures.filter(d => d.slot === s.id);
  steps.push({ step: '取披露', detail: `全章 ${all.length} 条，at ≤ ${k} 的有 ${all.filter(d => d.at <= k).length} 条：` +
    all.filter(d => d.at <= k).map(d => `${d.id}@第${d.at}段`).join('、') });
  const st = evaluateSlot(c, s, k);
  for (const d of [...st.held, ...st.pending]) {
    const other = [...st.held, ...st.pending].find(o => o.id !== d.id);
    const holderName = d.source.holder
      ? (() => { const h = c.entities.find(x => x.id === d.source.holder); return h ? displayName(c, h, k) : d.source.holder; })()
      : null;
    steps.push({
      step: d.id,
      detail: `${valueText(d.value, k)} ｜ ${CHANNEL_ZH[d.source.channel]}` +
        (holderName ? `：${holderName}` : '') +
        ` ｜ ${HEDGE_ZH[d.source.hedge]} ｜ 时间指示 ${d.timeRef ?? '（无，落在叙述当下）'}` +
        (other ? ` ｜ 与 ${other.id} 判为「${RELATION_ZH[relationOf(c, d, other)]}」` : ''),
    });
  }
  steps.push({
    step: '结果',
    detail: `为真 ${st.held.length} 条${st.held.length ? '：' + st.held.map(d => valueText(d.value, k)).join(' | ') : ''}` +
      `　悬而未决 ${st.pending.length} 条　已被推翻 ${st.refuted.length} 条`,
  });
  return steps;
}

const derived = {
  builtBy: 'scripts/build-viewer.ts via schema.ts',
  nowAssumption: NOW_ASSUMPTION,
  counts: {
    kind: c.kinds.length, entity: c.entities.length, predicate: c.predicates.length,
    slot: c.slots.length, disclosure: c.disclosures.length,
    beat: c.beats.length, scene: c.scenes.length, moment: c.moments.length,
    momentRelation: c.momentRelations.length, paragraph: N,
  },
  channel: byChannel,
  hedge: c.disclosures.reduce<Record<string, number>>(
    (a, d) => ((a[d.source.hedge] = (a[d.source.hedge] ?? 0) + 1), a), {}),
  entityFirstAt,
  nameTimelines: Object.fromEntries(c.entities.map(e => [e.id, nameTimeline(e.id)])),
  sliceCounts,
  beatLoad,
  relationHits,
  /** 按槽计：一个槽里出现过这种关系就算一次。与 relationHits 的对数不是一个量。 */
  relationSlotCount: rel,
  finalState,
  w11,
  load: disclosureLoad(c),
  momentBounds,
  momentUse,
  traceOk: trace('su_tianqing', '居于哪具身体', 20),
  traceBad: trace('contract', '契约状态', N),
  issues,
};

/* ═══ 注入 ═══════════════════════════════════════════════ */
const OPEN = '<script type="application/json" id="dataset">';
const CLOSE = '</' + 'script>';

function inject(file: string, payload: unknown, label: string) {
  const html = readFileSync(file, 'utf8');
  const a = html.indexOf(OPEN);
  if (a < 0) { console.log(`${label} 缺少 dataset 注入点`); process.exit(1); }
  const b = html.indexOf(CLOSE, a);
  const body = JSON.stringify(payload)
    .replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026');
  const next = html.slice(0, a + OPEN.length) + '\n' + body + '\n' + html.slice(b);
  if (next === html) console.log(`${label} 已是最新。`);
  else { writeFileSync(file, next, 'utf8'); console.log(`${label} 已更新。`); }
}

console.log('');
inject(VIEW, { memory: mem, beats }, 'viewer.html');
inject(GRAPH, { memory: mem, beats, derived }, 'chapter-01-graph.html');
console.log(`0 error / ${warns.length} warn`);
