import {readFile} from "node:fs/promises";
import path from "node:path";
import {describe, expect, it} from "vitest";

const mutationRoutes = [
    "write.put.ts",
    "upload-project.post.ts",
    "upload-file.post.ts",
    "rename.patch.ts",
    "delete.delete.ts",
    "create-file.post.ts",
    "create-directory.post.ts",
    "convert-file-to-directory.post.ts",
] as const;

describe("Workspace Files mutation route wiring", () => {
    it.each(mutationRoutes)("%s 统一经过 File Index mutation boundary", async (fileName) => {
        const source = await readFile(path.resolve("server/api/workspace-files", fileName), "utf-8");

        expect(source).toContain("withProjectTargetMutation");
        expect(source).not.toContain("withProjectTargetOperation");
        expect(source).not.toContain("invalidateWorkspaceTreeAfterMutation");
    });
});
