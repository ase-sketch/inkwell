import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

const previewPagePath = fileURLToPath(new URL("../pages/workflow.preview.vue", import.meta.url));

describe("Workflow Preview Project generation contract", () => {
    it("Catalog 按 Project ready revision single-flight，并在 reconnect 后重载", async () => {
        const page = await readFile(previewPagePath, "utf8");

        expect(page).toContain("type FormalCatalogRequest = {");
        expect(page).toContain("const key = projectRoot ? `${projectRoot}:${readyRevision}` : \"workspace-root\";");
        expect(page).toContain("if (formalCatalogRequest?.key === key) return formalCatalogRequest.promise;");
        expect(page).toContain("function ownsFormalCatalogGeneration(projectRoot: string, readyRevision: number | null): boolean");
        expect(page).toContain("watch(formalProjectSession.state, (next, previous) => {");
        expect(page).toContain("clearFormalCatalog();");
        expect(page).toContain("const loaded = await loadFormalCatalog(next.ready.projectRoot, next.ready.revision);");
    });

    it("新 generation 加载失败时释放 presence 并回到未选择状态", async () => {
        const page = await readFile(previewPagePath, "utf8");

        expect(page).toContain("const loaded = await loadFormalCatalog(next.ready.projectRoot, next.ready.revision);");
        expect(page).toContain("if (loaded) {");
        expect(page).toContain("await formalProjectSession.release();");
        expect(page).toContain('selectedProjectRoot.value = "";');
    });
});
