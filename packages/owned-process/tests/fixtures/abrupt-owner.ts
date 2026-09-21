import {writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

import {spawnOwnedProcess} from "#owned-process/index";

const statePath = process.argv[2];
if (!statePath) throw new Error("宿主断连fixture缺少状态路径。");

spawnOwnedProcess({
    command: process.execPath,
    args: [fileURLToPath(new URL("./owned-root.ts", import.meta.url))],
    env: {...process.env, OWNED_PROCESS_STATE_PATH: statePath},
    stdout: "pipe",
    stderr: "pipe",
});
writeFileSync(`${statePath}.owner`, JSON.stringify({pid: process.pid}), "utf8");
setInterval(() => undefined, 60_000);
