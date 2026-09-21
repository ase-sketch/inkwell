import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";

const descendant = spawn(process.execPath, [fileURLToPath(new URL("./owned-descendant.ts", import.meta.url))], {
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
    windowsHide: true,
});
if (!descendant.pid) throw new Error("failed to start descendant fixture");
setInterval(() => undefined, 60_000);
