import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const script = fileURLToPath(new URL('../check-doc-links.mjs', import.meta.url))
const rootLinks = '[公开](docs/README.md)\n[本地](.local/README.md)\n'

async function repository(context, files = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'nekro-nxt-doc-links-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  execFileSync('git', ['init', '--quiet', root])
  for (const [file, content] of Object.entries({
    '.gitignore': '.local/\ndocs-private/\n*.local.md\nignored/\n',
    'AGENTS.md': rootLinks,
    'docs/README.md': '# 公开\n',
    ...files,
  })) {
    const target = path.join(root, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }
  return root
}

function check(root, expectedStatus, ...diagnostics) {
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', timeout: 10_000 })
  assert.ifError(result.error)
  const output = result.stdout + result.stderr
  assert.equal(result.status, expectedStatus, output)
  for (const diagnostic of diagnostics) assert.match(output, diagnostic)
  return output
}

test('clean public checkout allows the absent optional local index', async (context) => {
  check(await repository(context), 0, /2 public files, 0 local files/u)
})

for (const tracked of [false, true]) {
  test(`public ${tracked ? 'tracked (even ignored)' : 'untracked and unignored'} orphan fails`, async (context) => {
    const root = await repository(context, { 'docs/orphan.md': '# 孤岛\n' })
    if (tracked) {
      execFileSync('git', ['add', 'docs/orphan.md'], { cwd: root })
      await writeFile(path.join(root, '.gitignore'), 'docs/orphan.md\n')
    }
    check(root, 1, /以下公开文档无法/u, /docs\/orphan\.md/u)
  })
}

for (const directory of ['.local/docs', '.local/brand-design']) {
  test(`${directory} detects hidden nested orphans and their broken links`, async (context) => {
    const root = await repository(context, {
      '.local/README.md': '# 本地\n',
      [`${directory}/.notes/orphan.md`]: '[断链](missing.md)\n',
    })
    check(root, 1, /以下本地文档无法/u, /\.notes\/orphan\.md/u, /找不到链接目标 missing\.md/u)
  })
}

test('local links discover transitive documents outside maintained directories and tolerate cycles', async (context) => {
  const root = await repository(context, {
    '.local/README.md': '[知识](docs/guide.md#知识)\n',
    '.local/docs/guide.md': '# 知识\n[证据](../evidence/result.md)\n',
    '.local/evidence/result.md': '[补充](../../docs-private/note.md)\n[回到入口](../README.md)\n',
    'docs-private/note.md': '[公开](../docs/README.md)\n',
  })
  check(root, 0, /2 public files, 4 local files/u)
  await writeFile(path.join(root, 'docs-private/note.md'), '[断链](missing.md)\n')
  check(root, 1, /docs-private\/note\.md: 找不到链接目标 missing\.md/u)
})

test('unlinked runtime Markdown and directory contents are not enumerated', async (context) => {
  const root = await repository(context, {
    '.local/README.md': '[产物目录](runtime/)\n[图片](runtime/image.svg)\n',
    '.local/runtime/deep/result.md': '[断链](missing.md)\n',
    '.local/runtime/image.svg': '<svg/>',
    '.local/playwright-report/result.md': '[断链](missing.md)\n',
    '.local/coverage/result.md': '[断链](missing.md)\n',
    '.local/scratch.md': '[断链](missing.md)\n',
    'docs-private/orphan.md': '[断链](missing.md)\n',
    'scratch.local.md': '[断链](missing.md)\n',
    'ignored/result.md': '[断链](missing.md)\n',
  })
  check(root, 0, /2 public files, 1 local files/u)
  await writeFile(path.join(root, '.local/README.md'), '[明确维护](runtime/deep/result.md)\n')
  check(root, 1, /runtime\/deep\/result\.md: 找不到链接目标 missing\.md/u)
})

test('managed directory enumeration does not follow symlinks into runtime trees', async (context) => {
  const root = await repository(context, {
    '.local/README.md': '[知识](docs/guide.md)\n',
    '.local/docs/guide.md': '# 知识\n',
    '.local/runtime/orphan.md': '[断链](missing.md)\n',
  })
  await symlink('../runtime', path.join(root, '.local/docs/runtime'), 'dir')
  check(root, 0, /2 public files, 2 local files/u)
})

test('runtime-only local directory does not require an index, but maintained knowledge does', async (context) => {
  const root = await repository(context, { '.local/runtime/result.md': '[断链](missing.md)\n' })
  check(root, 0)
  await mkdir(path.join(root, '.local/docs'))
  await writeFile(path.join(root, '.local/docs/note.md'), '# 知识\n')
  check(root, 1, /以下本地文档无法/u, /\.local\/docs\/note\.md/u)
})

test('local index must have an explicit route from AGENTS', async (context) => {
  const root = await repository(context, {
    'AGENTS.md': '[公开](docs/README.md)\n',
    '.local/README.md': '# 本地\n',
  })
  check(root, 1, /以下本地文档无法/u, /\.local\/README\.md/u)
})

for (const target of [
  '../.local/README.md',
  '../.local/missing.md',
  '../.local/',
  '../docs-private/note.md',
  '../scratch.local.md',
  '../ignored/note.md',
]) {
  test(`public documents cannot link private target ${target}`, async (context) => {
    const root = await repository(context, {
      'docs/README.md': `[泄漏](${target})\n`,
      '.local/README.md': '# 本地\n',
      'docs-private/note.md': '# 私有\n',
      'scratch.local.md': '# 私有\n',
      'ignored/note.md': '# 私有\n',
    })
    check(root, 1, /公开文档只能由根 AGENTS\.md 链接本地私有索引/u)
  })
}

test('AGENTS exception does not permit private deep links or heading fragments', async (context) => {
  const root = await repository(context, {
    'AGENTS.md': rootLinks + '[标题](.local/README.md#本地)\n[深层](.local/docs/note.md)\n',
    '.local/README.md': '# 本地\n[知识](docs/note.md)\n',
    '.local/docs/note.md': '# 知识\n',
  })
  check(root, 1, /不能链接 \.local\/README\.md/u, /不能链接 \.local\/docs\/note\.md/u)
})

test('private routes cannot make a public orphan reachable', async (context) => {
  const root = await repository(context, {
    '.local/README.md': '[公开孤岛](../docs/orphan.md)\n',
    'docs/orphan.md': '# 孤岛\n',
  })
  check(root, 1, /以下公开文档无法/u, /docs\/orphan\.md/u)
})

test('broken targets and headings fail for both public and discovered local documents', async (context) => {
  const root = await repository(context, {
    'docs/README.md': '[断链](missing.md)\n[标题](#missing)\n',
    '.local/README.md': '[知识](notes/guide.md)\n',
    '.local/notes/guide.md': '# 知识\n[标题](#missing)\n[目录](../notes/#missing)\n',
  })
  check(
    root,
    1,
    /docs\/README\.md: 找不到链接目标 missing\.md/u,
    /docs\/README\.md: 找不到标题 #missing/u,
    /notes\/guide\.md: 找不到标题 #missing/u,
    /目录链接不能带 fragment/u,
  )
})

test('empty repository fails without AGENTS', async (context) => {
  const root = await repository(context)
  await rm(path.join(root, 'AGENTS.md'))
  await rm(path.join(root, 'docs'), { recursive: true })
  check(root, 1, /找不到公开文档根 AGENTS\.md/u)
})

test('a maintained island cycle cannot supply its own route from the local index', async (context) => {
  const root = await repository(context, {
    '.local/README.md': '# 本地\n',
    '.local/brand-design/a.md': '[另一页](b.md)\n',
    '.local/brand-design/b.md': '[回链](a.md)\n',
  })
  check(root, 1, /以下本地文档无法/u, /brand-design\/a\.md/u, /brand-design\/b\.md/u)
  await writeFile(path.join(root, '.local/README.md'), '[品牌](brand-design/a.md)\n')
  check(root, 0, /2 public files, 3 local files/u)
})

test('a linked local document outside the repository is not recursively enrolled', async (context) => {
  const root = await repository(context, { '.local/README.md': '# 本地\n' })
  const externalRoot = await mkdtemp(path.join(tmpdir(), 'nekro-nxt-external-docs-'))
  context.after(() => rm(externalRoot, { recursive: true, force: true }))
  const externalFile = path.join(externalRoot, 'reference.md')
  await writeFile(externalFile, '# 参考\n[外部断链](missing.md)\n')
  const relativeLink = path.relative(path.join(root, '.local'), externalFile).split(path.sep).join('/')
  await writeFile(path.join(root, '.local/README.md'), `[外部参考](${relativeLink}#参考)\n`)
  check(root, 0, /2 public files, 1 local files/u)
})

for (const route of ['direct', 'directory symlink', 'file symlink']) {
  test(`external reference via ${route} validates only its target and fragment`, async (context) => {
    const root = await repository(context, { '.local/README.md': '# 本地\n' })
    // A sibling with the same prefix is still outside the repository.
    const externalRoot = await mkdtemp(`${root}-external-`)
    context.after(() => rm(externalRoot, { recursive: true, force: true }))
    const externalFile = path.join(externalRoot, 'doc.md')
    await writeFile(externalFile, '# 参考\n[内部断链](internal-missing.md)\n')
    let link = path.relative(path.join(root, '.local'), externalFile).split(path.sep).join('/')
    if (route === 'directory symlink') {
      await symlink(externalRoot, path.join(root, '.local/reference'), 'dir')
      link = 'reference/doc.md'
    } else if (route === 'file symlink') {
      await symlink(externalFile, path.join(root, '.local/reference.md'), 'file')
      link = 'reference.md'
    }
    const index = path.join(root, '.local/README.md')
    await writeFile(index, `[参考](${link}#参考)\n`)
    check(root, 0, /2 public files, 1 local files/u)

    await writeFile(index, `[参考](${link}#不存在的标题)\n`)
    const fragmentOutput = check(root, 1, /\.local\/README\.md: 找不到标题 #不存在的标题/u)
    assert.doesNotMatch(fragmentOutput, /internal-missing\.md/u)

    await writeFile(index, `[参考](${link}#参考)\n`)
    await rm(externalFile)
    const missingOutput = check(root, 1, /\.local\/README\.md: 找不到链接目标/u)
    assert.doesNotMatch(missingOutput, /internal-missing\.md/u)
  })
}

test('an explicitly linked symlink to an internal directory still enrolls its Markdown', async (context) => {
  const root = await repository(context, {
    '.local/README.md': '[知识](reference/doc.md#知识)\n',
    '.local/notes/doc.md': '# 知识\n[下一页](next.md)\n',
    '.local/notes/next.md': '# 下一页\n',
  })
  await symlink('notes', path.join(root, '.local/reference'), 'dir')
  check(root, 0, /2 public files, 3 local files/u)
  await writeFile(path.join(root, '.local/notes/next.md'), '[内部断链](internal-missing.md)\n')
  check(root, 1, /\.local\/reference\/next\.md: 找不到链接目标 internal-missing\.md/u)
})
