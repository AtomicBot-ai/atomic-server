/** Keep onboarding downloads within the providers reported by core for the selected engine. */
export function onboardingModelMatchesEngine(
  model: { provider?: string; providers?: readonly string[] },
  choice: string
): boolean {
  const engine = choice.split('|')[0]
  return !engine || (model.providers ?? [model.provider]).includes(engine)
}
