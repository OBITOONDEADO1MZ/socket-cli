import { debugDir, debugFn, isDebug } from '@socketsecurity/registry/lib/debug'

import { agentFix } from './agent-fix.mts'
import { getActualTree } from './get-actual-tree.mts'
import { getFixAlertsMapOptions } from './shared.mts'
import { Arborist } from '../../shadow/npm/arborist/index.mts'
import { SAFE_WITH_SAVE_ARBORIST_REIFY_OPTIONS_OVERRIDES } from '../../shadow/npm/arborist/lib/arborist/index.mts'
import {
  findPackageNode,
  getAlertsMapFromArborist,
  updateNode,
} from '../../shadow/npm/arborist-helpers.mts'
import { runAgentInstall } from '../../utils/agent.mts'
import { getAlertsMapFromPurls } from '../../utils/alerts-map.mts'
import { getNpmConfig } from '../../utils/npm-config.mts'

import type { FixConfig, InstallOptions } from './agent-fix.mts'
import type { NodeClass } from '../../shadow/npm/arborist/types.mts'
import type { CResult } from '../../types.mts'
import type { EnvDetails } from '../../utils/package-environment.mts'
import type { PackageJson } from '@socketsecurity/registry/lib/packages'

async function install(
  pkgEnvDetails: EnvDetails,
  options: InstallOptions,
): Promise<NodeClass | null> {
  const {
    args: extraArgs,
    cwd,
    spinner,
  } = {
    __proto__: null,
    ...options,
  } as InstallOptions
  const args = [
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--no-progress',
    '--no-save',
    '--silent',
    ...(extraArgs ?? []),
  ]
  const quotedCmd = `\`${pkgEnvDetails.agent} install ${args.join(' ')}\``
  debugFn('stdio', `spawn: ${quotedCmd}`)

  const isSpinning = spinner?.isSpinning
  spinner?.stop()

  let errored = false
  try {
    await runAgentInstall(pkgEnvDetails, {
      args,
      spinner,
      stdio: isDebug('stdio') ? 'inherit' : 'ignore',
    })
  } catch (e) {
    debugFn('error', `caught: ${quotedCmd} failed`)
    debugDir('inspect', { error: e })
    errored = true
  }

  let actualTree: NodeClass | null = null
  if (!errored) {
    try {
      actualTree = await getActualTree(cwd)
    } catch (e) {
      debugFn('error', 'caught: Arborist error')
      debugDir('inspect', { error: e })
    }
  }
  if (isSpinning) {
    spinner.start()
  }
  return actualTree
}

export async function npmFix(
  pkgEnvDetails: EnvDetails,
  fixConfig: FixConfig,
): Promise<CResult<{ fixed: boolean }>> {
  const { purls, spinner } = fixConfig

  spinner?.start()

  const flatConfig = await getNpmConfig({
    npmVersion: pkgEnvDetails.agentVersion,
  })

  let actualTree: NodeClass | undefined
  let alertsMap
  try {
    if (purls.length) {
      alertsMap = await getAlertsMapFromPurls(purls, getFixAlertsMapOptions())
    } else {
      const arb = new Arborist({
        path: pkgEnvDetails.pkgPath,
        ...flatConfig,
        ...SAFE_WITH_SAVE_ARBORIST_REIFY_OPTIONS_OVERRIDES,
      })
      actualTree = await arb.reify()
      // Calling arb.reify() creates the arb.diff object, nulls-out arb.idealTree,
      // and populates arb.actualTree.
      alertsMap = await getAlertsMapFromArborist(arb, getFixAlertsMapOptions())
    }
  } catch (e) {
    spinner?.stop()
    debugFn('error', 'caught: PURL API')
    debugDir('inspect', { error: e })
    return {
      ok: false,
      message: 'API Error',
      cause: (e as Error)?.message || 'Unknown Socket batch PURL API error.',
    }
  }

  let revertData: PackageJson | undefined

  return await agentFix(
    pkgEnvDetails,
    actualTree,
    alertsMap,
    install,
    {
      async beforeInstall(editablePkgJson) {
        revertData = {
          ...(editablePkgJson.content.dependencies && {
            dependencies: { ...editablePkgJson.content.dependencies },
          }),
          ...(editablePkgJson.content.optionalDependencies && {
            optionalDependencies: {
              ...editablePkgJson.content.optionalDependencies,
            },
          }),
          ...(editablePkgJson.content.peerDependencies && {
            peerDependencies: { ...editablePkgJson.content.peerDependencies },
          }),
        } as PackageJson
      },
      async afterUpdate(editablePkgJson, packument, oldVersion, newVersion) {
        const isWorkspaceRoot =
          editablePkgJson.filename === pkgEnvDetails.editablePkgJson.filename
        if (isWorkspaceRoot) {
          const arb = new Arborist({
            path: pkgEnvDetails.pkgPath,
            ...flatConfig,
            ...SAFE_WITH_SAVE_ARBORIST_REIFY_OPTIONS_OVERRIDES,
          })
          const idealTree = await arb.buildIdealTree()
          const node = findPackageNode(idealTree, packument.name, oldVersion)
          if (node) {
            updateNode(node, newVersion, packument.versions[newVersion]!)
            await arb.reify()
          }
        }
      },
      async revertInstall(editablePkgJson) {
        if (revertData) {
          editablePkgJson.update(revertData)
        }
      },
    },
    fixConfig,
  )
}
