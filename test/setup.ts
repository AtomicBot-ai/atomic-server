/**
 * No test touches the real data folder: both `atc` and the core resolve it from these variables,
 * set once per worker to a fresh temporary directory (atomic-agent's state-dir trick).
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const folder = mkdtempSync(join(tmpdir(), 'atc-test-'))
process.env['ATC_DATA_FOLDER'] = join(folder, 'data')
process.env['ATOMIC_CORE_DATA_FOLDER'] = join(folder, 'app-data')
// A server starts its API by default (`api.autoStart`): a test's server must not take 1337 from
// the machine, or from another worker's. Tests that need the API start it themselves.
process.env['ATC_API_AUTO_START'] ??= 'false'
// A server looks for a newer atc on GitHub (`update.checkOnStart`); no test reaches the network.
process.env['ATC_UPDATE_CHECK_ON_START'] ??= 'false'
