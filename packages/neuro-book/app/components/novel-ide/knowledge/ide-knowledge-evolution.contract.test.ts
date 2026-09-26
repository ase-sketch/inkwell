import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import zhCN from "nbook/app/i18n/locales/zh-CN";
import enUS from "nbook/app/i18n/locales/en-US";

/**
 * 「演进」区块的接线契约（M5）。
 *
 * .vue 进不了 vitest（仓内没有 plugin-vue），所以组件「把哪块数据接到哪个出口」只能对源码断言。
 * 投影口径本身由 knowledge-evolution.test.ts 直测；这里只盯接线：
 * 详情把条目路径与 Project 交下去、区块把归因点击转成跳转事件、宿主页面接住它去开会话。
 */

async function readSource(relative: string): Promise<string> {
  const path = fileURLToPath(new URL(relative, import.meta.url));
  return (await readFile(path, "utf-8")).replace(/\r\n/g, "\n");
}

/** 宿主页面在另一棵目录树里；用 vitest 的包根定位，别数相对层级。 */
async function readPage(): Promise<string> {
  // Windows 上 fileURLToPath 给的是反斜杠，先归一成正斜杠再切目录。
  const here = fileURLToPath(new URL("./", import.meta.url)).replace(/\\/g, "/");
  const appRoot = here.slice(0, here.indexOf("/app/") + "/app/".length);
  return (await readFile(`${appRoot}pages/index.vue`, "utf-8")).replace(/\r\n/g, "\n");
}

describe("IdeKnowledgeEvolution · 区块接线", () => {
  it("时间线从服务端的演进接口来，差异按条目编号逐条取", async () => {
    const source = await readSource("./IdeKnowledgeEvolution.vue");

    expect(source).toContain("useWorkspaceHistoryTimeline(");
    expect(source).toContain("evolutionRows(entries.value, translate, now.value)");
    // 差异请求带条目编号，且只在展开那一条时才发。
    expect(source).toContain("loadDiff(row.entryId");
    expect(source).toContain("expandedEntryId.value === row.entryId");
  });

  it("行渲染拆成时间 / 归因 / 操作三个出口，可展开时才给展开按钮", async () => {
    const source = await readSource("./IdeKnowledgeEvolution.vue");

    expect(source).toContain('data-role="ide-knowledge-evolution-time"');
    expect(source).toContain('data-role="ide-knowledge-evolution-actor"');
    expect(source).toContain('data-role="ide-knowledge-evolution-operation"');
    expect(source).toContain('data-role="ide-knowledge-evolution-toggle"');
    // 快照不可取的条目不给展开入口（row.expandable 由投影层判定）。
    expect(source).toContain('v-if="row.expandable"');
    expect(source).toContain("if (!row.expandable)");
  });

  it("归因可点才渲染成按钮，点了发跳转事件", async () => {
    const source = await readSource("./IdeKnowledgeEvolution.vue");

    expect(source).toContain('v-if="row.actor.clickable"');
    expect(source).toContain('data-role="ide-knowledge-evolution-actor-static"');
    expect(source).toContain('emit("jump-session", actor.sessionId)');
    expect(source).toContain("if (actor.sessionId !== null)");
  });

  it("差异区的确定高度落在包裹层，不写在编辑器自己身上（高度塌陷回归）", async () => {
    const source = await readSource("./IdeKnowledgeEvolution.vue");
    const viewportAt = source.indexOf('data-role="ide-knowledge-evolution-diff-viewport"');
    expect(viewportAt).toBeGreaterThan(-1);

    // 包裹层：定高 + min-h-0 + flex 容器，编辑器才能 height:100% 填满。
    const wrapper = source.slice(source.lastIndexOf("<div", viewportAt), source.indexOf(">", viewportAt));
    expect(wrapper).toContain("h-[320px]");
    expect(wrapper).toContain("min-h-0");
    expect(wrapper).toContain("flex");

    // SharedDiffEditor 自带 .shared-diff-editor{height:100%} 的 scoped 规则特异性高于工具类，
    // 在它身上写定高会被压掉、父层又没高度 → 塌成 0px。所以只许它填满包裹层。
    const editorAt = source.indexOf("<SharedDiffEditor", viewportAt);
    expect(editorAt).toBeGreaterThan(viewportAt);
    const editorTag = source.slice(editorAt, source.indexOf("/>", editorAt));
    expect(editorTag).toContain("flex-1");
    expect(editorTag).toContain("min-h-0");
    expect(editorTag).not.toContain("h-[320px]");
  });

  it("四类差异状态各有说法，不把安全分支说成「加载失败」", async () => {
    const source = await readSource("./IdeKnowledgeEvolution.vue");

    expect(source).toContain('t("ide.knowledge.evolution.diffTooLarge")');
    expect(source).toContain('t("ide.knowledge.evolution.diffBlocked")');
    expect(source).toContain('t("ide.knowledge.evolution.diffUnavailable")');
    expect(source).toContain('t("ide.knowledge.evolution.diffFailed")');
    // 差异呈现复用收件箱那套编辑器。
    expect(source).toContain("SharedDiffEditor");
  });
});

