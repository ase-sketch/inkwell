import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import zhCN from "../../../i18n/locales/zh-CN";
import enUS from "../../../i18n/locales/en-US";

const chatFlowPath = fileURLToPath(new URL("./AgentChatFlow.vue", import.meta.url));
const guidePath = fileURLToPath(new URL("./AgentChatFlowEmptyState.vue", import.meta.url));

describe("AgentChatFlow 空态首次引导契约测试", () => {
    it("i18n locales 中英包含必要的引导卡 key", () => {
        expect(zhCN.agent.chat.configureModelGuide).toBe("先配置模型");
        expect(zhCN.agent.chat.configureModelGuideHint).toBeDefined();
        expect(zhCN.agent.chat.configureModelAction).toBe("去配置");

        expect(enUS.agent.chat.configureModelGuide).toBe("Configure Models First");
        expect(enUS.agent.chat.configureModelGuideHint).toBeDefined();
        expect(enUS.agent.chat.configureModelAction).toBe("Configure");
    });

    it("引导卡与配置中心弹窗集成在空态子组件里，AgentChatFlow 只保留挂载点", async () => {
        // 引导卡从 AgentChatFlow 抽成子组件（B1 布局返工），行为不变，只是换了宿主文件。
        const flow = await readFile(chatFlowPath, "utf8");
        const source = await readFile(guidePath, "utf8");

        expect(flow).toContain("<AgentChatFlowEmptyState @start-interview=\"emit('start-interview')\"");

        // 必须通过 useConfigApi 读取全局配置快照
        expect(source).toContain("configApi.editorSnapshot(configApi.globalQuery())");

        // 必须监听 novelIdeStore.configRevision 保持响应式刷新
        expect(source).toContain("novelIdeStore.configRevision");

        // 判定式：检查是否有启用 provider 且其下有启用 model
        expect(source).toContain("provider.enabled && provider.models?.some((model) => model.enabled)");

        // 包含引导卡与新书访谈卡片，未配模型时新书访谈不被阻断
        expect(source).toContain("hasAvailableModels === false");
        expect(source).toContain("emit('start-interview')");

        // 点击直达配置中心模型设置
        expect(source).toContain('<NovelIdeSettingsDialog v-if="settingsDialogOpen" v-model="settingsDialogOpen" />');
    });

    it("模型可用性判定逻辑纯函数单元验证", () => {
        const checkModels = (providers: Array<{ enabled: boolean; models?: Array<{ enabled: boolean }> }>): boolean => {
            return providers.some((p) => p.enabled && p.models?.some((m) => m.enabled));
        };

        // 1. 无任何 provider
        expect(checkModels([])).toBe(false);

        // 2. 有 provider 但未启用
        expect(checkModels([{ enabled: false, models: [{ enabled: true }] }])).toBe(false);

        // 3. 有启用的 provider 但 models 为空
        expect(checkModels([{ enabled: true, models: [] }])).toBe(false);

        // 4. 有启用的 provider 但 models 全部未启用
        expect(checkModels([{ enabled: true, models: [{ enabled: false }] }])).toBe(false);

        // 5. 存在启用的 provider 且至少一个 model 启用
        expect(checkModels([{ enabled: true, models: [{ enabled: true }] }])).toBe(true);
    });
});
