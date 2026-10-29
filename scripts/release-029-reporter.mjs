/** One-release Windows arm64 exception: accept only the observed Vitest reporting-channel timeout. */
export default class Release029Reporter {
  onFinished(_files, errors = []) {
    const unexpected = errors.filter(
      (error) => error?.message !== '[vitest-worker]: Timeout calling "onTaskUpdate"'
    )
    if (unexpected.length)
      throw new Error(
        `Release exception refuses unexpected runner errors:\n${unexpected
          .map((error) => error?.stack ?? error?.message ?? String(error))
          .join('\n')}`
      )
    if (errors.length)
      console.warn(`v0.2.9 exception: accepted ${errors.length} known Vitest reporting-channel timeout(s).`)
  }
}
