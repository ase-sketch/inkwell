import {describe, expect, it} from "vitest";
import {
    inspectProviderConfigDocument,
    type ProviderConfigInput,
    type ProviderConfigModelInput,
} from "./provider-config-contract";

type MutableInput = {
    defaultModelKey: string | null;
    providers: Array<Omit<ProviderConfigInput, "models"> & {models: ProviderConfigModelInput[]}>;
};

/** 构造 shared Provider Config contract 的最小有效文档。 */
function validInput(): MutableInput {
    return {
        defaultModelKey: "provider/model",
        providers: [{
            id: "provider",
            enabled: true,
            modelApi: "openai-completions",
            options: {baseURL: "https://example.com/v1"},
            models: [{
                id: "model",
                enabled: true,
                api: "openai-completions",
                reasoning: false,
                input: ["text"],
                contextWindowTokens: 128_000,
                maxTokens: 8_192,
            }],
        }],
    };
}

describe("Provider Config contract", () => {
    it("Provider 默认 API 是持久化必填字段", () => {
        const input = validInput();
        input.providers[0]!.modelApi = null;

        const result = inspectProviderConfigDocument(input);

        expect(result.issues).toContainEqual(expect.objectContaining({
            code: "missing_provider_model_api",
            path: ["providers", 0, "modelApi"],
        }));
    });

    it("disabled Provider 下的重复 model ID 仍是持久化错误", () => {
        const input = validInput();
        input.providers[0]!.enabled = false;
        input.providers[0]!.models.push({...input.providers[0]!.models[0]!});

        const result = inspectProviderConfigDocument(input);

        expect(result.issues.filter((issue) => issue.code === "duplicate_model_id")).toHaveLength(2);
        expect(result.runnableModelKeys.size).toBe(0);
    });

    it("disabled Provider 下的 disabled 模型仍必须能力完整", () => {
        const input = validInput();
        input.providers[0] = {
            ...input.providers[0]!,
            enabled: false,
            models: [{
                id: "draft",
                enabled: false,
                api: null,
                reasoning: null,
                input: null,
                contextWindowTokens: null,
                maxTokens: null,
            }],
        };

        const result = inspectProviderConfigDocument(input);

        expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
            "missing_api",
            "missing_reasoning",
            "missing_input",
            "missing_context_window",
            "missing_max_tokens",
        ]));
        expect(result.runnableModelKeys.size).toBe(0);
    });

    it("重复 Provider 组全部排除 runnable，且每个原始条目都有独立路径", () => {
        const input = validInput();
        input.providers.push({...input.providers[0]!, models: [...input.providers[0]!.models]});

        const result = inspectProviderConfigDocument(input);

        expect(result.issues.filter((issue) => issue.code === "duplicate_provider_id").map((issue) => issue.path)).toEqual([
            ["providers", 0, "id"],
            ["providers", 1, "id"],
        ]);
        expect(result.runnableModelKeys.size).toBe(0);
    });
});
