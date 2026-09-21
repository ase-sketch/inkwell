/**
 * 无头冒烟测试：把 beats-viewer.html 在 jsdom 里跑起来，断言拆分渲染与内置校验。
 *
 *   node .agents/works/w00005-novel-understanding-spike/tasks/t02-novel-memory-model-design/scripts/smoke-beats-viewer.ts
 *
 * 必须用 node 跑，不能用 bun：bun 的 vm 实现与 jsdom 冲突
 * （Proxy is not allowed in the global prototype chain）。
 *
 * 覆盖：空态、内联注入两份输入后的渲染、Beat 卡片数、场分组、场外分组、
 *       类型与来源芯片、内置校验器在正确数据上全绿、在人为破坏的数据上能报错、
 *       过滤与搜索是否真的减少卡片。
 * 不覆盖：视觉呈现、字体、布局、拖放、真实浏览器行为。这些要单独的浏览器人工验收授权。
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROSE = join(
  root, '..', 't01-novel-understanding-spike', 'evidences',
  'chapter-001-source-normalized.txt',
);
const BEATS = join(root, 'evidences', 'chapter-01-beats.json');

let failed = 0;
const ok = (cond: unknown, label: string, detail = '') => {
  if (cond) console.log(`  pass  ${label}${detail ? '  · ' + detail : ''}`);
  else { failed++; console.log(`  FAIL  ${label}${detail ? '  · ' + detail : ''}`); }
};

const shell = readFileSync(join(root, 'beats-viewer.html'), 'utf8');

/** 把正文与 beats 内联进页面的两个 embedded 槽，再在 jsdom 里跑起来 */
function load(prose: string | null, beats: string | null) {
  let html = shell;
  if (beats !== null) {
    html = html.replace(
      '<script type="application/json" id="embedded-beats"></script>',
      `<script type="application/json" id="embedded-beats">${beats}</script>`,
    );
  }
  if (prose !== null) {
    html = html.replace(
      '<script type="text/plain"       id="embedded-prose"></script>',
      `<script type="text/plain" id="embedded-prose">${prose}</script>`,
    );
  }
  const errors: string[] = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: vc });
  return { dom, win: dom.window as any, doc: dom.window.document as any, errors };
}

const proseRaw = readFileSync(PROSE, 'utf8');
const beatsRaw = readFileSync(BEATS, 'utf8');
const data = JSON.parse(beatsRaw);
const paraCount = proseRaw.replace(/\r/g, '').replace(/\n+$/, '').split('\n').length;

/* ═══ 空态 ═══════════════════════════════════════════════ */
console.log('beats-viewer.html · 空态');
{
  const { doc, errors } = load(null, null);
  ok(errors.length === 0, '脚本无未捕获异常', errors.join(' | '));
  ok(/载入一章的拆分/.test(doc.getElementById('main').textContent), '显示载入指引');
  ok(doc.getElementById('overview').style.display === 'none', '概览条隐藏');
  ok(doc.getElementById('vbadge').textContent === '未载入', '校验徽章为未载入');
  ok(doc.querySelectorAll('.beat').length === 0, '没有 Beat 卡片');
}

/* ═══ 只有 beats，没有正文 ═══════════════════════════════ */
console.log('\nbeats-viewer.html · 只载入 beats');
{
  const { doc, errors } = load(null, beatsRaw);
  ok(errors.length === 0, '脚本无未捕获异常', errors.join(' | '));
  ok(doc.querySelectorAll('.beat').length === data.beats.length,
     `渲染出全部 ${data.beats.length} 个 Beat`);
  ok(doc.querySelectorAll('.prose').length === 0, '没有正文时不渲染正文区');
  ok(/未载入正文/.test(doc.getElementById('chapLabel').textContent), '标题上标出未载入正文');
  ok(doc.getElementById('vbadge').className.includes('ok'), '仍能给出校验结论');
}

