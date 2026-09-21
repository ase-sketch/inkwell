#!/usr/bin/env bun
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {basename, resolve} from "node:path";

import {Command} from "commander";

type GitHubReleaseAsset = {
    id: number;
    name: string;
    size: number;
};

type GitHubRelease = {
    assets: GitHubReleaseAsset[];
    draft: boolean;
    id: number;
    tag_name: string;
};

type UploadOptions = {
    file: string[];
    releaseId: string;
    repo: string;
    tag: string;
};

/** Draft Release 资产的摘要幂等上传器。 */
export class DraftReleaseAssets {
    private readonly apiRoot = "https://api.github.com";

    public constructor(
        private readonly repo: string,
        private readonly releaseId: number,
        private readonly tag: string,
        private readonly token: string,
        private readonly fetchImplementation: typeof fetch = fetch,
    ) {}

    /** 上传缺失资产；同名资产必须与本地内容完全一致。 */
    public async upload(paths: readonly string[]): Promise<void> {
        const release = await this.release();
        const assets = new Map(release.assets.map((asset) => [asset.name, asset]));
        for (const input of paths) {
            const path = resolve(input);
            const name = basename(path);
            const content = await readFile(path);
            const existing = assets.get(name);
            if (existing) {
                const remote = await this.asset(existing.id);
                if (existing.size !== content.byteLength || sha256(remote) !== sha256(content)) {
                    throw new Error(`Draft Release 同名资产摘要不同，拒绝覆盖：${name}`);
                }
                console.log(`Reuse Draft asset: ${name}`);
                continue;
            }

            const response = await this.request(
                `https://uploads.github.com/repos/${this.repo}/releases/${this.releaseId}/assets?name=${encodeURIComponent(name)}`,
                {
                    method: "POST",
                    headers: {"content-type": "application/octet-stream"},
                    body: new Blob([content]),
                },
            );
            const uploaded = await response.json() as GitHubReleaseAsset;
            if (uploaded.name !== name || uploaded.size !== content.byteLength || !Number.isSafeInteger(uploaded.id)) {
                throw new Error(`GitHub 返回的 Draft asset identity 不匹配：${name}`);
            }
            assets.set(name, uploaded);
            console.log(`Upload Draft asset: ${name}`);
        }
    }

    /** 读取并核验调用方指定的 Draft Release identity。 */
    private async release(): Promise<GitHubRelease> {
        const response = await this.request(`${this.apiRoot}/repos/${this.repo}/releases/${this.releaseId}`);
        const release = await response.json() as GitHubRelease;
        if (
            release.id !== this.releaseId
            || release.tag_name !== this.tag
            || release.draft !== true
            || !Array.isArray(release.assets)
        ) {
            throw new Error(`Draft Release identity 不匹配：${this.tag}#${this.releaseId}`);
        }
        return release;
    }

    /** 下载现有资产的原始 bytes，用于同名摘要比较。 */
    private async asset(assetId: number): Promise<Uint8Array> {
        const response = await this.request(`${this.apiRoot}/repos/${this.repo}/releases/assets/${assetId}`, {
            headers: {accept: "application/octet-stream"},
        });
        return new Uint8Array(await response.arrayBuffer());
    }

    /** 统一附加 GitHub API 认证并把非 2xx 变成带上下文的错误。 */
    private async request(url: string, init: RequestInit = {}): Promise<Response> {
        const headers = new Headers(init.headers);
        headers.set("accept", headers.get("accept") ?? "application/vnd.github+json");
        headers.set("authorization", `Bearer ${this.token}`);
        headers.set("x-github-api-version", "2022-11-28");
        const response = await this.fetchImplementation(url, {...init, headers, redirect: "follow"});
        if (!response.ok) {
            throw new Error(`GitHub Draft asset API失败：${response.status} ${url}`);
        }
        return response;
    }
}

/** 计算本地或远端资产的 SHA-256。 */
function sha256(content: Uint8Array): string {
    return createHash("sha256").update(content).digest("hex");
}

/** CLI 入口只负责参数收窄，上传语义由 DraftReleaseAssets 持有。 */
async function main(): Promise<void> {
    const program = new Command()
        .requiredOption("--repo <repo>")
        .requiredOption("--release-id <id>")
        .requiredOption("--tag <tag>")
        .requiredOption("--file <path...>");
    program.parse();
    const options = program.opts<UploadOptions>();
    const releaseId = Number(options.releaseId);
    const token = process.env.GH_TOKEN?.trim();
    if (!Number.isSafeInteger(releaseId) || releaseId <= 0) throw new Error("release-id 必须是正整数。");
    if (!token) throw new Error("缺少 GH_TOKEN，不能上传 Draft Release 资产。");
    await new DraftReleaseAssets(options.repo, releaseId, options.tag, token).upload(options.file);
}

if (import.meta.main) await main();
