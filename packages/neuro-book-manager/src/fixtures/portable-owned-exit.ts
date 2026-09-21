const exitCode = Number(process.env.NEURO_BOOK_OWNED_EXIT_CODE ?? "0");

if (!Number.isInteger(exitCode) || exitCode < 0 || exitCode > 255) {
    throw new Error(`Portable exit fixture收到无效退出码：${process.env.NEURO_BOOK_OWNED_EXIT_CODE}`);
}

process.exit(exitCode);
