import {run, runCapture} from "#scripts/utils/process.mjs";

type ReleaseView = {
    draft: boolean;
    html_url: string;
    id: number;
    tag_name: string;
    target_commitish: string;
};

const RELEASE_DISCOVERY_ATTEMPTS = 12;
const RELEASE_DISCOVERY_INTERVAL_MS = 1_000;

export type ReleaseCandidateRequest = {
    createArgs: string[];
    dispatchRef: string;
    prerelease: boolean;
    repo: string;
    revision: string;
    tag: string;
    workflow: string;
};

export type ReleaseCandidate = {
    releaseId: number;
    url: string;
};

/** 组装只接受不可变候选身份的 workflow dispatch 参数。 */
export function candidateDispatchArgs(input: Omit<ReleaseCandidateRequest, "createArgs"> & {releaseId: number}): string[] {
    return [
        "workflow",
        "run",
        input.workflow,
        "--repo",
        input.repo,
        "--ref",
        input.dispatchRef,
        "--field",
        `release_id=${input.releaseId}`,
        "--field",
        `tag=${input.tag}`,
        "--field",
        `revision=${input.revision}`,
        "--field",
        `prerelease=${input.prerelease}`,
    ];
}

/**
 * 创建 Draft Release，核验 GitHub 返回的 release identity，再显式启动候选 workflow。
 *
 * 所有公开与 OCI 正式 tag 激活都由 workflow 的最终 gate 完成；CLI 没有直接公开路径。
 */
export async function createReleaseCandidate(input: ReleaseCandidateRequest): Promise<ReleaseCandidate> {
    if (!input.createArgs.includes("--draft")) {
        throw new Error("Release Candidate 必须以 Draft 创建。");
    }

    await run("gh", input.createArgs);
    const release = await waitForDraftRelease(input.repo, input.tag);
    if (!release || !Number.isSafeInteger(release.id) || release.id <= 0) {
        throw new Error(`GitHub Draft Release 缺少有效 release ID：${input.tag}`);
    }
    if (
        !release.draft
        || release.tag_name !== input.tag
        || release.target_commitish !== input.revision
        || !release.html_url.startsWith("https://")
    ) {
        throw new Error(`GitHub Draft Release identity 不匹配：${input.tag}`);
    }

    await run("gh", candidateDispatchArgs({...input, releaseId: release.id}));
    return {releaseId: release.id, url: release.html_url};
}

/** 等待刚创建的Draft进入GitHub Releases列表，吸收API的短暂最终一致性窗口。 */
async function waitForDraftRelease(repo: string, tag: string): Promise<ReleaseView> {
    for (let attempt = 0; attempt < RELEASE_DISCOVERY_ATTEMPTS; attempt += 1) {
        const raw = await runCapture("gh", ["api", `repos/${repo}/releases?per_page=100`]);
        const releases = JSON.parse(raw) as ReleaseView[];
        const matches = releases.filter((release) => release.tag_name === tag);
        if (matches.length > 1) {
            throw new Error(`GitHub Draft Release 数量异常：tag=${tag} count=${matches.length}`);
        }
        if (matches.length === 1 && matches[0]) {
            return matches[0];
        }
        if (attempt + 1 < RELEASE_DISCOVERY_ATTEMPTS) {
            await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, RELEASE_DISCOVERY_INTERVAL_MS));
        }
    }
    throw new Error(`GitHub Draft Release 数量异常：tag=${tag} count=0`);
}
