import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { ModelRegistry } from '@atomic-chat/core/models'
import type { AtcPaths } from '../../config/index.js'
import type { ArtifactPlan } from './artifact-plan.js'

/** A verified checkpoint becomes loadable through models.installed as soon as its download finishes. */
export async function registerMlx(paths: AtcPaths, plan: ArtifactPlan): Promise<void> {
  if (plan.engine !== 'mlx') return
  const registry = new ModelRegistry(paths.layout, 'mlx')
  if (await registry.find(plan.model_id)) return
  await registry.write(plan.model_id, { model_path: String(plan.load['model_path']), name: plan.name })
}

/** Older ready jobs were registered only on first load; recover them without reviving removed files. */
export async function recoverMlx(paths: AtcPaths, plan: ArtifactPlan): Promise<boolean> {
  if (plan.engine !== 'mlx' || !plan.files.length) return false
  const present = await Promise.all(
    plan.files.map(async (file) => {
      const info = await stat(join(paths.dataFolder, file.save_path)).catch((e: NodeJS.ErrnoException) => {
        if (e.code === 'ENOENT') return null
        throw e
      })
      return info?.isFile() && (file.size === null || file.size === undefined || info.size === file.size)
    })
  )
  if (!present.every(Boolean)) return false
  await registerMlx(paths, plan)
  return true
}
