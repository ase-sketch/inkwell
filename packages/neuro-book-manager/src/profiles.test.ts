import {describe, expect, it} from "vitest";

import {installPlan} from "#manager/installer";
import {profileDefinition, profileNames} from "#manager/profiles";
import {compareVersions} from "#manager/version";

describe("安装 Profile", () => {
    it("覆盖六种安装形式", () => {
        expect(profileNames()).toEqual([
            "source-dev",
            "source-product",
            "product-bun",
            "windows-portable",
            "source-docker",
            "ghcr",
        ]);
        expect(profileDefinition("source-docker")).toMatchObject({product: "container", docker: true});
        expect(profileDefinition("windows-portable")).toMatchObject({source: "release", applicationRuntime: "managed", tools: "managed"});
    });

    it("dry-run 计划不执行外部动作", () => {
        const plan = installPlan({
            root: "C:/neuro-book",
            profile: "ghcr",
            channel: "stable",
            port: 3000,
            authEnabled: true,
            dryRun: true,
            managerExecutable: "manager.mjs",
        });
        expect(plan.steps).toContain("生成 Docker Compose");
        expect(plan.profile).toBe("ghcr");
    });
});

describe("Manager 版本比较", () => {
    it("正式版高于 prerelease", () => {
        expect(compareVersions("1.0.0", "1.0.0-canary.1")).toBeGreaterThan(0);
        expect(compareVersions("0.2.0", "0.1.9")).toBeGreaterThan(0);
    });
});
