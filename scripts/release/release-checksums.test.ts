import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";

import {verifyReleaseChecksums, writeReleaseChecksums} from "#scripts/release/release-checksums";

const temporaryRoots: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("Release SHA256SUMS", () => {
    it("覆盖所有公开资产", async () => {
        const root = await fixture();
        await verifyReleaseChecksums(root, ["release-manifest.json", "install.ps1", "install.sh"]);
        expect(await readFile(join(root, "SHA256SUMS"), "utf8")).toContain("  install.ps1");
    });

    it("拒绝缺失或被篡改的Stage 0资产", async () => {
        const root = await fixture();
        await writeFile(join(root, "install.sh"), "tampered", "utf8");
        await expect(verifyReleaseChecksums(root, ["release-manifest.json", "install.ps1", "install.sh"]))
            .rejects.toThrow("Release资产SHA256不匹配：install.sh");
        await expect(verifyReleaseChecksums(root, ["release-manifest.json", "install.ps1", "install.cmd", "install.sh"]))
            .rejects.toThrow("SHA256SUMS缺少资产：install.cmd");
    });
});

/** 创建最小Release资产集合。 */
async function fixture(): Promise<string> {
    const root = await mkdtemp(testHostPath("nbook-release-checksums-"));
    temporaryRoots.push(root);
    const paths = [
        join(root, "release-manifest.json"),
        join(root, "install.ps1"),
        join(root, "install.sh"),
    ];
    await Promise.all(paths.map((path, index) => writeFile(path, `asset-${index}`, "utf8")));
    await writeReleaseChecksums(paths, join(root, "SHA256SUMS"));
    return root;
}
