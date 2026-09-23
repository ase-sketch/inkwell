import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

const accountMenuPath = fileURLToPath(new URL("../NovelIdeAccountMenu.vue", import.meta.url));
const activityBarPath = fileURLToPath(new URL("../NovelIdeActivityBar.vue", import.meta.url));
const pickerPath = fileURLToPath(new URL("../ProjectPickerScreen.vue", import.meta.url));
const profileDialogPath = fileURLToPath(new URL("../NovelIdeProfileDialog.vue", import.meta.url));
const profilePanelPath = fileURLToPath(new URL("./NovelIdePassportProfilePanel.vue", import.meta.url));
const indexPagePath = fileURLToPath(new URL("../../../pages/index.vue", import.meta.url));
const dialogPath = fileURLToPath(new URL("../../common/Dialog.vue", import.meta.url));

describe("Novel IDE profile frontend contract", () => {
    it("Activity Bar 在 Project 与书架页复用同一账户菜单", async () => {
        const [accountMenu, activityBar, picker, indexPage] = await Promise.all([
            readFile(accountMenuPath, "utf8"),
            readFile(activityBarPath, "utf8"),
            readFile(pickerPath, "utf8"),
            readFile(indexPagePath, "utf8"),
        ]);

        expect(accountMenu).toContain("props.currentUser?.role === \"admin\"");
        expect(accountMenu).toContain("ide.header.localLogout");
        expect(activityBar).toContain("<NovelIdeAccountMenu");
        expect(activityBar).not.toContain("const userMenuItems");
        expect(picker).not.toContain("<slot name=\"header-actions\"></slot>");
        expect(picker).not.toContain("/api/auth/");
        expect(indexPage).not.toContain("<template #header-actions>");
        expect(indexPage).toContain("<NovelIdeActivityBar");
        expect(indexPage).toContain(':current-user="currentUser"');
    });

    it("Profile 文件归属和命名不再依赖设置面板", async () => {
        const dialog = await readFile(profileDialogPath, "utf8");
        expect(dialog).toContain("profile/NovelIdePassportProfilePanel.vue");
        expect(dialog).toContain("<NovelIdePassportProfilePanel />");
        expect(dialog).not.toContain("NovelIdePassportSettingsPanel");
    });

    it("关联状态具有 loading、error、loaded 三态且错误可重试", async () => {
        const panel = await readFile(profilePanelPath, "utf8");
        expect(panel).toContain("const statusError = ref(\"\")");
        expect(panel).toContain("statusError.value = \"\";");
        expect(panel).toContain("status.value = null;");
        expect(panel).toContain("statusError.value = resolveApiErrorMessage(error, t(\"ide.profile.loadFailed\"))");
        expect(panel).toContain("v-if=\"statusLoading && !status\"");
        expect(panel).toContain("v-else-if=\"statusError\"");
        expect(panel).toContain("v-else-if=\"status\"");
        expect(panel).toContain("@click=\"void loadStatus()\"");
    });

    it("个人中心弹窗具备完整的宿主挂载与 Teleport 降级回退契约", async () => {
        const [indexPage, dialog] = await Promise.all([
            readFile(indexPagePath, "utf8"),
            readFile(dialogPath, "utf8"),
        ]);

        // 宿主节点必须静态带有 novel-ide-theme，防止子组件挂载时 Teleport 无法定位目标
        expect(indexPage).toContain('class="novel-ide-page novel-ide-theme ide-shell');
        expect(indexPage).toContain('@open-profile="accountProfileOpen = true"');
        expect(indexPage).toContain('<NovelIdeProfileDialog v-model="accountProfileOpen" />');

        // Dialog.vue 必须具有 resolvedTeleportTarget 并降级回退到 body + 给出警告
        expect(dialog).toContain("resolvedTeleportTarget");
        expect(dialog).toContain("console.warn(");
        expect(dialog).toContain('降级回退到 "body"');
    });
});
