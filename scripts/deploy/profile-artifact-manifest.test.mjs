import {describe, expect, test} from "bun:test";

import {normalizeProfileManifestProfiles} from "./profile-artifact-manifest.mjs";

describe("normalizeProfileManifestProfiles", () => {
    test("从 object manifest 的压缩哈希字段派生嵌套 artifact 路径", () => {
        const profiles = normalizeProfileManifestProfiles({
            profiles: {
                writer: {
                    profileKey: "writer",
                    artifactSha: "artifact-hash",
                    typeSha: "type-hash",
                },
            },
        }, "manifest.json");

        expect(profiles).toEqual([expect.objectContaining({
            artifactFileName: "artifacts/artifact-hash.mjs",
            typeFileName: "artifacts/artifact-hash.types.d.ts",
        })]);
    });

    test("保留 array manifest 已声明的 artifact 路径", () => {
        const profiles = normalizeProfileManifestProfiles({
            profiles: [{
                profileKey: "writer",
                artifactFileName: "artifacts/custom.mjs",
                typeFileName: "artifacts/custom.types.d.ts",
            }],
        }, "manifest.json");

        expect(profiles[0].artifactFileName).toBe("artifacts/custom.mjs");
        expect(profiles[0].typeFileName).toBe("artifacts/custom.types.d.ts");
    });

    test("拒绝空 manifest，避免清理阶段误删全部 artifact", () => {
        expect(() => normalizeProfileManifestProfiles({profiles: {}}, "broken-manifest.json"))
            .toThrow("Product profile manifest 没有 Profile：broken-manifest.json");
    });
});
