import type {NbThemeModule} from "../../src/theme/theme-manifest";
import {macosSvgDefs} from "./assets/lens";
import {macosColorwayMeta, macosColorways} from "./colorways";
import TimePickerWheel from "./components/TimePickerWheel.vue";
import {manifest} from "./manifest";

import "./vars.css";

export const macosTheme: NbThemeModule = {
    manifest,
    colorways: macosColorways,
    colorwayMeta: macosColorwayMeta,
    svgDefs: macosSvgDefs,
    components: {"time-picker": TimePickerWheel},
};

export default macosTheme;
