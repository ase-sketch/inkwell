import {mkdtemp, rm, writeFile} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {join} from "node:path";

import {afterEach, describe, expect, it, vi} from "vitest";

import {DraftReleaseAssets} from "#scripts/release/draft-release-assets";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("Draft Release assets", () => {
    it("上传缺失资产，并复用摘要相同的同名资产", async () => {
        const path = await fixture("candidate.txt", "candidate\n");
        const createFetch = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(release([])))
            .mockResolvedValueOnce(jsonResponse({id: 88, name: "candidate.txt", size: 10}));
        await new DraftReleaseAssets("notnotype/neuro-book", 42, "v0.9.0-canary.1", "token", createFetch)
            .upload([path]);
        expect(createFetch).toHaveBeenCalledTimes(2);
        expect(createFetch.mock.calls[1]?.[0]).toContain("uploads.github.com");

        const reuseFetch = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(release([{id: 88, name: "candidate.txt", size: 10}])))
            .mockResolvedValueOnce(new Response("candidate\n"));
        await new DraftReleaseAssets("notnotype/neuro-book", 42, "v0.9.0-canary.1", "token", reuseFetch)
            .upload([path]);
        expect(reuseFetch).toHaveBeenCalledTimes(2);
    });

    it("拒绝覆盖同名但摘要不同的候选资产", async () => {
        const path = await fixture("candidate.txt", "candidate\n");
        const fetchImplementation = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(release([{id: 88, name: "candidate.txt", size: 10}])))
            .mockResolvedValueOnce(new Response("different\n"));

        await expect(new DraftReleaseAssets(
            "notnotype/neuro-book",
            42,
            "v0.9.0-canary.1",
            "token",
            fetchImplementation,
        ).upload([path])).rejects.toThrow("摘要不同");
    });
});

/** 创建测试资产并登记清理。 */
async function fixture(name: string, content: string): Promise<string> {
    const root = await mkdtemp(testHostPath("nbook-draft-assets-"));
    roots.push(root);
    const path = join(root, name);
    await writeFile(path, content, "utf8");
    return path;
}

/** 返回固定 identity 的 Draft Release API payload。 */
function release(assets: Array<{id: number; name: string; size: number}>): object {
    return {assets, draft: true, id: 42, tag_name: "v0.9.0-canary.1"};
}

/** 创建 JSON API Response。 */
function jsonResponse(value: object): Response {
    return Response.json(value);
}
