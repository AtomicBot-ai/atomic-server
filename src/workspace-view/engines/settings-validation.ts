/** Validate typed edits and imported presets against the core's descriptors, without coercing values. */
export function settingValuesError(
  values: Readonly<Record<string, unknown>>,
  fields: readonly { key?: unknown; controllerType?: unknown; controllerProps?: unknown }[]
): string | undefined {
  for (const [key, value] of Object.entries(values)) {
    const field = fields.find((f) => f.key === key)
    if (!field) return `Unsupported engine setting: ${key}.`
    const props = (field.controllerProps ?? {}) as Record<string, unknown>
    if (field.controllerType === 'checkbox') {
      if (typeof value !== 'boolean') return `${key} must be true or false.`
    } else if (props['type'] === 'number') {
      // Some core descriptors use numeric text as their default (for example timeout).
      const numeric =
        typeof value === 'number' ||
        (typeof props['value'] === 'string' && typeof value === 'string' && value.trim() !== '')
      const number = Number(value)
      if (
        !numeric ||
        !Number.isFinite(number) ||
        (typeof props['min'] === 'number' && number < props['min']) ||
        (typeof props['max'] === 'number' && number > props['max'])
      )
        return `Enter a valid number for ${key}.`
    } else {
      const options = Array.isArray(props['options']) ? props['options'] : []
      if (options.length) {
        const allowed = options.map((o: unknown) =>
          o && typeof o === 'object' ? (o as Record<string, unknown>)['value'] : o
        )
        if (!allowed.some((option: unknown) => option === value))
          return `${key} must be one of ${allowed.join(', ')}.`
      } else if (typeof value !== 'string') return `${key} must be text.`
    }
  }
  return undefined
}
