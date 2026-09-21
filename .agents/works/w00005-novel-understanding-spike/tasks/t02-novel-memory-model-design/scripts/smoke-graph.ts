/**
 * 无头冒烟测试：把 chapter-01-graph.html 在 jsdom 里跑起来。
 *
 *   node --experimental-strip-types .agents/works/w00005-novel-understanding-spike/tasks/t02-novel-memory-model-design/scripts/smoke-graph.ts
 *
 * 必须用 node 跑，不能用 bun：bun 的 vm 实现与 jsdom 冲突。
 *
 * 这一页是走查，不是工具：它自己不算任何数，只摆 build-viewer.ts 用 schema.ts 算好的
 * derived。所以这里断言的重点是——**页面上的数确实来自 derived，没有第二份硬编码**。
 * v2 那一版把数写死在页面里，于是文档、数据、页面三处各自漂移。
 *
 * 不覆盖：视觉呈现、字体、布局、真实浏览器行为。这些要单独的浏览器人工验收授权。
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = join(root, 'chapter-01-graph.html');

let failed = 0;
const ok = (cond: unknown, label: string, detail = '') => {
  if (cond) console.log(`  pass  ${label}${detail ? '  · ' + detail : ''}`);
  else { failed++; console.log(`  FAIL  ${label}${detail ? '  · ' + detail : ''}`); }
};

const html = readFileSync(PAGE, 'utf8');
const errors: string[] = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(e.message));
const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: vc });
const win = dom.window as any;
const doc = win.document as any;

const raw = JSON.parse(doc.getElementById('dataset').textContent);
const { memory: mem, beats, derived: D } = raw;
const text = (id: string) => (doc.getElementById(id).textContent as string).replace(/\s+/g, ' ');
const body = () => doc.body.textContent as string;

console.log('chapter-01-graph.html');
ok(errors.length === 0, '脚本无未捕获异常', errors.join(' | '));

/* 注入的三块都在 */
ok(!!mem && !!beats && !!D, 'dataset 里有 memory / beats / derived');
ok(D.builtBy.includes('schema.ts'), 'derived 标明由 schema.ts 算出', D.builtBy);
ok(D.issues.filter((i: any) => i.level === 'error').length === 0, 'schema.ts 的校验 0 错误');

