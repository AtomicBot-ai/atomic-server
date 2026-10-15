// Types for `gen-module-map.mjs`, for its tests.
export declare function leadingDoc(source: string): string | undefined
export declare function moduleRows(srcDir: string): { rows: string[]; missing: string[] }
export declare function renderTable(rows: string[]): string
export declare function replaceBlock(text: string, block: string): string
