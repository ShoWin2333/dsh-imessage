import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const projectRoot = resolve(import.meta.dirname, '..')
const temporary = await mkdtemp(join(tmpdir(), 'dsh-photon-imessage-profile-'))
const packDirectory = join(temporary, 'pack')
const dshHome = join(temporary, 'home')
const dshBinary = process.env.DSH_BIN ?? 'dsh'

try {
  await mkdir(packDirectory)
  const packed = await execute('npm', [
    'pack', '--json', '--ignore-scripts', '--pack-destination', packDirectory,
  ], { cwd: projectRoot })
  const report = JSON.parse(packed.stdout)
  const filename = report[0]?.filename
  if (typeof filename !== 'string') throw new Error('npm pack did not return a tarball filename')
  const tarball = join(packDirectory, filename)
  const env = { ...process.env, DSH_HOME: dshHome }

  await execute(dshBinary, ['plugin', '--profile', 'web', 'add', tarball], { env })
  const manifestPath = join(dshHome, 'profiles', 'web', 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (typeof manifest.dependencies?.['dsh-photon-imessage'] !== 'string') {
    throw new Error('the disposable web profile did not install dsh-photon-imessage')
  }
  if (!manifest.dsh?.profile?.bundles?.includes('dsh-photon-imessage')) {
    throw new Error('the disposable web profile did not activate the plugin bundle')
  }

  // DSH resolves and composes the web profile to produce its surface-specific help,
  // without binding a server port or contacting Photon.
  await execute(dshBinary, ['--profile', 'web', '--help'], { env })
  process.stdout.write(`Packed profile smoke test passed with ${dshBinary}.\n`)
} finally {
  await rm(temporary, { recursive: true, force: true })
}