/* ═══ 两份都载入 ═════════════════════════════════════════ */
console.log('\nbeats-viewer.html · 正文 + beats');
const full = load(proseRaw, beatsRaw);
{
  const { doc, win, errors } = full;
  ok(errors.length === 0, '脚本无未捕获异常', errors.join(' | '));

  const cards = doc.querySelectorAll('.beat');
  ok(cards.length === data.beats.length, `Beat 卡片 ${cards.length} 个`, `期望 ${data.beats.length}`);

  // 正文行数 = 全部段数，且每一行的编号与 Beat 区间对得上
  const lines = doc.querySelectorAll('.pline');
  ok(lines.length === paraCount, `正文渲染 ${lines.length} 行`, `正文共 ${paraCount} 段`);
  const nums = [...lines].map((l: any) => Number(l.querySelector('.pnum').textContent));
  ok(nums.every((n, i) => n === i + 1), '段号连续且从 1 开始');

  // 第 5 段的正文必须真的出现在 B02 卡片里
  const b02 = doc.getElementById('beat-B02');
  ok(b02 && /【姓名。】/.test(b02.textContent), 'B02 卡片含第 5 段原文');

  // 场分组
  const sceneHeads = doc.querySelectorAll('.scene-h');
  ok(sceneHeads.length === data.scenes.length + 1,
     `场分组 ${sceneHeads.length} 组`, `${data.scenes.length} 条场记录 + 1 组场外`);
  ok(/场外/.test(doc.querySelector('.scene-h').textContent), '第一组是场外（副文本 B01）');

  // SC1 与 SC3 共享时刻，标题上都要出现 M_a
  const heads = [...sceneHeads].map((h: any) => h.textContent);
  ok(heads.filter(t => /M_a/.test(t)).length === 2, 'SC1 与 SC3 都标着 M_a（同一场戏被回述打断）');
  ok(heads.some(t => /M_b/.test(t)), 'SC2 标着 M_b');
  // v4 第 5.7.2 节：相对时间词不许当 label，所以「五分钟前」只能出现在时刻关系里，不能当 M_b 的名字
  ok(data.moments.every((m: any) => !m.label), '所有时刻的 label 都是空的（第一章没有绝对时间词）');
  ok(!heads.some(t => /五分钟前/.test(t)), '场标题上没有「五分钟前」——它是相对词，只能进关系');

  /* 时刻关系：新形状是 锚点 + 偏移，锚点为空表示叙述当下 */
  const sideTxt0 = doc.getElementById('side').textContent;
  ok(/5分钟/.test(sideTxt0), '侧栏里能看到 5 分钟这条偏移');
  ok(/叙述当下/.test(sideTxt0), '锚点渲染成「叙述当下」而不是某个时刻 id');
  ok(/第 29 段/.test(sideTxt0), '第 29 段「两分钟前」那条关系也在');
  ok(data.momentRelations.every((r: any) => r.anchor === null || r.anchor.type === 'moment'),
     '所有关系的锚点要么为空（叙述当下）要么显式指向时刻');
  ok(data.momentRelations.every((r: any) => r.source && r.source.channel),
     '每条时刻关系都带来源（规则 6：时间指示不得脱离来源）');
  ok(!JSON.stringify(data).includes('momentOffset'), 'v3 的 momentOffset 形状已经不在数据里');
  ok(!JSON.stringify(data).includes('approx'), 'v3 的 approx 字段已删（精度由单位承担）');

  /* 没有 Beat 停在上面的时刻也要列出来（v4 第 5.7.2 节：时刻集合比场集合大） */
  const usedM = new Set(data.beats.map((b: any) => b.moment).filter(Boolean));
  const unused = data.moments.filter((m: any) => !usedM.has(m.id));
  ok(unused.length > 0, `有 ${unused.length} 个时刻没有任何 Beat 停在上面`, unused.map((m: any) => m.id).join('、'));
  for (const m of unused)
    ok(new RegExp(m.id).test(sideTxt0), `未被占用的时刻 ${m.id} 仍然出现在侧栏`);
  ok(/无 Beat/.test(sideTxt0), '未被占用的时刻标着「无 Beat」');

  /* 两个挂钩，一种节点（v4 第 5.7.3 节）：
     M_nightshifts 不是任何 Beat 停在的地方，它是 B05 产生的披露指过去的时刻。
     B05 本身停在 M_b。这一条是这一章唯一的实物证据，别让它被顺手删掉。 */
  ok(data.moments.some((m: any) => m.id === 'M_nightshifts'), '数据里有 M_nightshifts');
  ok(!usedM.has('M_nightshifts'), 'M_nightshifts 上没有 Beat 停着');
  ok(data.beats.find((b: any) => b.id === 'B05')?.moment === 'M_b', 'B05 停在 M_b，不是 M_nightshifts');
  ok(unused.some((m: any) => m.id === 'M_nightshifts'), 'M_nightshifts 在「无 Beat」那一组里');

  /* 全章唯一一条锚点写死的关系：M_nightshifts 早于 M_b */
  const anchored = data.momentRelations.filter((r: any) => r.anchor);
  ok(anchored.length === 1, `锚点写死的关系有 ${anchored.length} 条`, '其余都锚在叙述当下');
  ok(anchored[0].subject === 'M_nightshifts' && anchored[0].anchor.ref === 'M_b',
     '那一条是 M_nightshifts 早于 M_b');
  ok(anchored[0].offset === null, '它没有偏移——文本只说了先后，没说差多久');

  // 类型徽章：四种类型都要出现
  const body = doc.body.textContent;
  for (const zh of ['故事外', '叙事', '描写', '说明']) ok(body.includes(zh), `类型「${zh}」出现`);

  // 来源芯片：正文里出现的五个通道都要出现
  for (const zh of ['叙述者', '角色说出口', '角色心里想', '系统通知', '作者'])
    ok(body.includes(zh), `来源通道「${zh}」出现`);

  // 视角漂移
  ok(doc.querySelectorAll('.tag.drift').length === (data.scenes.find((s: any) => s.povDrift)?.povDrift.length ?? 0),
     '视角漂移标记数与数据一致');

  // 概览条
  ok(doc.getElementById('overview').style.display !== 'none', '概览条可见');
  ok(doc.querySelectorAll('#ovBeats .ov-cell').length === data.beats.length, '概览条每个 Beat 一格');
  ok(doc.querySelectorAll('#ovScenes .ov-scene').length === data.scenes.length, '场轨道每条场一段');

  // 内置校验全绿
  ok(doc.querySelectorAll('.vitem.bad').length === 0, '内置校验没有不通过项');
  ok(doc.getElementById('vbadge').textContent === '校验通过', '校验徽章为通过');
  const vtext = doc.getElementById('side').textContent;
  for (const frag of ['无空隙', '无重叠', `覆盖全章 1–${paraCount} 段`])
    ok(vtext.includes(frag), `校验项「${frag}」`);

  // 统计
  ok(vtext.includes(String(paraCount)), '统计里有总段数');

  /* 交互：关掉「叙事」类型，卡片必须减少 */
  const before = doc.querySelectorAll('.beat').length;
  const cb = [...doc.querySelectorAll('input[data-f=type]')].find((x: any) => x.value === 'narrative') as any;
  cb.checked = false;
  cb.dispatchEvent(new win.Event('change', { bubbles: true }));
  const after = doc.querySelectorAll('.beat').length;
  const narr = data.beats.filter((b: any) => b.type === 'narrative').length;
  ok(after === before - narr, `关掉叙事后剩 ${after} 个`, `${before} - ${narr}`);
  cb.checked = true;
  cb.dispatchEvent(new win.Event('change', { bubbles: true }));
  ok(doc.querySelectorAll('.beat').length === before, '打开后恢复');

  /* 交互：搜索 */
  const q = doc.getElementById('q');
  q.value = '墨丘利秘典';
  q.dispatchEvent(new win.Event('input', { bubbles: true }));
  const hits = doc.querySelectorAll('.beat').length;
  ok(hits > 0 && hits < before, `搜「墨丘利秘典」命中 ${hits} 个 Beat`);
  ok(doc.querySelectorAll('mark').length > 0, '命中处有高亮');
  q.value = '';
  q.dispatchEvent(new win.Event('input', { bubbles: true }));
  ok(doc.querySelectorAll('.beat').length === before, '清空搜索后恢复');

  /* 交互：关掉正文 */
  const bt = doc.getElementById('btnText');
  bt.dispatchEvent(new win.Event('click', { bubbles: true }));
  ok(doc.querySelectorAll('.pline').length === 0, '关掉正文后不渲染正文行');
  bt.dispatchEvent(new win.Event('click', { bubbles: true }));
  ok(doc.querySelectorAll('.pline').length === paraCount, '打开后恢复');
}

