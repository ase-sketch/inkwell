import {describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
    inspectInstance: vi.fn(),
    inspectInstallEnvironment: vi.fn(),
    inspectPortAvailable: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("#manager/instance-discovery", () => ({inspectInstance: mocks.inspectInstance}));
vi.mock("#manager/install-preflight", () => ({
    inspectInstallEnvironment: mocks.inspectInstallEnvironment,
    inspectPortAvailable: mocks.inspectPortAvailable,
}));

import {assertAdoptionPreflight, inspectAdoptionPreflight} from "#manager/source-adoption";
import {inspectHostPlatform} from "#manager/platform";

describe("Source Adoption Preflight", () => {
    it("CLI与TUI共享Git和离线身份blocker", async () => {
        mocks.inspectInstance.mockResolvedValue({
            root: "C:/checkout",
            kind: "neuro-book-checkout",
            git: {repository: "https://github.com/notnotype/neuro-book.git", branch: "master", upstream: "origin/master", revision: "a".repeat(40), dirty: false},
            product: {exists: false, trusted: false},
            state: {root: ".", configExists: false, workspaceExists: false, databaseExists: false},
            blockers: [{code: "git.dirty", message: "Git worktree不干净"}],
            warnings: [],
        });
        mocks.inspectInstallEnvironment.mockResolvedValue({
            host: inspectHostPlatform(),
            bun: {available: true},
            git: {available: false},
        });

        const preflight = await inspectAdoptionPreflight({root: "C:/checkout", profile: "source-dev", port: 3000});

        expect(preflight.report.blockers).toEqual(expect.arrayContaining([
            expect.objectContaining({code: "git.dirty"}),
            expect.objectContaining({code: "command.git"}),
        ]));
        expect(() => assertAdoptionPreflight(preflight)).toThrow("Git worktree不干净");
    });

    it("Source Docker缺少Container Engine时在执行前失败", async () => {
        mocks.inspectInstance.mockResolvedValue({
            root: "/checkout",
            kind: "neuro-book-checkout",
            git: {repository: "https://github.com/notnotype/neuro-book.git", branch: "master", upstream: "origin/master", revision: "a".repeat(40), dirty: false},
            product: {exists: false, trusted: false},
            state: {root: ".", configExists: false, workspaceExists: false, databaseExists: false},
            blockers: [],
            warnings: [],
        });
        mocks.inspectInstallEnvironment.mockResolvedValue({
            host: inspectHostPlatform(),
            bun: {available: true},
            git: {available: true},
            containers: {engine: null, inspections: [], error: "没有可用engine"},
        });

        const preflight = await inspectAdoptionPreflight({root: "/checkout", profile: "source-docker", port: 3000});

        expect(preflight.report.blockers).toContainEqual(expect.objectContaining({code: "container.engine"}));
    });
});
