import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const processMocks = vi.hoisted(() => ({
    run: vi.fn(),
    runCapture: vi.fn(),
}));

vi.mock("#scripts/utils/process.mjs", () => processMocks);

import {
    candidateDispatchArgs,
    createReleaseCandidate,
    type ReleaseCandidateRequest,
} from "#scripts/release/release-candidate";

const request: ReleaseCandidateRequest = {
    createArgs: ["release", "create", "v0.9.0-canary.1", "--draft"],
    dispatchRef: "master",
    prerelease: true,
    repo: "notnotype/neuro-book",
    revision: "a".repeat(40),
    tag: "v0.9.0-canary.1",
    workflow: "release-container.yml",
};

describe("Release Candidate Coordinator", () => {
    beforeEach(() => {
        processMocks.run.mockReset().mockResolvedValue(undefined);
        processMocks.runCapture.mockReset().mockResolvedValue(JSON.stringify([{
            draft: true,
            html_url: `https://github.com/notnotype/neuro-book/releases/tag/${request.tag}`,
            id: 1234,
            tag_name: request.tag,
            target_commitish: request.revision,
        }]));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("创建 Draft 并以不可变 identity 显式 dispatch", async () => {
        await expect(createReleaseCandidate(request)).resolves.toEqual({
            releaseId: 1234,
            url: `https://github.com/notnotype/neuro-book/releases/tag/${request.tag}`,
        });

        expect(processMocks.run).toHaveBeenNthCalledWith(1, "gh", request.createArgs);
        expect(processMocks.run).toHaveBeenNthCalledWith(2, "gh", candidateDispatchArgs({...request, releaseId: 1234}));
    });

    it("拒绝绕过 Draft 或使用漂移的 GitHub release identity", async () => {
        await expect(createReleaseCandidate({...request, createArgs: request.createArgs.filter((arg) => arg !== "--draft")}))
            .rejects.toThrow("必须以 Draft 创建");
        expect(processMocks.run).not.toHaveBeenCalled();

        processMocks.runCapture.mockResolvedValueOnce(JSON.stringify([{
            draft: false,
            html_url: `https://github.com/notnotype/neuro-book/releases/tag/${request.tag}`,
            id: 1234,
            tag_name: request.tag,
            target_commitish: request.revision,
        }]));
        await expect(createReleaseCandidate(request)).rejects.toThrow("identity 不匹配");
        expect(processMocks.run).toHaveBeenCalledTimes(1);
    });

    it("等待刚创建的Draft进入GitHub Releases列表后再dispatch", async () => {
        vi.useFakeTimers();
        processMocks.runCapture
            .mockResolvedValueOnce("[]")
            .mockResolvedValueOnce("[]")
            .mockResolvedValueOnce(JSON.stringify([{
                draft: true,
                html_url: `https://github.com/notnotype/neuro-book/releases/tag/${request.tag}`,
                id: 1234,
                tag_name: request.tag,
                target_commitish: request.revision,
            }]));

        const candidate = createReleaseCandidate(request);
        await vi.advanceTimersByTimeAsync(2_000);
        await expect(candidate).resolves.toEqual({
            releaseId: 1234,
            url: `https://github.com/notnotype/neuro-book/releases/tag/${request.tag}`,
        });
        expect(processMocks.runCapture).toHaveBeenCalledTimes(3);
        expect(processMocks.run).toHaveBeenNthCalledWith(2, "gh", candidateDispatchArgs({...request, releaseId: 1234}));
    });
});
