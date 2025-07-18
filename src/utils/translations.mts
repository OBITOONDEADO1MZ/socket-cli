import { createRequire } from 'node:module'
import path from 'node:path'

import constants from '../constants.mts'

const require = createRequire(import.meta.url)

let _translations: typeof import('../../translations.json') | undefined

export function getTranslations() {
  if (_translations === undefined) {
    _translations = require(
      // Lazily access constants.rootPath.
      path.join(constants.rootPath, 'translations.json'),
    )
  }
  return _translations!
}
