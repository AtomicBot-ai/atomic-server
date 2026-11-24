/** Model downloads: resumable, verified, parallel byte ranges written in place, proxies and progress. */
export { Downloader, DOWNLOAD_CANCELLED, PROXY_CONFIG_INVALID } from './downloader.js'
export type { DownloaderDeps, DownloadItem, DownloadOptions, DownloadProgress } from './downloader.js'
export { DownloadRequestError, validateProxyConfig } from './protocol.js'
export { HASH_MISMATCH_MESSAGE, VALIDATION_CANCELLED_MESSAGE, verifyDownloadedFile } from './verify.js'
export type { ProxyConfig } from './protocol.js'
export { discardDownloadFiles } from './discard.js'
export { bytesOnDisk, stagedDownloadBytes, DEFAULT_STREAMS, MIN_RANGED_BYTES } from './on-disk.js'

export { policyFetchFor } from './proxy-fetch.js'