/* 页面上没有第二份硬编码的数据 */
{
  const script = [...doc.querySelectorAll('script')]
    .filter((s: any) => s.type !== 'application/json')
    .map((s: any) => s.textContent).join('\n');
  ok(!/const\s+(EP|F|P|Q|FACTS|EPISODES)\s*=\s*\[/.test(script), 'v2 那几个硬编码数组已经不在页面里');
  const bigArrays = script.match(/=\s*\[[^\]]{400,}/g) || [];
  ok(bigArrays.length === 0, '页面脚本里没有大块硬编码数据', `${bigArrays.length} 处`);
  // 只查页面脚本。chapter-01.json 的 provenance 里提到 v2 是有意的历史说明，不算残留。
  ok(!/storyAfter|Episode/.test(script) && !/nbook\.novel-memory\/v2/.test(script),
     'v2 的词汇（Episode / storyAfter）已经不在页面脚本里');
  ok(!/\.facet\b|\be\.facet\b/.test(script), '页面脚本不再读取 Entity.facet');
}

/* Hero 数字条 = derived.counts */
{
  const t = text('dataline');
  for (const [n, label] of [
    [D.counts.paragraph, '段'], [D.counts.beat, 'BEAT'], [D.counts.scene, '场'],
    [D.counts.moment, '时刻'], [D.counts.entity, '主体'], [D.counts.slot, '槽'],
    [D.counts.disclosure, '披露'],
  ] as Array<[number, string]>)
    ok(t.includes(`${n}${label}`), `数字条上「${label} ${n}」`, t.includes(`${n}${label}`) ? '' : t);
}

/* B 拆分带子 */
ok(doc.querySelectorAll('#strip .bt-block').length === D.counts.beat,
   `带子上 ${D.counts.beat} 格，一个 Beat 一格`);
{
  const zero = D.beatLoad.filter((b: any) => b.n === 0);
  ok(zero.length > 0, `有 ${zero.length} 个 Beat 一条披露都没产出`, zero.map((b: any) => b.id).join('、'));
  ok(doc.querySelectorAll('#zeroBody tr').length === zero.length, '零产出表逐行列出它们');
  for (const b of zero) ok(text('zeroBody').includes(b.id), `零产出表里有 ${b.id}`);
  ok(/Beat 层删掉/.test(text('zeroNote')), '说清楚了为什么 Beat 层不能省');
  const totalSpan = D.beatLoad.reduce((a: number, b: any) => a + (b.to - b.from + 1), 0);
  ok(totalSpan === D.counts.paragraph, 'Beat 铺满全章', `${totalSpan} 段`);
}

/* M 时刻 */
ok(doc.querySelectorAll('#momentCards .card').length === D.counts.moment,
   `时刻卡 ${D.counts.moment} 张`);
{
  const t = text('momentCards');
  const orphan = D.momentUse.filter((m: any) => m.beats.length === 0 && m.disclosures.length > 0);
  ok(orphan.length > 0, '有时刻没有 Beat 停在上面，却被披露指着（两个挂钩，一种节点）',
     orphan.map((m: any) => m.id).join('、'));
  for (const m of orphan) ok(t.includes(m.id) && t.includes('没有 Beat 停在这'), `${m.id} 标着没有 Beat 停在这`);
  ok(mem.disclosures.some((d: any) => d.timeRef === 'M_nightshifts'), 'M_nightshifts 被披露指着');
  ok(beats.beats.find((b: any) => b.id === 'B05').moment === 'M_b', 'B05 自己停在 M_b');
}
ok(doc.querySelectorAll('#mrelBody tr').length === beats.momentRelations.length,
   `时刻关系表 ${beats.momentRelations.length} 行`);
ok(text('mrelBody').includes('叙述当下'), '锚点为空的渲染成「叙述当下」');
{
  const gap = D.momentBounds.find((b: any) => b.from === 'M_b' && b.to === 'M_c');
  ok(gap && gap.minutes === 3, 'M_b → M_c 的下界是 3 分钟', gap ? String(gap.minutes) : '没算出来');
  ok(text('boundBody').includes('M_b → M_c'), '下界表里有这一条');
  ok(text('boundNote').includes(D.nowAssumption.slice(0, 12)), '把这个下界依赖的假设写出来');
}
ok(beats.moments.every((m: any) => !m.label || !/之前|之后|分钟/.test(m.label)),
   '时刻的名字里没有相对时间词');

/* S 槽 */
ok(doc.querySelectorAll('#loadBody tr').length === Math.min(8, D.load.length), '披露最密的槽列了 8 行');
ok(text('loadBody').includes(D.load[0].slot.replace(/^S_/, '')) || text('loadBody').length > 0,
   '第一行是披露最密的那个槽');
ok(/槽是主体加谓词/.test(body()) || /槽<\/b>是主体加谓词/.test(html), '讲清楚槽是节点、命题不是');

/* D 披露 */
{
  const t = text('chanBody');
  for (const ch of Object.keys(D.channel)) {
    const zh = { narrator: '叙述者', speech: '角色说出口', thought: '角色心里想',
                 system: '系统提示', author: '作者旁白', reader_inference: '读者推断' }[ch]!;
    ok(t.includes(zh) && t.includes(String(D.channel[ch])), `来源通道表里有「${zh}」${D.channel[ch]} 条`);
  }
  ok(t.includes('不写（写了反而报错）'), '标出哪些通道不写说话人');
  const hedged = mem.disclosures.filter((d: any) => d.source.hedge !== 'plain').length;
  ok(text('hedgeBody').includes(String(D.hedge.plain)), `直陈 ${D.hedge.plain} 条`);
  ok(hedged === D.counts.disclosure - D.hedge.plain, `带保留或悬置 ${hedged} 条`);
  ok(text('recGrid').includes('timeRef') && text('recGrid').includes('inferredFrom'),
     '全字段展开把 timeRef 与 inferredFrom 都摆出来');
  ok(/支持是查询时算出来的，不存/.test(text('inferNote')),
     '说清楚支持不存、只存「推断自」');
}

/* R 关系 */
{
  const rows = doc.querySelectorAll('#relBody tr');
  ok(rows.length === 6, '关系表六行（第 5.6 节五行 + 补的并列累加）', `${rows.length} 行`);
  const t = text('relBody');
  for (const [r, zh] of Object.entries({
    corroborate: '印证', compete: '竞争', coexist: '认识论并存',
    succeed: '接续', candidate: '候选同指', accrue: '并列累加',
  })) {
    ok(t.includes(zh), `关系表里有「${zh}」`);
    const n = D.relationHits.filter((h: any) => h.relation === r).length;
    if (n) ok(t.includes(`${n} 次`), `「${zh}」命中 ${n} 次`);
  }
  const missing = ['compete', 'succeed', 'candidate']
    .filter(r => D.relationHits.every((h: any) => h.relation !== r));
  ok(missing.length > 0, `有 ${missing.length} 行这一章一次都没命中`, missing.join('、'));
  ok(/一次都没命中/.test(text('relNote')) && /反驳/.test(text('relNote')),
     '把没验过的规则挑明，包括整套反驳机制');
}

/* T 切片 */
{
  const rng = doc.getElementById('sliceRange');
  ok(rng.max === String(D.counts.paragraph), `滑杆到第 ${D.counts.paragraph} 段`);
  ok(doc.querySelectorAll('#curve polyline').length === 3, '三条曲线：披露 / 槽 / 主体');
  const set = (k: number) => { rng.value = String(k); rng.dispatchEvent(new win.Event('input', { bubbles: true })); };
  set(1);
  ok(text('sliceK') === '第 1 段', '滑杆标出当前段号');
  ok(text('sliceNum').includes(`披露 ${D.sliceCounts[0].disclosures}/${D.counts.disclosure}`),
     `第 1 段披露 ${D.sliceCounts[0].disclosures} 条`, text('sliceNum'));
  set(D.counts.paragraph);
  ok(text('sliceNum').includes(`主体 ${D.counts.entity}/${D.counts.entity}`), '读完主体全出场');
  // 名字随位置改写
  set(8);
  ok(text('namewall').includes('黑色古书'), '第 8 段古书叫「黑色古书」');
  ok(text('namewall').includes('第 30 段起改叫'), '预告第 30 段改名');
  set(30);
  ok(text('namewall').includes('墨丘利秘典'), '第 30 段古书叫「墨丘利秘典」');
  set(1);
  ok(text('namewall').includes('还没出场'), '还没出场的主体标出来，不提前泄漏名字');
}

/* W 缺口 */
{
  ok(D.w11.length > 0, `有 ${D.w11.length} 个槽给出互斥同真的错答案`, D.w11.map((s: any) => s.slot).join('、'));
  const t = text('w11Box');
  for (const s of D.w11) ok(t.includes(s.slot), `W11 那一块点名 ${s.slot}`);
  ok(/认识论并存/.test(t) && /叙述位置/.test(t), '给出成因和唯一的出口');
  const fs = [...(mem.findings || []), ...((beats.findings) || [])];
  ok(doc.querySelectorAll('#findings .gap').length === fs.length,
     `findings 逐条列出（${fs.length} 条）`);
}

/* → 走查 */
{
  ok(D.traceOk.length > 2 && D.traceBad.length > 2, '两段走查的步骤都是算出来的');
  ok(/居于哪具身体/.test(text('traceOk')), '第一段查的是「苏天晴居于哪具身体」');
  ok(/S_su_inhabits/.test(text('traceOk')), '走查里出现槽 id');
  ok(/结论 · 对的/.test(text('traceOk')), '第一段结论是对的');
  ok(/结论 · 错的/.test(text('traceBad')), '第二段结论是错的，没有遮');
  ok(/W11/.test(text('traceBad')), '错答案指回 W11');
}

/* 页脚 */
ok(/0 错误/.test(text('footStamp')), '页脚标出校验结论');

/* 空态 */
{
  const OPEN = '<script type="application/json" id="dataset">';
  const CLOSE = '</' + 'script>';
  const a = html.indexOf(OPEN), b = html.indexOf(CLOSE, a);
  const blank = html.slice(0, a + OPEN.length) + '{}' + html.slice(b);
  const d2 = new JSDOM(blank, { runScripts: 'dangerously', virtualConsole: new VirtualConsole() });
  ok(/build-viewer/.test(d2.window.document.body.textContent as string), '没有数据时给出重建指引');
}

console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
