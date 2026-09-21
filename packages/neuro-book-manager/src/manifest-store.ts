import {PRODUCT_ASSET_NAMES} from "@notnotype/neuro-book-contracts/platform";
import {parseInstallationManifest, type InstallationManifest, type ReleaseChannel} from "@notnotype/neuro-book-contracts/installation";
import {parseReleaseManifest, parseReleaseManifestEnvelope, type ReleaseManifest} from "@notnotype/neuro-book-contracts/release";
import {readJson, writeJsonAtomic} from "#manager/files";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {lt, prerelease} from "semver";
import {MANAGER_VERSION} from "#manager/version-info";

const RELEASE_API = "https://api.github.com/repos/notnotype/neuro-book/releases";

type GitHubRelease = {
    tag_name: string;
    prerelease: boolean;
    draft: boolean;
    assets: Array<{name: string; browser_download_url: string}>;
};

/** 读取本机 installation manifest。 */
export async function readInstallationManifest(path: string): Promise<InstallationManifest | null> {
    const value = await readJson(path);
    return value === null ? null : parseInstallationManifest(value);
}

/** 原子写入 installation manifest。 */
export async function writeInstallationManifest(path: string, manifest: InstallationManifest): Promise<void> {
    parseInstallationManifest(manifest);
    await writeJsonAtomic(path, manifest);
}

/** 按版本或 channel 查找 Release Manifest。 */
export async function resolveReleaseManifest(channel: ReleaseChannel, version?: string, explicitManifest?: string): Promise<ReleaseManifest> {
    if (version && explicitManifest) throw new Error("--version 与 --release-manifest 不能同时使用。" );
    if (explicitManifest) return resolveExplicitReleaseManifest(channel, explicitManifest);
    const releases = await fetchReleases();
    const normalizedVersion = version ? (version.startsWith("v") ? version : `v${version}`) : null;
    const candidates = normalizedVersion
        ? releases.filter((item) => item.tag_name === normalizedVersion)
        : releases.filter((item) => channel === "stable" ? !item.prerelease : item.prerelease);
    const release = normalizedVersion
        ? candidates[0]
        : candidates.find((item) => item.assets.some((asset) => asset.name === "release-manifest.json"));
    if (!release) {
        throw new Error(normalizedVersion ? `找不到 NeuroBook Release：${normalizedVersion}` : `找不到 ${channel} NeuroBook Release。`);
    }
    const asset = release.assets.find((item) => item.name === "release-manifest.json");
    if (!asset) {
        throw new Error(`Release ${release.tag_name} 尚未完成装配：缺少 release-manifest.json。`);
    }
    const response = await fetch(asset.browser_download_url, {headers: {"User-Agent": "neuro-book-manager"}});
    if (!response.ok) {
        throw new Error(`下载 Release Manifest 失败 ${response.status}：${release.tag_name}`);
    }
    const value: unknown = await response.json();
    assertManagerRequirement(parseReleaseManifestEnvelope(value), channel);
    const manifest = parseReleaseManifest(value);
    assertReleaseIdentity(release, manifest, channel);
    assertReleaseAssets(release, manifest);
    return manifest;
}

