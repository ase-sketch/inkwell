import {fetchUpdateTarget} from "#manager/git";
import {resolveReleaseManifest} from "#manager/manifest-store";
import {installationRootDataPaths} from "#manager/root-locators";
import {assertManagerUpgrade} from "#manager/runtime";
import {planGitProfileUpdate, planReleaseProfileUpdate} from "#manager/update-planner";
import type {GitUpdateTarget} from "#manager/git";
import type {ProfileUpdatePlan} from "#manager/update-planner";
import type {InstallationManifest, ReleaseChannel} from "@notnotype/neuro-book-contracts/installation";
import type {ReleaseManifest} from "@notnotype/neuro-book-contracts/release";
import type {OperationEffect} from "#manager/types";
import {MANAGER_VERSION} from "#manager/version-info";
import {lt} from "semver";

export type UpdatePreflightInput = {
    root: string;
    manifest: InstallationManifest;
    version?: string;
    releaseManifest?: string;
    channel?: ReleaseChannel;
    managerExecutable: string;
};

/** `update --dry-run`与事务更新可共同消费的只读目标解析结果。 */
export type UpdatePreflightReport = {
    action: "update";
    root: string;
    profile: InstallationManifest["profile"];
    channel: ReleaseChannel;
    components: Array<"source" | "product">;
    applicationChanged: boolean;
    managerChanged: boolean;
    channelChanged: boolean;
    alreadyCurrent: boolean;
    /** dry-run展示的Effect Ledger身份；执行时补入真实路径、镜像和checkpoint结果。 */
    effects: UpdateEffectPlanItem[];
    target: {
        kind: "git";
        previousRevision: string;
        revision: string;
    } | {
        kind: "release";
        version: string;
        revision: string;
        minManagerVersion: string;
    };
};

type OperationEffectIdentity = OperationEffect extends infer TEffect
    ? TEffect extends OperationEffect ? Pick<TEffect, "kind" | "owner"> : never
    : never;

/** 不包含运行期结果字段的事务Effect计划。 */
export type UpdateEffectPlanItem = OperationEffectIdentity & {
    reason: string;
};

/** 执行与dry-run共享的完整目标解析结果。 */
export type ResolvedUpdatePreflight = ProfileUpdatePlan & {
    channel: ReleaseChannel;
    release: ReleaseManifest | null;
    gitTarget: GitUpdateTarget | null;
    effects: UpdateEffectPlanItem[];
};

/**
 * 解析真实Git或Release更新目标，但不创建Operation、staging或backup。
 * Git Profile会执行fetch，因为远端revision本身就是更新计划的必要输入。
 */
export async function inspectUpdatePreflight(input: UpdatePreflightInput): Promise<UpdatePreflightReport> {
    const resolved = await resolveUpdatePreflight(input);
    const target = resolved.gitTarget
        ? {kind: "git" as const, previousRevision: resolved.gitTarget.previousRevision, revision: resolved.gitTarget.targetRevision}
        : {
            kind: "release" as const,
            version: resolved.release!.version,
            revision: resolved.release!.sourceRevision,
            minManagerVersion: resolved.release!.minManagerVersion,
        };
    return {
        action: "update",
        root: input.root,
        profile: input.manifest.profile,
        channel: resolved.channel,
        components: [...resolved.components],
        applicationChanged: resolved.applicationChanged,
        managerChanged: resolved.managerChanged,
        channelChanged: resolved.channelChanged,
        alreadyCurrent: resolved.alreadyCurrent,
        effects: resolved.effects,
        target,
    };
}

/** 解析一次真实Git或Release目标，正式更新不得再次fetch或重新选择Release。 */
export async function resolveUpdatePreflight(input: UpdatePreflightInput): Promise<ResolvedUpdatePreflight> {
    const managerChanged = await assertManagerUpgrade(
        MANAGER_VERSION,
        input.manifest.managerVersion,
        input.manifest.components.manager.bundleSha256,
        input.managerExecutable,
    );
    const channel = input.channel ?? input.manifest.channel;
    const releaseProfile = input.manifest.profile === "product-bun"
        || input.manifest.profile === "windows-portable"
        || input.manifest.profile === "ghcr";
    if (!releaseProfile) {
        if (input.version || input.releaseManifest) {
            throw new Error(`Profile ${input.manifest.profile}使用Git revision更新，不接受--version或--release-manifest。`);
        }
        const target = await fetchUpdateTarget(input.root, undefined, installationRootDataPaths(input.manifest.roots));
        const plan = planGitProfileUpdate(input.manifest, target.targetRevision, channel, managerChanged);
        return {
            ...plan,
            channel,
            release: null,
            gitTarget: target,
            effects: planUpdateEffects(input.manifest, plan),
        };
    }

    const release = await resolveReleaseManifest(channel, input.version, input.releaseManifest);
    if (release.stateMigration.policy === "manual") {
        throw new Error(`该版本需要先按迁移说明人工处理状态数据：${release.stateMigration.guide}`);
    }
    if (lt(MANAGER_VERSION, release.minManagerVersion)) {
        const tag = channel === "stable" ? "latest" : "canary";
        throw new Error(`Manager ${MANAGER_VERSION} 低于 Release 要求 ${release.minManagerVersion}。请执行：\nbunx --bun @notnotype/neuro-book-manager@${tag} update`);
    }
    const plan = planReleaseProfileUpdate(input.manifest, release, channel, managerChanged);
    return {
        ...plan,
        channel,
        release,
        gitTarget: null,
        effects: planUpdateEffects(input.manifest, plan),
    };
}

/** 生成正式事务将使用的Effect种类；易变路径和结果只在动作前写入Journal。 */
function planUpdateEffects(manifest: InstallationManifest, plan: ProfileUpdatePlan): UpdateEffectPlanItem[] {
    if (plan.alreadyCurrent) return [];
    const effects: UpdateEffectPlanItem[] = [
        {kind: "path-create", owner: "staging", reason: "准备隔离staging"},
        {kind: "path-create", owner: "backup", reason: "预留事务backup ownership"},
        {kind: "component-switch", owner: "managed-assets", reason: "验证或升级Manager受管资产"},
    ];
    if (plan.applicationChanged) {
        const gitProfile = manifest.profile === "source-dev" || manifest.profile === "source-product" || manifest.profile === "source-docker";
        if (gitProfile) effects.push({kind: "git-fast-forward", owner: "source", reason: "健康检查通过后提交目标Git revision"});
        if (!gitProfile && plan.components.has("source")) {
            effects.push({kind: "component-switch", owner: "source", reason: "切换Release Source"});
        }
        if (plan.components.has("product") && manifest.profile !== "source-docker" && manifest.profile !== "ghcr") {
            effects.push({kind: "component-switch", owner: "product", reason: "切换原生Product"});
        }
        if (manifest.profile === "source-docker") {
            effects.push({kind: "docker-image", owner: "product", reason: "构建目标revision容器镜像"});
        }
        if (manifest.profile === "source-docker" || manifest.profile === "ghcr") {
            effects.push({kind: "compose", owner: "compose", reason: "事务切换generated Compose"});
        }
        if (plan.components.has("product")) {
            effects.push({kind: "sqlite-backup", owner: "app-sqlite", reason: "停机后checkpoint并备份App SQLite"});
        }
    }
    effects.push(
        {kind: "wrapper-switch", owner: "wrapper", reason: "刷新稳定Runtime/Tool/Manager wrapper"},
        {kind: "manifest-switch", owner: "manifest", reason: "提交已验证的Installation Manifest"},
    );
    return effects;
}
