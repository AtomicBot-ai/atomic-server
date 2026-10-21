// Types for `check-core-boundary.mjs`, for its tests.
export declare const CORE_OWNED: Record<string, string>
export declare function literals(source: string, fileName?: string): Array<{ text: string; line: number }>
export declare function comments(source: string, fileName?: string): Array<{ text: string; line: number }>
export declare function markers(
  source: string,
  fileName?: string
): Array<{ kind: string; line: number; name?: string; until?: string | undefined; error?: string }>
export declare function checkFile(
  source: string,
  options: { file: string; production: boolean; pinned: string }
): string[]
export declare function corePin(pkg: { dependencies?: Record<string, string> }): {
  pinned?: string
  problem?: string
}
