// Types for `check-module-boundaries.mjs`, for its tests.
export interface Specifier {
  kind: 'import' | 'mock' | 'url' | 'css'
  text: string
  line: number
}
export declare function specifiers(source: string, fileName?: string): Specifier[]
export declare function cssSpecifiers(source: string): Specifier[]
export declare function moduleOf(path: string): string | null
export declare function checkFile(options: {
  file: string
  source: string
  /** What a repository path is: a file, a folder, or nothing. */
  stat: (path: string) => 'file' | 'dir' | null
  aliases?: Record<string, string>
}): string[]
