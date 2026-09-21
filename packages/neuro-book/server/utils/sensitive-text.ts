const REDACTED = "[REDACTED]";

const SENSITIVE_LABEL = "api[-_ ]?key|apikey|authorization|cookie|set-cookie|password|token|secret|credential|device[-_ ]?code|grant|access[-_ ]?token|refresh[-_ ]?token|recovery[-_ ]?code|backup[-_ ]?key|backup[-_ ]?keyring";
const SENSITIVE_VALUE_LABEL = "api[-_ ]?key|apikey|password|token|secret|credential|device[-_ ]?code|grant|access[-_ ]?token|refresh[-_ ]?token|recovery[-_ ]?code|backup[-_ ]?key|backup[-_ ]?keyring";

/**
 * 清理自由文本中的常见凭据片段。
 *
 * 该函数只处理文本，不负责业务级截断。Provider 错误与应用日志共用它，避免两套
 * 正则逐渐分叉。敏感 label 后无法可靠判断值边界时宁可多清理当前片段，也不保留凭据。
 */
export function redactSensitiveText(input: string): string {
    return input
        .replace(new RegExp(`(["'](?:${SENSITIVE_LABEL})["']\\s*:\\s*["'])[^"']*(["'])`, "giu"), `$1${REDACTED}$2`)
        .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/=:-]+/giu, `$1 ${REDACTED}`)
        .replace(/(\bauthorization\s*[:=]\s*)(?!(?:Bearer|Basic)\b)[^\s,;}]+/giu, `$1${REDACTED}`)
        .replace(new RegExp(`\\b(cookie|set-cookie)\\s*[:=]\\s*[^\\r\\n]+`, "giu"), `$1=${REDACTED}`)
        .replace(new RegExp(`(\\b(?:${SENSITIVE_VALUE_LABEL})\\s*[:=]\\s*)(?:"[^"]*"|'[^']*'|[^\\s,;}]+)`, "giu"), `$1${REDACTED}`)
        .replace(/\bNBK1-[A-Za-z0-9_-]{43}-[0-9a-f]{8}\b/gu, REDACTED)
        .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/gu, REDACTED);
}
