/**
 * Every line an engine prints (the core's `backendOutput`), kept in `atc/logs/engines.log` under
 * its provider and model: what a crash said, read back by `atc models logs` and `atc run`'s failure
 * tail. Rotated like the server log; without it engine output went nowhere.
 */

import { fileSink } from '../output/index.js'
import type { FileSinkOptions } from '../output/index.js'

export interface EngineLine {
  provider: string
  model: string
  stream: string
  line: string
}

export function engineOutputSink(path: string, options: Omit<FileSinkOptions, 'format'>) {
  const sink = fileSink(path, { ...options, format: 'text' })
  return (o: EngineLine): void =>
    sink({
      time: Date.now(),
      level: 'info',
      scope: `${o.provider}/${o.model}`,
      message: `[${o.stream}] ${o.line}`,
      fields: undefined,
    })
}
