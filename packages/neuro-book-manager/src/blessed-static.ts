import Box from "blessed/lib/widgets/box.js";
import List from "blessed/lib/widgets/list.js";
import Prompt from "blessed/lib/widgets/prompt.js";
import Question from "blessed/lib/widgets/question.js";
import Screen from "blessed/lib/widgets/screen.js";
import type {Widgets} from "blessed";

/**
 * 只静态引入 Manager TUI 使用的 blessed widgets。
 * blessed 的顶层入口会动态 require 全部 widgets，无法形成可独立运行的 Bun 单文件 bundle。
 */
export const blessedStatic = {
    screen(options?: Widgets.IScreenOptions): Widgets.Screen {
        return new Screen(options);
    },
    box(options?: Widgets.BoxOptions): Widgets.BoxElement {
        return new Box(options);
    },
    list(options?: Widgets.ListOptions<Widgets.ListElementStyle>): Widgets.ListElement {
        return new List(options);
    },
    question(options?: Widgets.QuestionOptions): Widgets.QuestionElement {
        return new Question(options);
    },
    prompt(options?: Widgets.PromptOptions): Widgets.PromptElement {
        return new Prompt(options);
    },
};
