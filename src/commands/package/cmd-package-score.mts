import { logger } from '@socketsecurity/registry/lib/logger'

import { handlePurlDeepScore } from './handle-purl-deep-score.mts'
import { parsePackageSpecifiers } from './parse-package-specifiers.mts'
import constants from '../../constants.mts'
import { commonFlags, outputFlags } from '../../flags.mts'
import { checkCommandInput } from '../../utils/check-input.mts'
import { getOutputKind } from '../../utils/get-output-kind.mts'
import { meowOrExit } from '../../utils/meow-with-subcommands.mts'
import { getFlagListOutput } from '../../utils/output-formatting.mts'
import { hasDefaultToken } from '../../utils/sdk.mts'

import type { CliCommandConfig } from '../../utils/meow-with-subcommands.mts'

const { DRY_RUN_BAILING_NOW } = constants

const config: CliCommandConfig = {
  commandName: 'score',
  description:
    'Look up score for one package which reflects all of its transitive dependencies as well',
  hidden: false,
  flags: {
    ...commonFlags,
    ...outputFlags,
  },
  help: (command, config) => `
    Usage
      $ ${command} [options] <<ECOSYSTEM> <NAME> | <PURL>>

    API Token Requirements
      - Quota: 100 units
      - Permissions: packages:list

    Options
      ${getFlagListOutput(config.flags)}

    Show deep scoring details for one package. The score will reflect the package
    itself, any of its dependencies, and any of its transitive dependencies.

    When you want to know whether to trust a package, this is the command to run.

    See also the \`socket package shallow\` command, which returns the shallow
    score for any number of packages. That will not reflect the dependency scores.

    Only a few ecosystems are supported like npm, pypi, nuget, gem, golang, and maven.

    A "purl" is a standard package name formatting: \`pkg:eco/name@version\`
    This command will automatically prepend "pkg:" when not present.

    The version is optional but when given should be a direct match. The \`pkg:\`
    prefix is optional.

    Note: if a package cannot be found it may be too old or perhaps was removed
          before we had the opportunity to process it.

    Examples
      $ ${command} npm babel-cli
      $ ${command} npm eslint@1.0.0 --json
      $ ${command} pkg:golang/github.com/steelpoor/tlsproxy@v0.0.0-20250304082521-29051ed19c60
      $ ${command} nuget/needpluscommonlibrary@1.0.0 --markdown
  `,
}

export const cmdPackageScore = {
  description: config.description,
  hidden: config.hidden,
  run,
}

async function run(
  argv: string[] | readonly string[],
  importMeta: ImportMeta,
  { parentName }: { parentName: string },
): Promise<void> {
  const cli = meowOrExit({
    argv,
    config,
    importMeta,
    parentName,
  })

  const { json, markdown } = cli.flags

  const [ecosystem = '', purl] = cli.input

  const hasApiToken = hasDefaultToken()

  const outputKind = getOutputKind(json, markdown)

  const { purls, valid } = parsePackageSpecifiers(ecosystem, purl ? [purl] : [])

  const wasValidInput = checkCommandInput(
    outputKind,
    {
      test: valid,
      message: 'First parameter must be an ecosystem or the whole purl',
      pass: 'ok',
      fail: 'bad',
    },
    {
      test: purls.length === 1,
      message: 'Expecting at least one package',
      pass: 'ok',
      fail: purls.length === 0 ? 'missing' : 'too many',
    },
    {
      nook: true,
      test: !json || !markdown,
      message: 'The json and markdown flags cannot be both set, pick one',
      pass: 'ok',
      fail: 'omit one',
    },
    {
      nook: true,
      test: hasApiToken,
      message:
        'You need to be logged in to use this command. See `socket login`.',
      pass: 'ok',
      fail: 'missing API token',
    },
  )
  if (!wasValidInput) {
    return
  }

  if (cli.flags['dryRun']) {
    logger.log(DRY_RUN_BAILING_NOW)
    return
  }

  await handlePurlDeepScore(purls[0] || '', outputKind)
}
