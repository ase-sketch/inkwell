#!/bin/sh
set -eu

INTERACTIVE=false
if [ "$#" -eq 0 ]; then
    if ( : </dev/tty ) 2>/dev/null; then
        INTERACTIVE=true
    else
        echo "NeuroBook Stage 0 无法打开交互终端。自动化安装请显式传参，例如：curl .../install.sh | sh -s -- --profile ghcr --yes" >&2
        exit 1
    fi
fi

HOST_OS="$(uname -s)"
case "$HOST_OS:$(uname -m)" in
    Linux:x86_64|Linux:amd64) BUN_ASSET="bun-linux-x64" ;;
    Linux:aarch64|Linux:arm64) BUN_ASSET="bun-linux-aarch64" ;;
    Darwin:x86_64|Darwin:amd64) BUN_ASSET="bun-darwin-x64" ;;
    Darwin:arm64|Darwin:aarch64) BUN_ASSET="bun-darwin-aarch64" ;;
    *) echo "NeuroBook Manager v1 Stage 0 只支持 Linux/macOS x64或ARM64。" >&2; exit 1 ;;
esac

BUN_VERSION="1.3.14"
MANAGER_TAG="${NEURO_BOOK_MANAGER_TAG:-canary}"
CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"
RUNTIME_ROOT="$CACHE_HOME/neuro-book-manager/runtime/bun/$BUN_VERSION"
BUN_BIN="$RUNTIME_ROOT/$BUN_ASSET/bun"
ASSET_URL="https://github.com/oven-sh/bun/releases/download/bun-v$BUN_VERSION/$BUN_ASSET.zip"

# 各平台/架构对应的archive和bun可执行文件sha256。
case "$BUN_ASSET" in
    bun-linux-x64)
        ARCHIVE_SHA256="951ee2aee855f08595aeec6225226a298d3fea83a3dcd6465c09cbccdf7e848f"
        BUN_SHA256="9fd36f87e4b90b07632b987a2e4ec81ca15a62c81bf983190cea6d715be2ad74"
        ;;
    bun-linux-aarch64)
        ARCHIVE_SHA256="a27ffb63a8310375836e0d6f668ae17fa8d8d18b88c37c821c65331973a19a3b"
        BUN_SHA256="37141662ebed915a2ab89313156e455e2a1374395f5f6760d06407f49406f086"
        ;;
    bun-darwin-x64)
        ARCHIVE_SHA256="4183df3374623e5bab315c547cfa0974533cd457d86b73b639f7a87974cd6633"
        BUN_SHA256="ea2f223e94bb2f4bf3050895113c3cf346438f6fa0501c8532284e063f72f7a0"
        ;;
    bun-darwin-aarch64)
        ARCHIVE_SHA256="d8b96221828ad6f97ac7ac0ab7e95872341af763001e8803e8267652c2652620"
        BUN_SHA256="e0c90ec15d33363e6b70713d56bc3b2c7585c17f40a0fe0f8fd9305901d4e233"
        ;;
esac

if [ "$HOST_OS" = "Linux" ] && ! getconf GNU_LIBC_VERSION >/dev/null 2>&1; then
    echo "NeuroBook Manager v1 只支持 Linux glibc。" >&2
    exit 1
fi

for required_command in curl unzip awk chmod mktemp; do
    if ! command -v "$required_command" >/dev/null 2>&1; then
        echo "NeuroBook Stage 0 缺少命令：$required_command" >&2
        exit 1
    fi
done
if [ "$HOST_OS" = "Darwin" ]; then
    command -v shasum >/dev/null 2>&1 || { echo "NeuroBook Stage 0 缺少命令：shasum" >&2; exit 1; }
else
    command -v sha256sum >/dev/null 2>&1 || { echo "NeuroBook Stage 0 缺少命令：sha256sum" >&2; exit 1; }
fi

checksum() {
    if [ "$HOST_OS" = "Darwin" ]; then
        shasum -a 256 "$1" | awk '{print $1}'
    else
        sha256sum "$1" | awk '{print $1}'
    fi
}

cached_valid=false
downloaded=false
if [ -f "$BUN_BIN" ]; then
    actual_bun="$(checksum "$BUN_BIN")"
    if [ "$actual_bun" = "$BUN_SHA256" ]; then
        chmod 755 "$BUN_BIN"
        actual_version="$($BUN_BIN --version 2>/dev/null || true)"
        if [ -x "$BUN_BIN" ] && [ "$actual_version" = "$BUN_VERSION" ]; then cached_valid=true; fi
    fi
fi

if [ "$cached_valid" != true ]; then
    rm -rf "$RUNTIME_ROOT"
    stage="$(mktemp -d)"
    downloaded=true
    trap 'rm -rf "$stage" "$RUNTIME_ROOT"' EXIT INT TERM
    curl -fsSL "$ASSET_URL" -o "$stage/$BUN_ASSET.zip"
    actual="$(checksum "$stage/$BUN_ASSET.zip")"
    if [ "$actual" != "$ARCHIVE_SHA256" ]; then
        echo "NeuroBook Stage 0 Bun archive checksum不匹配。" >&2
        exit 1
    fi
    mkdir -p "$RUNTIME_ROOT"
    unzip -q "$stage/$BUN_ASSET.zip" -d "$RUNTIME_ROOT"
    chmod 755 "$BUN_BIN"
fi

if [ ! -x "$BUN_BIN" ]; then
    rm -rf "$RUNTIME_ROOT"
    echo "NeuroBook Stage 0 Bun不可执行：$BUN_BIN" >&2
    exit 1
fi
actual_bun="$(checksum "$BUN_BIN")"
actual_version="$($BUN_BIN --version 2>/dev/null || true)"
if [ "$actual_bun" != "$BUN_SHA256" ] || [ "$actual_version" != "$BUN_VERSION" ]; then
    rm -rf "$RUNTIME_ROOT"
    echo "NeuroBook Stage 0 Bun executable校验失败。" >&2
    exit 1
fi
if [ "$downloaded" = true ]; then
    rm -rf "$stage"
    trap - EXIT INT TERM
fi

export NEURO_BOOK_STAGE0_BUN_PATH="$BUN_BIN"
export NEURO_BOOK_STAGE0_BUN_VERSION="$BUN_VERSION"
export NEURO_BOOK_STAGE0_BUN_SOURCE_URL="$ASSET_URL"
export NEURO_BOOK_STAGE0_BUN_ARCHIVE_SHA256="$ARCHIVE_SHA256"
export NEURO_BOOK_STAGE0_BUN_SHA256="$BUN_SHA256"
if [ "$INTERACTIVE" = true ]; then
    exec "$BUN_BIN" x --bun "@notnotype/neuro-book-manager@$MANAGER_TAG" install </dev/tty
fi
exec "$BUN_BIN" x --bun "@notnotype/neuro-book-manager@$MANAGER_TAG" install "$@"