/* ═══ 校验器要能真的报错 ═════════════════════════════════ */
console.log('\nbeats-viewer.html · 内置校验器对坏数据');
{
  // 挖一个空隙：把 B03 的起点往后挪一段
  const broken = JSON.parse(beatsRaw);
  broken.beats[2].paragraphs = [10, 12];
  const { doc } = load(proseRaw, JSON.stringify(broken));
  ok(doc.querySelectorAll('.vitem.bad').length > 0, '挖出空隙后有不通过项');
  ok(/有空隙/.test(doc.getElementById('side').textContent), '报出「有空隙」');
  ok(doc.getElementById('vbadge').className.includes('bad'), '徽章转红');
}
{
  // 制造重叠
  const broken = JSON.parse(beatsRaw);
  broken.beats[2].paragraphs = [8, 12];
  const { doc } = load(proseRaw, JSON.stringify(broken));
  ok(/有重叠/.test(doc.getElementById('side').textContent), '报出「有重叠」');
}
{
  // 未知类型与未知通道
  const broken = JSON.parse(beatsRaw);
  broken.beats[1].type = 'monologue';
  broken.beats[1].sources[0].channel = 'ghost';
  const { doc } = load(proseRaw, JSON.stringify(broken));
  const t = doc.getElementById('side').textContent;
  ok(/未知类型/.test(t), '报出未知类型');
  ok(/未知来源通道/.test(t), '报出未知来源通道');
}
{
  // 场内混入别的时刻：把 B10 的时刻改成 M_b，它落在 SC3 里
  const broken = JSON.parse(beatsRaw);
  broken.beats.find((b: any) => b.id === 'B10').moment = 'M_b';
  const { doc } = load(proseRaw, JSON.stringify(broken));
  ok(/场内混入了别的时刻/.test(doc.getElementById('side').textContent),
     '报出场内异时刻（v4 第 3.5 节：区间内只允许无时刻的 Beat）');
}
{
  // 时刻引用不存在
  const broken = JSON.parse(beatsRaw);
  broken.beats.find((b: any) => b.id === 'B10').moment = 'M_zzz';
  const { doc } = load(proseRaw, JSON.stringify(broken));
  ok(/时刻引用不存在/.test(doc.getElementById('side').textContent), '报出时刻引用不存在');
}
{
  // 正文比 beats 短：覆盖检查必须发现
  const short = proseRaw.replace(/\r/g, '').split('\n').slice(0, 40).join('\n');
  const { doc } = load(short, beatsRaw);
  ok(/覆盖到第 77 段，正文共 40 段/.test(doc.getElementById('side').textContent),
     '正文段数与覆盖范围不符时报错');
}
{
  // 时刻关系的主语指向不存在的时刻
  const broken = JSON.parse(beatsRaw);
  broken.momentRelations[0].subject = 'M_zzz';
  const { doc } = load(proseRaw, JSON.stringify(broken));
  ok(/主语 M_zzz 不是已知时刻/.test(doc.getElementById('side').textContent), '报出时刻关系主语悬空');
}
{
  // 显式锚点指向不存在的时刻
  const broken = JSON.parse(beatsRaw);
  broken.momentRelations[1].anchor = { type: 'moment', ref: 'M_zzz' };
  const { doc } = load(proseRaw, JSON.stringify(broken));
  ok(/锚点 M_zzz 不是已知时刻/.test(doc.getElementById('side').textContent), '报出时刻关系锚点悬空');
}
{
  // 时刻关系缺来源，违反规则 6
  const broken = JSON.parse(beatsRaw);
  delete broken.momentRelations[0].source;
  const { doc } = load(proseRaw, JSON.stringify(broken));
  ok(/缺来源或通道未知/.test(doc.getElementById('side').textContent),
     '报出时刻关系缺来源（规则 6：时间指示不得脱离来源）');
}
{
  // 未知谓词与越界的叙述位置
  const broken = JSON.parse(beatsRaw);
  broken.momentRelations[0].predicate = 'sortof';
  broken.momentRelations[1].at = 999;
  const { doc } = load(proseRaw, JSON.stringify(broken));
  const t = doc.getElementById('side').textContent;
  ok(/未知谓词 sortof/.test(t), '报出未知谓词');
  ok(/叙述位置 999 越界/.test(t), '报出时刻关系的叙述位置越界');
}

console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
