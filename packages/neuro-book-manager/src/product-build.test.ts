import {mkdir, mkdtemp, rename, rm, stat} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {dirname, join, resolve} from "node:path";
import {afterEach, describe, expect, it, vi} from "vitest";

const processes = vi.hoisted(() => ({run: vi.fn(), runBun: vi.fn()}));
vi.mock("#manager/process", () => processes);

import {buildTestRuntimeImage, hostRuntimeImageFixtureAvailable} from "#manager/fixtures/runtime-image";
import {currentProductPlatform} from "#manager/platform";
import {buildSourceProduct} from "#manager/product";

const roots: string[] = [];

afterEach(async () => {
    processes.run.mockReset();
    processes.runBun.mockReset();
    await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("Manager source Product build", () => {
    it.runIf(hostRuntimeImageFixtureAvailable(currentProductPlatform()))("调用统一 nuxt:build 并只返回 staging verified image", async () => {
        const root = await mkdtemp(testHostPath("nbook-manager-product-build-"));
        roots.push(root);
        const sourceRoot = join(root, "source");
        const staging = join(root, "operation", "build");
        const revision = "b".repeat(40);
        let builtImage: Awaited<ReturnType<typeof buildTestRuntimeImage>> | undefined;
        await mkdir(sourceRoot, {recursive: true});
        processes.run.mockImplementation(async (_command, args, options) => {
            expect(args).toEqual(["run", "nuxt:build"]);
            const configured = options.env.NEURO_BOOK_OUTPUT_DIR;
            if (typeof configured !== "string") throw new Error("测试缺少 NEURO_BOOK_OUTPUT_DIR。");
            if (typeof options.cwd !== "string") throw new Error("测试缺少 Source Root。");
            builtImage = await buildTestRuntimeImage({
                sourceRoot: options.cwd,
                version: "1.0.0",
                revision,
                platform: currentProductPlatform(),
            });
            const outputRoot = resolve(options.cwd, configured);
            await mkdir(dirname(outputRoot), {recursive: true});
            await rename(builtImage.path, outputRoot);
        });

        const staged = await buildSourceProduct({
            root,
            sourceRoot,
            staging,
            version: "1.0.0",
            revision,
            stateRoot: join(root, "state"),
        });

        if (!builtImage) throw new Error("测试未生成 Runtime Image。");
        expect(staged.outputRoot).toBe(join(staging, ".output"));
        expect(staged.component).toMatchObject({
            imageId: builtImage.manifest.imageId,
            sourceDigest: builtImage.manifest.sourceDigest,
            lockfileSha256: builtImage.manifest.lockfileSha256,
            builderContractVersion: builtImage.manifest.builderContractVersion,
        });
        await expect(stat(join(root, ".output"))).rejects.toMatchObject({code: "ENOENT"});
        await expect(stat(join(staged.outputRoot, "runtime-image.ready"))).resolves.toBeTruthy();
    });
});
