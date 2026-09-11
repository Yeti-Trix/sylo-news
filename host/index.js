// sylo-news host plugin — minimal Sylo-only surface per the frozen contract
// (.prd/SYLO_HOST_PLUGIN_MANIFEST.md in the sylo-dev repo).
//
// Vanilla Pi never reads the `pi.sylo` manifest block, so this file is never
// loaded outside Sylo: the package stays a 100% ordinary pi package there.
// Inside Sylo, the generic host-plugin loader discovers this package (installed
// from npm or a local path) and loads this ESM entry.
//
// Surface (deliberately minimal for the first npm-published host-plugin pilot):
//   - ops: `news.ping` — one RPC op proving the npm-installed plugin is loaded.
//   - settingsCard: none yet (the current Sylo settings-card shape is a
//     directory picker — a topic-picker card is a later enhancement).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

let version = 'unknown'
try {
  const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'))
  if (typeof pkg.version === 'string') version = pkg.version
} catch {
  /* version is advisory only */
}

export function createSyloHostPlugin() {
  return {
    ops: ['news.ping'],
    rpc: (op) => {
      if (op === 'news.ping') return { ok: true, plugin: 'sylo-news', version }
      return Promise.reject(new Error(`unknown_op:${op}`))
    },
  }
}