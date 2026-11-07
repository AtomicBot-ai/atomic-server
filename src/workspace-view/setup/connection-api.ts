interface Listener {
  host: string
  port: number
}

/** Connecting to the existing listener must not interrupt requests or tear down its sockets. */
export function connectionApiOperation(
  current: (Listener & { running: boolean }) | undefined,
  requested: Listener
): 'api.start' | 'api.restart' {
  return current?.running && (current.host !== requested.host || current.port !== requested.port)
    ? 'api.restart'
    : 'api.start'
}
