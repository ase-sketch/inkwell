-- 章节快照时光机（M7）：作者主动标记的命名存档点。
-- 只存指针：章节路径 + 指向 nb-history 时间线条目的 entry_id + 可选备注 + 拍摄时间。
-- 正文与版本内容一律由 nb-history 快照提供，快照表本身不存正文。
CREATE TABLE "ChapterSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "path" TEXT NOT NULL,
    "entryId" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "ChapterSnapshot_path_idx" ON "ChapterSnapshot"("path");
