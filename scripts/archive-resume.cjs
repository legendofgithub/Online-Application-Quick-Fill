// 简历存档:把应用当前的简历库复制成一份**可读、可恢复、可验证**的存档,放到桌面。
//
//   node scripts/archive-resume.cjs [存档输出目录]
//
// 为什么这样设计:
//   · 存档顶层就是 currentId + resumes —— 这正是应用 resumes.json 的格式,
//     所以恢复只需「关掉应用 → 用存档覆盖 %APPDATA%\校招快填\resumes.json」,不需要任何导入功能。
//   · 额外写入 _archive 清单(时间/版本/来源/规模),应用会忽略这个键,人和 agent 都能读懂。
//   · 写完立刻**回读并逐字段深比较** —— 存档的价值全在"能原样恢复",
//     不验证的备份等于没有备份。
//   · 必须无 BOM:JSON.parse 遇到 BOM 会直接抛错(Node 与 Electron 同款解析器)。
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const APP_DIR = '校招快填'
const SOURCE = path.join(os.homedir(), 'AppData', 'Roaming', APP_DIR, 'resumes.json')
const desktop = path.join(os.homedir(), 'Desktop')
const outDir = process.argv[2] !== undefined && process.argv[2] !== '' ? process.argv[2] : desktop

/** 递归深比较(与键顺序无关);一致返回 null,否则返回第一处差异的描述 */
function diffOf(a, b, at) {
  if (a === b) return null
  if (typeof a !== typeof b) return `${at}: 类型 ${typeof a} vs ${typeof b}`
  if (a === null || b === null) return `${at}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return `${at}: 数组/非数组`
    if (a.length !== b.length) return `${at}: 长度 ${a.length} vs ${b.length}`
    for (let i = 0; i < a.length; i++) {
      const e = diffOf(a[i], b[i], `${at}[${i}]`)
      if (e) return e
    }
    return null
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a).sort()
    const kb = Object.keys(b).sort()
    if (ka.join(',') !== kb.join(',')) {
      const onlyA = ka.filter(k => !kb.includes(k))
      const onlyB = kb.filter(k => !ka.includes(k))
      return `${at}: 键不同 仅源有[${onlyA}] 仅存档有[${onlyB}]`
    }
    for (const k of ka) {
      const e = diffOf(a[k], b[k], `${at}.${k}`)
      if (e) return e
    }
    return null
  }
  return `${at}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`
}

function stamp() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`✗ 找不到简历库:${SOURCE}`)
    console.error('  (先在应用里保存一次简历,或确认应用名/路径没变)')
    process.exitCode = 1
    return
  }
  const store = JSON.parse(fs.readFileSync(SOURCE, 'utf8'))
  const resumes = Array.isArray(store.resumes) ? store.resumes : []
  if (resumes.length === 0) {
    console.error('✗ 简历库是空的,没有可存档的内容')
    process.exitCode = 1
    return
  }
  let appVersion = '(未知)'
  try {
    appVersion = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version
  } catch {
    /* 版本取不到不影响存档 */
  }
  const summaries = resumes.map(r => ({
    name: r.name,
    id: r.id,
    updatedAt: r.updatedAt,
    扁平字段: Object.keys(r.profile || {}).length,
    已填写: Object.values(r.profile || {}).filter(v => typeof v === 'string' && v !== '').length,
    自定义字段: Object.keys(r.custom || {}).length,
    教育: (r.educations || []).length,
    经历: (r.experiences || []).length,
    项目: (r.projects || []).length,
    获奖: (r.awards || []).length,
  }))

  const archive = {
    _archive: {
      kind: 'campus-autofill-resume-archive',
      savedAt: new Date().toLocaleString('zh-CN'),
      app: '校招快填',
      appVersion,
      sourcePath: SOURCE,
      note:
        '顶层 currentId + resumes 就是应用的简历库格式:恢复时关闭应用,用本文件的 currentId/resumes 覆盖 ' +
        'resumes.json 即可;_archive 是清单,应用会忽略。',
      summaries,
    },
    currentId: store.currentId,
    resumes,
  }

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const target = path.join(outDir, `简历存档-${stamp()}.json`)
  // 无 BOM 写入:带 BOM 会让 JSON.parse 直接抛错
  fs.writeFileSync(target, JSON.stringify(archive, null, 2), { encoding: 'utf8' })

  // 立刻回读验证:存档的唯一价值是「能原样恢复」,不验证的备份等于没有备份
  const back = JSON.parse(fs.readFileSync(target, 'utf8'))
  const diff = diffOf(resumes, back.resumes, 'resumes')
  const idOk = store.currentId === back.currentId
  if (diff !== null || !idOk) {
    console.error(`✗ 存档校验失败:${diff || 'currentId 不一致'}`)
    console.error(`  存档文件保留在 ${target},请把它发给我排查`)
    process.exitCode = 1
    return
  }
  console.log('✓ 存档完成并已校验(与源数据逐字段一致)')
  console.log(`  文件:${target}`)
  console.log(`  大小:${(fs.statSync(target).size / 1024).toFixed(1)} KB`)
  for (const s of summaries) {
    console.log(
      `  内容:${s.name} — 扁平字段 ${s.已填写}/${s.扁平字段} 已填 · 教育 ${s.教育} · 经历 ${s.经历} · 项目 ${s.项目} · 获奖 ${s.获奖}`,
    )
  }
  console.log('')
  console.log('  出问题时:把这个文件发给我即可。')
  console.log('  要恢复:关闭应用 → 用该文件的 currentId/resumes 覆盖')
  console.log(`         ${SOURCE}`)
}

main()
