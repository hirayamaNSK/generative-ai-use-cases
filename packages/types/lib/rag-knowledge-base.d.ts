export type ExplicitFilterConfiguration = {
    key: string;
    type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'STRING_LIST';
    defaultValue?: string | number | boolean | string[];
    options?: {
        value: string;
        label: string;
    }[];
    range?: {
        min?: number;
        max?: number;
    };
    description: string;
};
