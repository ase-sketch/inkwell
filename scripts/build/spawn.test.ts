import {readFile} from "node:fs/promises";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

describe("外部命令输出采集", () => {
    it("runCapture 等待 stdio close，而不是只等待进程 exit", async () => {
        const source = await readFile(resolve(import.meta.dirname, "..", "utils", "spawn.mjs"), "utf8");
        const captureSource = source.slice(source.indexOf("export function runCapture"));

        expect(captureSource).toContain("child.on('close'");
        expect(captureSource).not.toContain("child.on('exit'");
    });
});
