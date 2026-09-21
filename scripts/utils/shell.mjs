/** 平台 shell 与命令探测工具。 */

import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {delimiter, resolve} from 'node:path';
import {run} from './spawn.mjs';

/** 检查命令是否可用，失败时抛出异常。 */
export async function needCommand(command, args = ['--version']) {
    await run(command, args, {stdio: 'ignore'});
}

/** 检查命令是否能启动，返回布尔值。 */
export async function commandAvailable(command, args = ['--version']) {
    try {
        if (process.platform === 'win32') {
            const psArgs = args.map((item) => psQuote(item)).join(', ');
            await run('powershell.exe', [
                '-NoProfile',
                '-ExecutionPolicy',
                'Bypass',
                '-Command',
                `$command = Get-Command ${psQuote(command)} -ErrorAction Stop; & $command.Source ${psArgs} | Out-Null`,
            ], {stdio: 'ignore'});
            return true;
        }

        await needCommand(command, args);
        return true;
    } catch {
        return false;
    }
}

/** PowerShell 单引号字符串转义。 */
export function psQuote(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
}

/** 运行平台 shell 命令，主要用于系统包管理器安装命令。 */
export async function runShell(commandLine, options = {}) {
    if (process.platform === 'win32') {
        await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', commandLine], options);
        return;
    }

    await run('sh', ['-lc', commandLine], options);
}

/** 把脚本安装器常见落点加入当前进程 PATH，避免安装后需要重开终端。 */
export function refreshInstallPath() {
    const candidates = process.platform === 'win32'
        ? [
            resolve(process.env.LOCALAPPDATA ?? '', 'Programs', 'Bun', 'bin'),
            resolve(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'cmd'),
        ]
        : [
            resolve(homedir(), '.bun', 'bin'),
            '/opt/homebrew/bin',
            '/usr/local/bin',
        ];
    const current = process.env.PATH ?? '';
    const parts = current.split(delimiter).filter(Boolean);
    for (const candidate of candidates) {
        if (candidate && existsSync(candidate) && !parts.includes(candidate)) {
            parts.unshift(candidate);
        }
    }
    process.env.PATH = parts.join(delimiter);
}
