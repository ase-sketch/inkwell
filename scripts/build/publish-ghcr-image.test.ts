import {describe, expect, it} from "vitest";

import {buildArgs, candidateTag, normalizeSourceRevision} from "#scripts/deploy/publish-ghcr-image.mjs";

describe("GHCR发布Source revision合同", () => {
    it("app build把规范化revision传给Product Runtime Image Builder", () => {
        const revision = "A".repeat(40);

        expect(buildArgs({
            candidate: "release-123",
            image: "ghcr.io/notnotype/neuro-book",
            platform: "linux/amd64",
            sourceRevision: revision,
        })).toEqual([
            "buildx",
            "build",
            "--platform",
            "linux/amd64",
            "--push",
            "--build-arg",
            `NEURO_BOOK_SOURCE_REVISION=${revision.toLowerCase()}`,
            "--file",
            "packages/neuro-book/Dockerfile",
            "-t",
            "ghcr.io/notnotype/neuro-book:candidate-release-123",
            ".",
        ]);
    });

    it("人工入口只能生成候选tag", () => {
        expect(candidateTag("Release-123")).toBe("candidate-release-123");
        expect(() => candidateTag("v1.0.0/latest")).toThrow("Candidate identity无效");
    });

    it("拒绝把非Git object ID伪装成Source revision", () => {
        expect(() => normalizeSourceRevision("main")).toThrow("Source revision无效");
    });
});
