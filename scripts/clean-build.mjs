import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
rmSync(resolve(root, 'html', 'build'), { recursive: true, force: true })
