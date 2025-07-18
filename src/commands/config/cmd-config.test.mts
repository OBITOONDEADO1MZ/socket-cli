import { describe, expect } from 'vitest'

import constants from '../../../src/constants.mts'
import { cmdit, invokeNpm } from '../../../test/utils.mts'

describe('socket config', async () => {
  // Lazily access constants.binCliPath.
  const { binCliPath } = constants

  cmdit(
    ['config', '--help', '--config', '{}'],
    'should support --help',
    async cmd => {
      const { code, stderr, stdout } = await invokeNpm(binCliPath, cmd)
      expect(stdout).toMatchInlineSnapshot(
        `
        "Commands related to the local CLI configuration

          Usage
            $ socket config <command>

          Commands
            auto              Automatically discover and set the correct value config item
            get               Get the value of a local CLI config item
            list              Show all local CLI config items and their values
            set               Update the value of a local CLI config item
            unset             Clear the value of a local CLI config item

          Options
            (none)

          Examples
            $ socket config --help"
      `,
      )
      expect(`\n   ${stderr}`).toMatchInlineSnapshot(`
        "
           _____         _       _        /---------------
          |   __|___ ___| |_ ___| |_      | Socket.dev CLI ver <redacted>
          |__   | * |  _| '_| -_|  _|     | Node: <redacted>, API token: <redacted>, org: <redacted>
          |_____|___|___|_,_|___|_|.dev   | Command: \`socket config\`, cwd: <redacted>"
      `)

      expect(code, 'explicit help should exit with code 0').toBe(0)
      expect(stderr, 'banner includes base command').toContain(
        '`socket config`',
      )
    },
  )

  cmdit(
    ['config', '--dry-run', '--config', '{"apiToken":"anything"}'],
    'should require args with just dry-run',
    async cmd => {
      const { code, stderr, stdout } = await invokeNpm(binCliPath, cmd)
      expect(stdout).toMatchInlineSnapshot(
        `"[DryRun]: No-op, call a sub-command; ok"`,
      )
      expect(`\n   ${stderr}`).toMatchInlineSnapshot(`
        "
           _____         _       _        /---------------
          |   __|___ ___| |_ ___| |_      | Socket.dev CLI ver <redacted>
          |__   | * |  _| '_| -_|  _|     | Node: <redacted>, API token: <redacted>, org: <redacted>
          |_____|___|___|_,_|___|_|.dev   | Command: \`socket config\`, cwd: <redacted>"
      `)

      expect(code, 'dry-run should exit with code 0 if input ok').toBe(0)
    },
  )

  describe('config override', () => {
    cmdit(
      ['config', 'get', 'apiToken'],
      'should print nice error when env config override cannot be parsed',
      async cmd => {
        const { code, stderr, stdout } = await invokeNpm(binCliPath, cmd, {
          // This will be parsed first. If it fails it should fallback to flag or empty.
          SOCKET_CLI_CONFIG: '{apiToken:invalidjson}',
        })
        expect(stdout).toMatchInlineSnapshot(`""`)
        expect(`\n   ${stderr}`).toMatchInlineSnapshot(`
          "
             _____         _       _        /---------------
            |   __|___ ___| |_ ___| |_      | Socket.dev CLI ver <redacted>
            |__   | * |  _| '_| -_|  _|     | Node: <redacted>, API token: <redacted>, org: <redacted>
            |_____|___|___|_,_|___|_|.dev   | Command: \`socket\`, cwd: <redacted>

          \\xd7 Could not parse Config as JSON"
        `)

        expect(stderr.includes('Could not parse Config as JSON')).toBe(true)
        expect(code, 'bad config input should exit with code 2 ').toBe(2)
      },
    )

    cmdit(
      ['config', 'get', 'apiToken', '--config', '{apiToken:invalidjson}'],
      'should print nice error when flag config override cannot be parsed',
      async cmd => {
        const { code, stderr, stdout } = await invokeNpm(binCliPath, cmd)
        expect(stdout).toMatchInlineSnapshot(`""`)
        expect(`\n   ${stderr}`).toMatchInlineSnapshot(`
          "
             _____         _       _        /---------------
            |   __|___ ___| |_ ___| |_      | Socket.dev CLI ver <redacted>
            |__   | * |  _| '_| -_|  _|     | Node: <redacted>, API token: <redacted>, org: <redacted>
            |_____|___|___|_,_|___|_|.dev   | Command: \`socket\`, cwd: <redacted>

          \\xd7 Could not parse Config as JSON"
        `)

        expect(stderr.includes('Could not parse Config as JSON')).toBe(true)
        expect(code, 'bad config input should exit with code 2 ').toBe(2)
      },
    )
  })
})
