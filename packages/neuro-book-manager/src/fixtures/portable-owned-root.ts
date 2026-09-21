import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";

const descendant = spawn(process.execPath, [
    fileURLToPath(new URL("./portable-owned-descendant.ts", import.meta.url)),
], {
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
    windowsHide: true,
});
if (!descendant.pid) throw new Error("Portable fixture无法启动孙进程。");

setInterval(() => undefined, 60_000);
