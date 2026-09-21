import {spawnOwnedProcess} from "#owned-process/index";

const target = process.argv[2];
if (!target) throw new Error("继承stdin fixture缺少目标路径。");

const lease = spawnOwnedProcess({
    command: process.execPath,
    args: [target],
    stdin: "inherit",
    stdout: "pipe",
    stderr: "pipe",
});
lease.stdout?.pipe(process.stdout);
lease.stderr?.pipe(process.stderr);
const completion = await lease.completion;
process.exitCode = completion.exitCode ?? 1;
