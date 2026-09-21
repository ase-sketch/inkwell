import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {join} from "node:path";
import {unzipSync} from "fflate";
import {afterEach, describe, expect, it} from "vitest";

import {writeZipArchive} from "#scripts/utils/zip";

const temporaryRoots: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("ZIP归档", () => {
    it("同时保留普通文件与显式空目录", async () => {
        const root = await mkdtemp(testHostPath("nbook-zip-"));
        temporaryRoots.push(root);
        const source = join(root, "config.yaml");
        const archive = join(root, "portable.zip");
        await writeFile(source, "auth:\n    enabled: false\n", "utf8");

        await writeZipArchive(archive, [
            {kind: "file", source, archivePath: "data/config.yaml"},
            {kind: "directory", archivePath: "data/logs/"},
        ]);

        const entries = unzipSync(new Uint8Array(await readFile(archive)));
        expect(new TextDecoder().decode(entries["data/config.yaml"])).toBe("auth:\n    enabled: false\n");
        expect(entries["data/logs/"]).toBeInstanceOf(Uint8Array);
        expect(entries["data/logs/"]).toHaveLength(0);
    });
});
