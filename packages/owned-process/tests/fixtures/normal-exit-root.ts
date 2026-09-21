import {spawn} from "node:child_process";
import {existsSync} from "node:fs";
import {fileURLToPath} from "node:url";

const statePath = process.env.OWNED_PROCESS_STATE_PATH;
if (!statePath) throw new Error("OWNED_PROCESS_STATE_PATH is required");

const descendant = spawn(process.execPath, [fileURLToPath(new URL("./owned-descendant.ts", import.meta.url))], {
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
    windowsHide: true,
});
if (!descendant.pid) throw new Error("自然退出fixture无法启动孙进程。");
descendant.unref();

const ready = setInterval(() => {
    if (!existsSync(statePath)) return;
    clearInterval(ready);
    process.exit(0);
}, 10);
