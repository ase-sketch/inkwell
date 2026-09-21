import {useNovelIdeStore} from "nbook/app/stores/novel-ide";
import {useConfigApi} from "nbook/app/composables/useConfigApi";
import {useNotification} from "nbook/app/composables/useNotification";
import {resolveApiErrorMessage} from "nbook/app/utils/api-error";
import {resolveTheme} from "nbook/app/utils/theme/resolve-theme";
import type {ConfigEditorSnapshotDto, GlobalConfigUpdateDto} from "nbook/shared/dto/config.dto";
import type {CustomThemeDto} from "nbook/shared/theme/theme-vars";

type GlobalUiConfig = NonNullable<GlobalConfigUpdateDto["ui"]>;

/**
 * 自定义主题 DTO 转成 Global Config 可写入结构。
 */
function toGlobalCustomThemes(customThemes: CustomThemeDto[]): GlobalUiConfig["customThemes"] {
    return customThemes.map((theme) => ({
        id: theme.id,
        name: theme.name,
        appearance: theme.appearance,
        vars: {...theme.vars},
    }));
}

/**
 * 构造保存全局主题设置的 payload。
 */
function buildGlobalConfigPayload(
    snapshot: ConfigEditorSnapshotDto,
    themeId: string,
    customThemes: CustomThemeDto[],
): GlobalConfigUpdateDto {
    const base = snapshot.global ?? {};
    return {
        ui: {
            ...(base.ui ?? {}),
            theme: themeId,
            customThemes: toGlobalCustomThemes(customThemes),
            costCurrency: base.ui?.costCurrency ?? "USD",
        },
    };
}

/**
 * 主题运行时管理：立即应用前端状态，并把主题配置静默保存进 Global Config。
 */
export function useThemeManager() {
    const novelIdeStore = useNovelIdeStore();
    const configApi = useConfigApi();
    const notification = useNotification();
    let saveRevision = 0;

    /**
     * 保存并应用主题配置。失败时恢复调用前的主题状态。
     */
    async function saveThemeConfig(themeId: string, customThemes: CustomThemeDto[] = novelIdeStore.customThemes): Promise<boolean> {
        const previousThemeId = novelIdeStore.activeThemeId;
        const previousCustomThemes = [...novelIdeStore.customThemes];
        const resolvedTheme = resolveTheme(themeId, customThemes);
        const revision = ++saveRevision;

        novelIdeStore.applyThemeConfig(resolvedTheme.id, customThemes);

        try {
            const snapshot = await configApi.editorSnapshot();
            const savedSnapshot = await configApi.saveGlobal(
                buildGlobalConfigPayload(snapshot, resolvedTheme.id, customThemes),
            );
            if (revision !== saveRevision) {
                return true;
            }
            novelIdeStore.applyThemeConfig(
                savedSnapshot.global.ui?.theme ?? resolvedTheme.id,
                savedSnapshot.global.ui?.customThemes ?? customThemes,
            );
            return true;
        } catch (error) {
            if (revision === saveRevision) {
                novelIdeStore.applyThemeConfig(previousThemeId, previousCustomThemes);
            }
            notification.error(resolveApiErrorMessage(error, "主题保存失败，已恢复到上一个主题"), {title: "主题保存失败"});
            return false;
        }
    }

    /**
     * 切换当前主题。
     */
    async function setTheme(themeId: string): Promise<boolean> {
        if (themeId === novelIdeStore.activeThemeId) {
            return true;
        }
        return saveThemeConfig(themeId);
    }

    return {
        setTheme,
        saveThemeConfig,
    };
}
