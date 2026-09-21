import {fileURLToPath} from "node:url";

import {spawnOwnedProcess} from "#owned-process/index";

const statePath = process.argv[2];
if (!statePath) throw new Error("嵌套Owned Process fixture缺少状态路径。");
const bash = process.argv[3];
const descendant = fileURLToPath(new URL("./owned-root.ts", import.meta.url));
const command = [process.execPath, descendant]
    .map((path) => `'${windowsPathForBash(path).replaceAll("'", "'\\''")}'`)
    .join(" ");

const inner = spawnOwnedProcess({
    command: bash ?? process.execPath,
    args: bash ? ["-lc", command] : [descendant],
    env: {...process.env, OWNED_PROCESS_STATE_PATH: statePath},
    stdout: "pipe",
    stderr: "pipe",
});
inner.stdout?.pipe(process.stdout);
inner.stderr?.pipe(process.stderr);
await inner.completion;

/** 把Windows路径转换为Git Bash路径。 */
function windowsPathForBash(path: string): string {
    const normalized = path.replaceAll("\\", "/");
    const drive = /^([A-Za-z]):\/(.*)$/u.exec(normalized);
    return drive ? `/${drive[1]?.toLowerCase()}/${drive[2]}` : normalized;
}
