process.stdin.setEncoding("utf8");
process.stdin.once("data", (data: string) => {
    process.stdout.write(`target:${data.trim()}\n`);
});