describe("IdeKnowledgeDetail · 演进区块挂在履历之后", () => {
  it("详情把条目路径与 Project 交给演进区块，并转出跳转事件", async () => {
    const source = await readSource("./IdeKnowledgeDetail.vue");

    expect(source).toContain('import IdeKnowledgeEvolution from "nbook/app/components/novel-ide/knowledge/IdeKnowledgeEvolution.vue"');
    expect(source).toContain("const evolutionPath = computed(() => props.entry.path");
    expect(source).toContain(':entry-path="evolutionPath"');
    expect(source).toContain(':project-root="props.projectRoot"');
    // 没有 Project（用户资产模式）时整块不渲染。
    expect(source).toContain('v-if="props.projectRoot"');
    expect(source).toContain(`@jump-session="emit('jump-session', $event)"`);
    // 位置：挂在「登场与履历」区块之后（用子组件标签在模板里的位置判定）。
    const historyAt = source.indexOf('data-role="ide-knowledge-detail-history"');
    const evolutionAt = source.indexOf("<IdeKnowledgeEvolution");
    expect(historyAt).toBeGreaterThan(-1);
    expect(evolutionAt).toBeGreaterThan(historyAt);
  });
});

describe("知识库主视图与宿主页面 · 跳转链路", () => {
  it("主视图把 Project 与主题透给详情，并把跳转事件转给宿主", async () => {
    const source = await readSource("./IdeKnowledgeView.vue");

    expect(source).toContain("const {currentProjectRoot, loadingWorkspaceTree, workspaceTree, theme} = storeToRefs(store)");
    expect(source).toContain(':project-root="currentProjectRoot"');
    expect(source).toContain(':theme="theme"');
    expect(source).toContain(`@jump-session="emit('jump-session', $event)"`);
  });

  it("宿主页面接住跳转事件，走既有的开会话入口", async () => {
    const page = await readPage();

    expect(page).toContain('@jump-session="void showAgentSession($event)"');
    // 既有入口就是它：切回对话面 + 选中会话，不另起一条并行路径。
    expect(page).toContain("async function showAgentSession(sessionId: number): Promise<void> {");
    expect(page).toContain("await surface.selectSession(sessionId);");
  });
});

describe("演进区块 · i18n 成对", () => {
  it("区块用到的 key 在中英两边都登记了", async () => {
    const source = await readSource("./IdeKnowledgeEvolution.vue");
    const keys = [...source.matchAll(/t\(["'](ide\.knowledge\.evolution\.[A-Za-z0-9_]+)["']/g)].map((match) => match[1]!);

    expect(keys.length).toBeGreaterThan(0);

    const zhEvolution = (zhCN as {ide: {knowledge: {evolution: Record<string, string>}}}).ide.knowledge.evolution;
    const enEvolution = (enUS as {ide: {knowledge: {evolution: Record<string, string>}}}).ide.knowledge.evolution;

    for (const key of new Set(keys)) {
      const short = key.slice("ide.knowledge.evolution.".length);
      expect(zhEvolution[short], `zh-CN 缺 ${key}`).toBeTruthy();
      expect(enEvolution[short], `en-US 缺 ${key}`).toBeTruthy();
    }

    expect(Object.keys(zhEvolution).sort()).toEqual(Object.keys(enEvolution).sort());
  });
});
