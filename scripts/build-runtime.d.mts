export const BUN_VERSION: string
export function assertBuildRuntime(
  run?: (
    command: string,
    args: string[],
    options: { encoding: 'utf8' }
  ) => { status: number | null; stdout?: string }
): void
