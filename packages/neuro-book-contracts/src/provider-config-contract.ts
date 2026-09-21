/** NeuroBook 正式支持的 Pi API adapter。 */
export const SUPPORTED_PI_APIS = [
    "openai-completions",
    "openai-responses",
    "anthropic-messages",
    "google-generative-ai",
    "bedrock-converse-stream",
] as const;

export type SupportedPiApi = typeof SUPPORTED_PI_APIS[number];

export const PROVIDER_CONFIG_ISSUE_CODES = [
    "duplicate_provider_id",
    "duplicate_model_id",
    "missing_provider_model_api",
    "unsupported_provider_model_api",
    "missing_api",
    "unsupported_api",
    "missing_base_url",
    "missing_reasoning",
    "missing_input",
    "missing_context_window",
    "missing_max_tokens",
    "max_tokens_exceeds_context",
    "missing_default_model",
    "invalid_model_reference",
] as const;

export type ProviderConfigIssueCode = typeof PROVIDER_CONFIG_ISSUE_CODES[number];

export type ProviderConfigIssue = {
    code: ProviderConfigIssueCode;
    path: Array<string | number>;
    /** 模型字段问题或无效引用对应的模型 key；Provider 级问题为空。 */
    modelKey: string | null;
    message: string;
};

export type ProviderConfigModelInput = {
    id: string;
    enabled: boolean;
    api: string | null;
    reasoning: boolean | null;
    input: readonly string[] | null;
    contextWindowTokens: number | null;
    maxTokens: number | null;
};

export type ProviderConfigInput = {
    id: string;
    enabled: boolean;
    modelApi: string | null;
    options: {baseURL: string};
    models: readonly ProviderConfigModelInput[];
};

export type ModelSettingsContractInput = {
    defaultModelKey: string | null;
    providers: readonly ProviderConfigInput[];
};

export type ModelReferenceInput = {
    modelKey: string | null;
    path: Array<string | number>;
    label: string;
};

export type ProviderConfigInspection = {
    issues: ProviderConfigIssue[];
    runnableModelKeys: Set<string>;
};

/** 判断值是否属于 NeuroBook 正式支持的 Pi API adapter。 */
export function isSupportedPiApi(value: string | null | undefined): value is SupportedPiApi {
    return typeof value === "string" && SUPPORTED_PI_APIS.some((api) => api === value);
}

/**
 * 校验单个模型能力快照，不检查 Provider Base URL。
 * Discovery/Catalog 草稿和 runtime 校验共用该 Interface。
 */
export function inspectModelCapability(
    providerId: string,
    model: ProviderConfigModelInput,
    modelPath: Array<string | number> = ["providers", providerId, "models", model.id],
): ProviderConfigIssue[] {
    const modelKey = `${providerId}/${model.id}`;
    const issues: ProviderConfigIssue[] = [];
    const api = model.api?.trim() ?? "";

    if (!api) {
        issues.push(issue("missing_api", [...modelPath, "api"], modelKey, `模型 ${modelKey} 缺少 Pi API。`));
    } else if (!isSupportedPiApi(api)) {
        issues.push(issue("unsupported_api", [...modelPath, "api"], modelKey, `模型 ${modelKey} 的 Pi API“${api}”不受支持。`));
    }
    if (typeof model.reasoning !== "boolean") {
        issues.push(issue("missing_reasoning", [...modelPath, "reasoning"], modelKey, `模型 ${modelKey} 必须明确 reasoning 能力。`));
    }
    if (!model.input?.length) {
        issues.push(issue("missing_input", [...modelPath, "input"], modelKey, `模型 ${modelKey} 必须声明输入能力。`));
    }
    if (!isPositiveInteger(model.contextWindowTokens)) {
        issues.push(issue("missing_context_window", [...modelPath, "contextWindowTokens"], modelKey, `模型 ${modelKey} 缺少有效的 contextWindowTokens。`));
    }
    if (!isPositiveInteger(model.maxTokens)) {
        issues.push(issue("missing_max_tokens", [...modelPath, "maxTokens"], modelKey, `模型 ${modelKey} 缺少有效的 maxTokens。`));
    }
    if (isPositiveInteger(model.contextWindowTokens) && isPositiveInteger(model.maxTokens) && model.maxTokens > model.contextWindowTokens) {
        issues.push(issue("max_tokens_exceeds_context", [...modelPath, "maxTokens"], modelKey, `模型 ${modelKey} 的 maxTokens 不能大于 contextWindowTokens。`));
    }
    return issues;
}

/** 校验单个模型的完整运行条件。 */
export function inspectRunnableModel(provider: ProviderConfigInput, model: ProviderConfigModelInput): ProviderConfigIssue[] {
    const issues = inspectModelCapability(provider.id, model);
    if (isSupportedPiApi(model.api) && model.api !== "bedrock-converse-stream" && !provider.options.baseURL.trim()) {
        issues.push(issue(
            "missing_base_url",
            ["providers", provider.id, "options", "baseURL"],
            `${provider.id}/${model.id}`,
            `模型 ${provider.id}/${model.id} 缺少 Provider Base URL。`,
        ));
    }
    return issues;
}

/**
 * 校验原始 Provider Config 文档，并返回当前真正可运行的模型 key。
 *
 * 该函数必须在数组转 runtime Record 前调用：Provider/model 唯一性和模型能力完整性
 * 与 enabled 无关；enabled 只决定模型是否进入 runnable key 集合。
 */
