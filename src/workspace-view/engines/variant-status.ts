/** Short UI status; the core's detailed reason is shown separately from the choice label. */
export function engineVariantStatus(verdict: string): string {
  return (
    (
      {
        'ok': 'Ready',
        'accelerator-not-prepared': 'Needs preparation',
        'engine-not-installed': 'Install engine first',
        'accelerator-unavailable': 'Unavailable on this device',
        'unsupported': 'Not supported',
      } as Record<string, string>
    )[verdict] ?? 'Needs attention'
  )
}
