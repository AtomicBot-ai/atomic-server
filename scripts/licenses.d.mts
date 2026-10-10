// Types for `licenses.mjs`, for its tests.
export declare const ALLOWED: ReadonlySet<string>
export declare function licenseOf(pkg: Record<string, unknown>): string | undefined
export declare function allowed(expression: unknown): boolean
