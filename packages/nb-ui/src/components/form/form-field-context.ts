import {inject} from "vue";
import type {ComputedRef, InjectionKey} from "vue";

export type FormFieldContext = {
    inputId: ComputedRef<string | undefined>;
    descriptionId: ComputedRef<string | undefined>;
    errorId: ComputedRef<string | undefined>;
    ariaDescribedby: ComputedRef<string | undefined>;
    required: ComputedRef<boolean>;
    invalid: ComputedRef<boolean>;
};

export const NB_FORM_FIELD_CONTEXT_KEY: InjectionKey<FormFieldContext> = Symbol("nb-form-field-context");

export function useFormFieldContext(): FormFieldContext | null {
    return inject(NB_FORM_FIELD_CONTEXT_KEY, null);
}