/** 读取候选CI、本地审计或HTTPS镜像提供的显式Release Manifest。 */
async function resolveExplicitReleaseManifest(channel: ReleaseChannel, location: string): Promise<ReleaseManifest> {
    const value: unknown = /^https:\/\//u.test(location)
        ? await fetchExplicitManifest(location)
        : JSON.parse(await readFile(resolve(location), "utf8")) as unknown;
    assertManagerRequirement(parseReleaseManifestEnvelope(value), channel);
    const manifest = parseReleaseManifest(value);
    if (manifest.channel !== channel) {
        throw new Error(`显式Release Manifest channel为${manifest.channel}，命令选择为${channel}。`);
    }
    const versionIsPrerelease = prerelease(manifest.version) !== null;
    if (versionIsPrerelease !== (channel === "canary")) {
        throw new Error(`显式Release Manifest version与channel不一致：${manifest.version} / ${channel}`);
    }
    if (!manifest.ghcr.ref.endsWith(`@${manifest.ghcr.digest}`)) {
        throw new Error(`GHCR ref 必须使用 Release Manifest digest：${manifest.ghcr.ref}`);
    }
    const assets = [
        ["inkwell-source.zip", manifest.source.url],
        ["inkwell-windows-x64.zip", manifest.windowsPortable.url],
        ...manifest.products.map((product) => [
            PRODUCT_ASSET_NAMES[product.platform],
            product.url,
        ]),
    ];
    for (const [expectedName, assetUrl] of assets) {
        const url = new URL(assetUrl);
        if (url.protocol !== "https:") throw new Error(`Release资产必须使用HTTPS URL：${assetUrl}`);
        if (url.pathname.split("/").at(-1) !== expectedName) {
            throw new Error(`Release资产URL文件名错误，期望${expectedName}：${assetUrl}`);
        }
    }
    return manifest;
}

/** 下载并解析显式HTTPS Manifest。 */
async function fetchExplicitManifest(location: string): Promise<unknown> {
    const response = await fetch(location, {headers: {"User-Agent": "neuro-book-manager"}});
    if (!response.ok) throw new Error(`下载显式Release Manifest失败 ${response.status}：${location}`);
    return response.json() as Promise<unknown>;
}

function assertReleaseIdentity(release: GitHubRelease, manifest: ReleaseManifest, channel: ReleaseChannel): void {
    if (release.tag_name !== `v${manifest.version}`) {
        throw new Error(`GitHub tag ${release.tag_name} 与 Release Manifest version ${manifest.version} 不一致。`);
    }
    const expectedChannel: ReleaseChannel = release.prerelease ? "canary" : "stable";
    if (manifest.channel !== expectedChannel || channel !== expectedChannel) {
        throw new Error(`Release ${release.tag_name} 的 prerelease/channel 标记不一致。`);
    }
    if (!manifest.ghcr.ref.endsWith(`@${manifest.ghcr.digest}`)) {
        throw new Error(`GHCR ref 必须使用 Release Manifest digest：${manifest.ghcr.ref}`);
    }
}

function assertReleaseAssets(release: GitHubRelease, manifest: ReleaseManifest): void {
    const expected = new Map(release.assets.map((asset) => [asset.name, asset.browser_download_url]));
    const assets = [
        ["inkwell-source.zip", manifest.source.url],
        ["inkwell-windows-x64.zip", manifest.windowsPortable.url],
        ...manifest.products.map((product) => [
            PRODUCT_ASSET_NAMES[product.platform],
            product.url,
        ]),
    ];
    for (const [name, url] of assets) {
        if (expected.get(name) !== url) throw new Error(`Release Manifest 资产 URL 与 GitHub Release 不一致：${name}`);
    }
}

/** 在严格解析前后统一执行最低Manager版本门禁。 */
function assertManagerRequirement(manifest: {minManagerVersion: string}, channel: ReleaseChannel): void {
    if (!lt(MANAGER_VERSION, manifest.minManagerVersion)) return;
    const tag = channel === "stable" ? "latest" : "canary";
    throw new Error(`当前Manager ${MANAGER_VERSION}低于Release要求${manifest.minManagerVersion}。请先执行：bunx --bun @notnotype/neuro-book-manager@${tag} update`);
}

async function fetchReleases(): Promise<GitHubRelease[]> {
    const response = await fetch(`${RELEASE_API}?per_page=50`, {
        headers: {"Accept": "application/vnd.github+json", "User-Agent": "neuro-book-manager"},
    });
    if (!response.ok) {
        throw new Error(`读取 NeuroBook Releases 失败：HTTP ${response.status}`);
    }
    const releases = await response.json() as GitHubRelease[];
    return releases.filter((release) => !release.draft);
}
