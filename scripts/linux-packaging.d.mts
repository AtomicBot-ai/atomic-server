// Types for `linux-packaging.mjs`, for its tests.
export interface PackageTarget {
  triple: string
  nfpm: string
  deb: string
  rpm: string
  node: string
}
export interface GithubRelease {
  tag_name: string
  draft: boolean
  prerelease: boolean
  assets?: Array<{ name: string }>
}
export type SyncStep = { op: 'put'; path: string; cacheControl: string } | { op: 'delete'; path: string }

export declare const PACKAGE_TARGETS: readonly PackageTarget[]
export declare const PACKAGE_FORMATS: readonly ['deb', 'rpm']
export declare const LICENSE_FILES: readonly string[]
export declare function packageFileName(version: string, format: 'deb' | 'rpm', target: PackageTarget): string
export declare function packageAssets(version: string): string[]
export declare function binaryAsset(version: string, triple: string): string
export declare function archPkgver(version: string): string
export declare function glibcFloor(readelfVersions: string): string
export declare function parseSha256Sums(text: string): Record<string, string>
export declare function renderPkgbuild(
  template: string,
  values: { version: string; sums: Record<string, string>; sourceBase: string }
): string
export declare function selectReleases(
  releases: GithubRelease[],
  keep?: number
): Array<{ tag: string; version: string }>
export declare function repoPath(file: string): string
export declare function renderRepoFile(options: { baseUrl: string; packageSignatures?: boolean }): string
export declare function contentType(path: string): string
export declare function cacheControl(path: string): string
export declare function syncPlan(local: string[], remote: string[]): SyncStep[]
export declare function readmeInstallBlock(readme: string, name: string): string
