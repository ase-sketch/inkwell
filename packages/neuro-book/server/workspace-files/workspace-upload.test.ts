import fs from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {zipSync} from "fflate";
import {
    PROJECT_UPLOAD_LIMIT_BYTES,
    uploadWorkspaceFile,
    uploadWorkspaceProjectFiles,
    uploadWorkspaceProjectZip,
    WorkspaceUploadError,
} from "nbook/server/workspace-files/workspace-upload";

describe("workspace-upload", () => {
    let root: string;

    beforeEach(async () => {
        root = testHostPath("workspace-upload-test", randomUUID());
        await fs.mkdir(root, {recursive: true});
    });

    afterEach(async () => {
        await fs.rm(root, {recursive: true, force: true});
    });

    it("uploads a single file into upload/ and skips existing files", async () => {
        const first = await uploadWorkspaceFile(root, {
            fileName: "cover.jpg",
            data: Buffer.from([1, 2, 3]),
        });
        const second = await uploadWorkspaceFile(root, {
            fileName: "cover.jpg",
            data: Buffer.from([9, 9, 9]),
        });

        expect(first).toMatchObject({written: 1, skipped: 0});
        expect(second).toMatchObject({written: 0, skipped: 1});
        await expect(fs.readFile(path.join(root, "upload", "cover.jpg"))).resolves.toEqual(Buffer.from([1, 2, 3]));
    });

    it("preserves project directory relative paths", async () => {
        const result = await uploadWorkspaceProjectFiles(root, [
            {fileName: "index.md", relativePath: "manuscript/001/index.md", data: Buffer.from("# 1\n")},
            {fileName: "hero.png", relativePath: "assets/images/hero.png", data: Buffer.from([4, 5, 6])},
        ]);

        expect(result).toMatchObject({written: 2, skipped: 0});
        await expect(fs.readFile(path.join(root, "manuscript", "001", "index.md"), "utf-8")).resolves.toBe("# 1\n");
        await expect(fs.readFile(path.join(root, "assets", "images", "hero.png"))).resolves.toEqual(Buffer.from([4, 5, 6]));
    });

    it("preserves zip paths and skips existing files", async () => {
        await fs.mkdir(path.join(root, "project"), {recursive: true});
        await fs.writeFile(path.join(root, "project", "existing.md"), "old\n");
        const zip = zipSync({
            "project/existing.md": Buffer.from("new\n"),
            "project/new.md": Buffer.from("created\n"),
        });

        const result = await uploadWorkspaceProjectZip(root, {
            fileName: "project.zip",
            data: zip,
        });

        expect(result).toMatchObject({written: 1, skipped: 1});
        await expect(fs.readFile(path.join(root, "project", "existing.md"), "utf-8")).resolves.toBe("old\n");
        await expect(fs.readFile(path.join(root, "project", "new.md"), "utf-8")).resolves.toBe("created\n");
    });

    it("rejects unsafe relative paths", async () => {
        await expect(uploadWorkspaceProjectFiles(root, [
            {fileName: "evil.md", relativePath: "../evil.md", data: Buffer.from("x")},
        ])).rejects.toBeInstanceOf(WorkspaceUploadError);
    });

    it("enforces project upload size limit", async () => {
        await expect(uploadWorkspaceProjectFiles(root, [
            {fileName: "too-large.bin", relativePath: "too-large.bin", data: Buffer.alloc(PROJECT_UPLOAD_LIMIT_BYTES + 1)},
        ])).rejects.toMatchObject({
            statusCode: 413,
        });
    });
});