export function inspectProviderConfigDocument(input: ModelSettingsContractInput): ProviderConfigInspection {
    const issues: ProviderConfigIssue[] = [];
    const runnableModelKeys = new Set<string>();
    const providerCounts = countValues(input.providers.map((provider) => provider.id.trim()));

    for (const [providerIndex, provider] of input.providers.entries()) {
        const providerId = provider.id.trim();
        const providerPath = ["providers", providerIndex];
        const providerDuplicated = (providerCounts.get(providerId) ?? 0) > 1;
        if (providerDuplicated) {
            issues.push(issue("duplicate_provider_id", [...providerPath, "id"], null, `Provider ID 重复：${providerId}`));
        }

        const providerModelApi = provider.modelApi?.trim() ?? "";
        if (!providerModelApi) {
            issues.push(issue(
                "missing_provider_model_api",
                [...providerPath, "modelApi"],
                null,
                `Provider ${providerId} 缺少必填的默认 Pi API。`,
            ));
        } else if (!isSupportedPiApi(providerModelApi)) {
            issues.push(issue(
                "unsupported_provider_model_api",
                [...providerPath, "modelApi"],
                null,
                `Provider ${providerId} 的默认 Pi API“${providerModelApi}”不受支持。`,
            ));
        }

        const modelCounts = countValues(provider.models.map((model) => model.id.trim()));
        const duplicateModelIds = new Set([...modelCounts.entries()].filter(([, count]) => count > 1).map(([modelId]) => modelId));

        for (const [modelIndex, model] of provider.models.entries()) {
            const modelId = model.id.trim();
            if (duplicateModelIds.has(modelId)) {
                issues.push(issue(
                    "duplicate_model_id",
                    [...providerPath, "models", modelIndex, "id"],
                    `${providerId}/${modelId}`,
                    `Provider ${providerId} 下模型 ID 重复：${modelId}`,
                ));
            }
        }

        const runnableCandidates = provider.models.filter((model) => provider.enabled && model.enabled && !duplicateModelIds.has(model.id.trim()));
        const needsBaseUrl = runnableCandidates.some((model) => isSupportedPiApi(model.api) && model.api !== "bedrock-converse-stream");
        const baseUrlMissing = needsBaseUrl && !provider.options.baseURL.trim();
        if (baseUrlMissing) {
            issues.push(issue("missing_base_url", [...providerPath, "options", "baseURL"], null, `Provider ${providerId} 缺少 Base URL。`));
        }

        for (const [modelIndex, model] of provider.models.entries()) {
            const modelId = model.id.trim();
            if (duplicateModelIds.has(modelId)) {
                continue;
            }
            const modelIssues = inspectModelCapability(providerId, model, [...providerPath, "models", modelIndex]);
            issues.push(...modelIssues);
            if (!provider.enabled || providerDuplicated || !model.enabled) {
                continue;
            }
            const modelNeedsBaseUrl = isSupportedPiApi(model.api) && model.api !== "bedrock-converse-stream";
            if (modelIssues.length === 0 && (!modelNeedsBaseUrl || !baseUrlMissing)) {
                runnableModelKeys.add(`${providerId}/${modelId}`);
            }
        }
    }

    return {issues: dedupeIssues(issues), runnableModelKeys};
}

/** 按给定 runnable key 校验默认模型或 Profile 等显式模型引用。 */
export function inspectModelReferences(
    runnableModelKeys: ReadonlySet<string>,
    references: readonly ModelReferenceInput[],
): ProviderConfigIssue[] {
    const issues: ProviderConfigIssue[] = [];
    for (const reference of references) {
        const modelKey = reference.modelKey?.trim() ?? "";
        if (!modelKey) {
            continue;
        }
        if (!runnableModelKeys.has(modelKey)) {
            issues.push(issue("invalid_model_reference", reference.path, modelKey, `${reference.label} ${modelKey} 当前不可运行。`));
        }
    }
    return dedupeIssues(issues);
}

/**
 * 校验完整 Model Settings：Provider Config 文档、默认模型和调用方显式引用。
 * Provider Config 保存、runtime 与前端草稿共用该深 Module 的同一个 Interface。
 */
export function inspectModelSettings(
    input: ModelSettingsContractInput,
    references: readonly ModelReferenceInput[] = [],
): ProviderConfigInspection {
    const inspection = inspectProviderConfigDocument(input);

    const defaultReference: ModelReferenceInput = {
        modelKey: input.defaultModelKey,
        path: ["defaultModelKey"],
        label: "默认模型",
    };
    const referenceIssues = inspectModelReferences(inspection.runnableModelKeys, [defaultReference, ...references]);
    if (!input.defaultModelKey?.trim() && inspection.runnableModelKeys.size > 0) {
        referenceIssues.unshift(issue("missing_default_model", defaultReference.path, null, "存在可运行模型时，必须指定默认模型。"));
    }

    return {
        issues: dedupeIssues([...inspection.issues, ...referenceIssues]),
        runnableModelKeys: inspection.runnableModelKeys,
    };
}

/** Model Library 补全时选择最终模型 API；候选或模板必须提供明确的受支持值。 */
export function selectModelApi(modelApi: string | null, templateApi: string | null): SupportedPiApi | null {
    if (isSupportedPiApi(modelApi)) {
        return modelApi;
    }
    if (isSupportedPiApi(templateApi)) {
        return templateApi;
    }
    return null;
}

function issue(code: ProviderConfigIssueCode, path: Array<string | number>, modelKey: string | null, message: string): ProviderConfigIssue {
    return {code, path, modelKey, message};
}

function isPositiveInteger(value: number | null): value is number {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function countValues(values: string[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const value of values) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return counts;
}

function dedupeIssues(issues: ProviderConfigIssue[]): ProviderConfigIssue[] {
    const seen = new Set<string>();
    return issues.filter((item) => {
        const key = `${item.code}:${item.modelKey ?? ""}:${item.path.join(".")}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
