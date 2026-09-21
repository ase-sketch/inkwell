declare module "blessed/lib/widgets/screen.js" {
    import type {Widgets} from "blessed";
    const Screen: new (options?: Widgets.IScreenOptions) => Widgets.Screen;
    export default Screen;
}

declare module "blessed/lib/widgets/box.js" {
    import type {Widgets} from "blessed";
    const Box: new (options?: Widgets.BoxOptions) => Widgets.BoxElement;
    export default Box;
}

declare module "blessed/lib/widgets/list.js" {
    import type {Widgets} from "blessed";
    const List: new (options?: Widgets.ListOptions<Widgets.ListElementStyle>) => Widgets.ListElement;
    export default List;
}

declare module "blessed/lib/widgets/question.js" {
    import type {Widgets} from "blessed";
    const Question: new (options?: Widgets.QuestionOptions) => Widgets.QuestionElement;
    export default Question;
}

declare module "blessed/lib/widgets/prompt.js" {
    import type {Widgets} from "blessed";
    const Prompt: new (options?: Widgets.PromptOptions) => Widgets.PromptElement;
    export default Prompt;
}
