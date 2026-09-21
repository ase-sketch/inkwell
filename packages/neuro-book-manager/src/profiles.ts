import type {ProfileDefinition} from "#manager/types";
import type {InstallProfile} from "@notnotype/neuro-book-contracts/installation";

const PROFILE_DEFINITIONS: Record<InstallProfile, ProfileDefinition> = {
    "source-dev": {
        profile: "source-dev",
        source: "git",
        product: "none",
        applicationRuntime: "system",
        tools: "system",
        docker: false,
    },
    "source-product": {
        profile: "source-product",
        source: "git",
        product: "build",
        applicationRuntime: "system",
        tools: "system",
        docker: false,
    },
    "product-bun": {
        profile: "product-bun",
        source: "release",
        product: "release",
        applicationRuntime: "system",
        tools: "system",
        docker: false,
    },
    "windows-portable": {
        profile: "windows-portable",
        source: "release",
        product: "release",
        applicationRuntime: "managed",
        tools: "managed",
        docker: false,
    },
    "source-docker": {
        profile: "source-docker",
        source: "git",
        product: "container",
        applicationRuntime: "container",
        tools: "container",
        docker: true,
    },
    ghcr: {
        profile: "ghcr",
        source: "container",
        product: "container",
        applicationRuntime: "container",
        tools: "container",
        docker: true,
    },
};

/** 返回不可变的 Profile 定义。 */
export function profileDefinition(profile: InstallProfile): ProfileDefinition {
    return PROFILE_DEFINITIONS[profile];
}

/** 校验 CLI Profile 字符串。 */
export function parseProfile(value: string): InstallProfile {
    if (value in PROFILE_DEFINITIONS) {
        return value as InstallProfile;
    }
    throw new Error(`不支持的安装 Profile：${value}`);
}

/** 列出 Profile 名称。 */
export function profileNames(): InstallProfile[] {
    return Object.keys(PROFILE_DEFINITIONS) as InstallProfile[];
}
