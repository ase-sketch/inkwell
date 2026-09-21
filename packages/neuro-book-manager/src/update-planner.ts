import type {InstallationManifest, ReleaseChannel} from "@notnotype/neuro-book-contracts/installation";
import type {ReleaseManifest} from "@notnotype/neuro-book-contracts/release";

/** Profile应用更新的固定原子范围。 */
export type ApplicationUpdateComponent = "source" | "product";

/** Resolver完成后、事务创建前的纯更新计划。 */
export type ProfileUpdatePlan = {
    components: Set<ApplicationUpdateComponent>;
    applicationChanged: boolean;
    managerChanged: boolean;
    channelChanged: boolean;
    alreadyCurrent: boolean;
};

/** 为Release Profile生成Source + Product原子更新计划。 */
export function planReleaseProfileUpdate(
    manifest: InstallationManifest,
    release: ReleaseManifest,
    channel: ReleaseChannel,
    managerChanged: boolean,
): ProfileUpdatePlan {
    const applicationChanged = !releaseSourceCurrent(manifest, release) || !releaseProductCurrent(manifest, release);
    return completePlan(
        applicationChanged ? new Set(["source", "product"] as const) : new Set<ApplicationUpdateComponent>(),
        applicationChanged,
        channel !== manifest.channel,
        managerChanged,
    );
}

/** 为Git Source Profile生成固定原子更新计划。 */
export function planGitProfileUpdate(
    manifest: InstallationManifest,
    targetRevision: string,
    channel: ReleaseChannel,
    managerChanged: boolean,
): ProfileUpdatePlan {
    const applicationChanged = targetRevision !== manifest.sourceRevision;
    const components = new Set<ApplicationUpdateComponent>();
    if (applicationChanged) {
        components.add("source");
        if (manifest.profile !== "source-dev") components.add("product");
    }
    return completePlan(
        components,
        applicationChanged,
        channel !== manifest.channel,
        managerChanged,
    );
}

/** Release Source的revision与archive checksum均一致才视为当前组件。 */
function releaseSourceCurrent(manifest: InstallationManifest, release: ReleaseManifest): boolean {
    const source = manifest.components.source;
    if (manifest.profile === "ghcr") {
        return source.provider === "container"
            && source.version === release.version
            && source.revision === release.sourceRevision;
    }
    return source.provider === "release"
        && source.buildId === release.buildId
        && source.version === release.version
        && source.revision === release.sourceRevision
        && source.archiveSha256 === release.source.sha256;
}

/** Release Product按平台archive或GHCR digest进行不可变身份比较。 */
function releaseProductCurrent(manifest: InstallationManifest, release: ReleaseManifest): boolean {
    const product = manifest.components.product;
    if (!product) return false;
    if (manifest.profile === "ghcr") {
        return product.provider === "container"
            && product.version === release.version
            && product.revision === release.sourceRevision
            && product.image === release.ghcr.ref
            && product.digest === release.ghcr.digest;
    }
    if (product.provider !== "release") return false;
    const asset = release.products.find((item) => item.platform === product.platform);
    return Boolean(asset
        && product.buildId === release.buildId
        && product.version === release.version
        && product.revision === release.sourceRevision
        && product.archiveSha256 === asset.sha256);
}

/** 统一计算无操作语义，避免CLI/TUI自行猜测。 */
function completePlan(
    components: Set<ApplicationUpdateComponent>,
    applicationChanged: boolean,
    channelChanged: boolean,
    managerChanged: boolean,
): ProfileUpdatePlan {
    return {
        components,
        applicationChanged,
        managerChanged,
        channelChanged,
        alreadyCurrent: !applicationChanged && !managerChanged && !channelChanged,
    };
}
