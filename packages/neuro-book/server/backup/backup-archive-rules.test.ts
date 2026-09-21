import {describe, expect, it} from "vitest";
import {isSqliteFile, sanitizeZipEntryName, shouldExcludeFromBackup} from "nbook/server/backup/backup-archive-rules";

describe("备份排除规则", () => {
    it("排除 logs 目录与锁/临时/wal/shm 文件", () => {
        expect(shouldExcludeFromBackup("logs")).toBe(true);
        expect(shouldExcludeFromBackup("logs/app.log")).toBe(true);
        expect(shouldExcludeFromBackup("workspace/.nbook/neuro-book.sqlite-wal")).toBe(true);
        expect(shouldExcludeFromBackup("workspace/.nbook/neuro-book.sqlite-shm")).toBe(true);
        expect(shouldExcludeFromBackup("workspace/a/.b.lock")).toBe(true);
        expect(shouldExcludeFromBackup("workspace/a/tempfile.tmp")).toBe(true);
        expect(shouldExcludeFromBackup("workspace\\a\\x.tmp")).toBe(true);
    });

    it("保留正常内容文件（含名字里带 logs 的非目录命中）", () => {
        expect(shouldExcludeFromBackup("workspace/manuscript/chapter-1.md")).toBe(false);
        expect(shouldExcludeFromBackup("config.yaml")).toBe(false);
        expect(shouldExcludeFromBackup(".env")).toBe(false);
        expect(shouldExcludeFromBackup("workspace/logs-notes.md")).toBe(false);
        expect(shouldExcludeFromBackup("workspace/.nbook/neuro-book.sqlite")).toBe(false);
    });

    it("SQLite 判定只按 .sqlite 后缀", () => {
        expect(isSqliteFile("workspace/.nbook/neuro-book.sqlite")).toBe(true);
        expect(isSqliteFile("workspace\\a\\.nbook\\project.sqlite")).toBe(true);
        expect(isSqliteFile("workspace/a/data.sqlite3")).toBe(false);
        expect(isSqliteFile("workspace/a/notes.md")).toBe(false);
    });
});

describe("zip 条目名安全化（zip-slip 防护）", () => {
    it("拒绝绝对路径、盘符与 .. 逃逸", () => {
        expect(sanitizeZipEntryName("/etc/passwd")).toBeNull();
        expect(sanitizeZipEntryName("C:/windows/system32")).toBeNull();
        expect(sanitizeZipEntryName("c:\\x")).toBeNull();
        expect(sanitizeZipEntryName("../outside.txt")).toBeNull();
        expect(sanitizeZipEntryName("workspace/../../outside.txt")).toBeNull();
        expect(sanitizeZipEntryName("")).toBeNull();
        expect(sanitizeZipEntryName("//server/share")).toBeNull();
    });

    it("归一化合法路径（反斜杠、冗余段）", () => {
        expect(sanitizeZipEntryName("workspace/manuscript/a.md")).toBe("workspace/manuscript/a.md");
        expect(sanitizeZipEntryName("workspace\\manuscript\\a.md")).toBe("workspace/manuscript/a.md");
        expect(sanitizeZipEntryName("./workspace//a.md")).toBe("workspace/a.md");
        expect(sanitizeZipEntryName("nb-backup.json")).toBe("nb-backup.json");
    });
});
