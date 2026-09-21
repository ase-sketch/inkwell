#!/usr/bin/env bun

import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Command} from 'commander';

const scriptPath = fileURLToPath(import.meta.url);
const defaultRange = 'HEAD';

/** 读取命令行参数。 */
function parseArgs() {
    const program = new Command()
        .name('fix-fenced-commit-messages')
        .description('修复被 AI 前置说明或 markdown fence 包住的 Git commit message。')
        .allowExcessArguments(false)
        .showHelpAfterError('(使用 --help 查看可用参数)')
        .option('--range <rev-range>', '要扫描的 git revision range。', defaultRange)
        .option('--apply', '实际改写历史；默认只 dry-run。', false)
        .option('--filter-message', 'git filter-branch --msg-filter 内部模式。', false)
        .addHelpText('after', `

Examples:
  bun scripts/git/fix-fenced-commit-messages.mjs --range main..HEAD
  bun scripts/git/fix-fenced-commit-messages.mjs --range HEAD~20..HEAD --apply

说明：
  默认只 dry-run。真正改写历史必须传 --apply。
  脚本会把 AI 前置说明 + fenced block，或纯 fenced block，改成 fenced code block 内的内容。`);

    program.parse(process.argv);
    return program.opts();
}

/** 执行 git 命令并返回 stdout。 */
function git(args, options = {}) {
    const result = spawnSync('git', args, {
        cwd: process.cwd(),
        encoding: 'utf8',
        windowsHide: true,
        ...options,
    });

    if (result.status !== 0) {
        const detail = result.stderr.trim() || result.stdout.trim();
        throw new Error(`git ${args.join(' ')} 失败：${detail}`);
    }

    return result.stdout;
}

/** 从 fenced block 中提取真正的提交信息。 */
function normalizeMessage(message) {
    const trimmed = message.trim();
    const onlyFenceMatch = trimmed.match(/^(`{3,}|~{3,})[^\r\n]*\r?\n([\s\S]*?)\r?\n\s*\1\s*$/);
    if (onlyFenceMatch) {
        const inner = onlyFenceMatch[2].trim();
        return inner ? `${inner}\n` : null;
    }

    const fenceMatch = trimmed.match(/^(.+?)\r?\n\s*(`{3,}|~{3,})[^\r\n]*\r?\n([\s\S]*?)\r?\n\s*\2\s*$/);
    if (!fenceMatch) {
        return null;
    }

    const prefix = fenceMatch[1].trim();
    const inner = fenceMatch[3].trim();
    if (!inner) {
        return null;
    }

    const looksLikeAssistantPreface = [
        /^here is\b/i,
        /^sure[,.! ]/i,
        /^以下是/,
        /^下面是/,
        /^这是/,
        /^提交信息/,
        /^建议的提交信息/,
    ].some((pattern) => pattern.test(prefix));

    if (!looksLikeAssistantPreface) {
        return null;
    }

    return `${inner}\n`;
}

/** msg-filter 模式：从 stdin 读原 message，stdout 输出新 message。 */
async function runFilterMode() {
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(chunk);
    }
    const message = Buffer.concat(chunks).toString('utf8');
    process.stdout.write(normalizeMessage(message) ?? message);
}

/** 返回 range 内需要修复的提交。 */
function findCandidates(range) {
    const output = git(['log', '--reverse', '--format=%x1e%H%x00%B', range]);
    return output
        .split('\x1e')
        .filter(Boolean)
        .map((record) => {
            const separatorIndex = record.indexOf('\x00');
            const hash = record.slice(0, separatorIndex);
            const message = record.slice(separatorIndex + 1);
            const normalized = normalizeMessage(message);
            return {hash, message, normalized};
        })
        .filter((commit) => commit.normalized !== null);
}

/** 输出 dry-run 预览。 */
function printPreview(candidates) {
    if (candidates.length === 0) {
        console.log('未发现需要修复的提交信息。');
        return;
    }

    console.log(`发现 ${candidates.length} 个需要修复的提交：`);
    for (const candidate of candidates) {
        const before = candidate.message.trim().split(/\r?\n/)[0];
        const after = candidate.normalized.trim().split(/\r?\n/)[0];
        console.log(`- ${candidate.hash.slice(0, 12)}: ${before}`);
        console.log(`  -> ${after}`);
    }
}

/** 确保改写历史前工作区干净。 */
function assertCleanWorktree() {
    const status = git(['status', '--porcelain=v1', '-uall']);
    if (status.trim()) {
        throw new Error('工作区不干净。请先提交或暂存现有改动，再运行 --apply。');
    }
}

/** 用 git filter-branch 改写提交信息。 */
function applyRewrite(range) {
    assertCleanWorktree();
    const result = spawnSync('git', [
        'filter-branch',
        '--force',
        '--msg-filter',
        `bun "${scriptPath}" --filter-message`,
        '--',
        range,
    ], {
        cwd: process.cwd(),
        encoding: 'utf8',
        windowsHide: true,
    });

    if (result.status !== 0) {
        const detail = result.stderr.trim() || result.stdout.trim();
        throw new Error(`git filter-branch 失败：${detail}`);
    }

    console.log(result.stdout.trim());
}

/** 主流程。 */
async function main() {
    const args = parseArgs();
    if (args.filterMessage) {
        await runFilterMode();
        return;
    }

    const candidates = findCandidates(args.range);
    printPreview(candidates);
    if (candidates.length === 0 || !args.apply) {
        if (candidates.length > 0) {
            console.log('\n当前是 dry-run。确认无误后加 --apply 真正改写历史。');
        }
        return;
    }

    applyRewrite(args.range);
    console.log('\n提交信息已改写。若这些提交已经推送过，需要使用 force-with-lease 推送。');
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
