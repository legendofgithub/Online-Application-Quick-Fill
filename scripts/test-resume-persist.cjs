// 简历持久化回归测试:加载**真实主进程**(electron/main.cjs),验证保存时不会丢字段。
//
// 用临时 userData,既不碰用户的正式数据(%APPDATA%\校招快填),也不碰 E2E 夹具(.dev-data)。
// 背景:cf:save-resume 曾漏掉 custom,用户在编辑器保存一次就把所有自定义字段静默删除;
// 现在又多了 educations / experiences 两个可重复数组,同样必须验证「写进去 = 读出来」。
//
// 用法: node_modules/.bin/electron scripts/test-resume-persist.cjs
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const assert = require('node:assert')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'campusfill-persist-'))

// 关键顺序:先加载真实主进程,它会在模块加载时把 userData 设成 .dev-data(E2E 夹具);
// 加载完成后立刻改回本测试的临时目录 —— 主进程的 loadResumeStore() 是在 app ready
// 时才执行的,所以最终读写都落在临时目录,**既不动用户正式数据,也不动 E2E 夹具**。
// (注:process.defaultApp 是只读的,无法靠赋值阻止那次 setPath,故采用覆盖顺序。)
require('../electron/main.cjs')
app.setPath('userData', tmp)

const DB = path.join(tmp, 'resumes.json')
const wait = ms => new Promise(r => setTimeout(r, ms))
let passed = 0
function ok(name, cond, detail) {
  assert.ok(cond, `${name}${detail ? ' — ' + detail : ''}`)
  passed++
  console.log(`  PASS ${name}`)
}

const EDUCATION_A = {
  id: 'edu-a',
  学校: '示例大学',
  院系: '商学院',
  专业: '信息管理与信息系统（示例方向）',
  学历: '硕士',
  学制: '2年',
  入学时间: '2025-09-01',
  毕业时间: '2027-06-30',
  统招与否: '非统招',
  GPA: '3.22',
  专业排名: '前30%',
  导师: '示例导师',
  实验室: '示例实验室',
  研究方向: '量化投资',
}
const EDUCATION_B = {
  id: 'edu-b',
  学校: '示例师范大学',
  院系: '',
  专业: '信息管理与信息系统（金融信息管理）',
  学历: '本科',
  学制: '4年',
  入学时间: '2021-09-01',
  毕业时间: '2025-06-30',
  统招与否: '统招',
  GPA: '',
  专业排名: '',
}
const EXPERIENCE_A = {
  id: 'exp-a',
  公司: '示例资本',
  职位: '投资助理(VC)',
  性质: '实习',
  开始时间: '2026-07-01',
  结束时间: '2026-09-30',
  描述: '一级市场投前行业分析;demoday 路演组织。',
}
const EXPERIENCE_B = {
  id: 'exp-b',
  公司: '北京汇丰盛和国际贸易',
  职位: '行业研究员',
  性质: '正职',
  开始时间: '2023-06-01',
  结束时间: '2024-01-31',
  描述: '氧化铝交易数据分析与行业研究。',
}
const PROJECT_A = {
  id: 'prj-a',
  项目名称: '示例项目A',
  项目角色: '独立设计与开发',
  开始时间: '2026-01-01',
  结束时间: '2026-05-31',
  项目描述: 'AI 求职工具。',
}
const AWARD_A = { id: 'awd-a', 奖项名称: '校级一等奖学金', 获奖时间: '2024-10-01', 级别: '校级' }

async function findMainWindow() {
  for (let i = 0; i < 40; i++) {
    const win = BrowserWindow.getAllWindows().find(w => !w.webContents.isDestroyed() && w.getTitle() !== '')
    if (win !== undefined && win.getTitle().includes('校招快填')) return win
    await wait(250)
  }
  throw new Error('主窗口未就绪')
}

app.whenReady().then(async () => {
  try {
    console.log('简历持久化(真实主进程 + 临时 userData):')
    console.log('  userData =', tmp)

    // ── 1. 首次启动应写出种子(含 1 条空白教育、0 条经历) ──
    await wait(2000)
    ok('首次启动生成 resumes.json', fs.existsSync(DB), `实际 userData=${app.getPath('userData')}`)
    const seeded = JSON.parse(fs.readFileSync(DB, 'utf8'))
    ok('种子简历含 educations 且长度为 1', Array.isArray(seeded.resumes[0].educations) && seeded.resumes[0].educations.length === 1)
    ok('种子简历含 experiences 且为空数组', Array.isArray(seeded.resumes[0].experiences) && seeded.resumes[0].experiences.length === 0)
    ok('种子不含虚构人物「张三」', !fs.readFileSync(DB, 'utf8').includes('张三'))

    // ── 2. 经 preload → IPC 保存一份含两段教育 + 一段经历的简历 ──
    const win = await findMainWindow()
    const payload = {
      id: seeded.currentId,
      name: '张明-金融科技',
      updatedAt: '',
      profile: {
        ...seeded.resumes[0].profile,
        ...EDUCATION_A,
        姓名: '张明',
        手机: '13800000000',
        户口类别: '非农业户口',
        户口所在地: '示例省示例市示例区',
        父亲单位: '示例市第一中学',
        父亲职务: '教研员',
        母亲单位: '示例市人民医院',
        母亲职务: '主治医师',
        微信号: 'zhangming_wx',
        QQ号: '123456789',
        国家地区: '中国大陆',
        内推码: 'REF-8888',
        远程面试: '是',
      },
      custom: { 个人网站: 'http://example.com/' },
      educations: [EDUCATION_A, EDUCATION_B],
      experiences: [EXPERIENCE_A, EXPERIENCE_B],
      projects: [PROJECT_A],
      awards: [AWARD_A],
    }
    delete payload.profile.id
    await win.webContents.executeJavaScript(
      `window.campusFill.saveResume(${JSON.stringify(payload)}); true`,
    )
    await wait(1200)

    const saved = JSON.parse(fs.readFileSync(DB, 'utf8'))
    const r = saved.resumes.find(x => x.name === '张明-金融科技')
    ok('保存后能找到该简历', r !== undefined)
    ok('educations 两条完整写入', r.educations.length === 2 && r.educations[0].学校 === '示例大学' && r.educations[1].学校 === '示例师范大学')
    ok('第二条教育的「学历=本科」未被丢弃', r.educations[1].学历 === '本科')
    ok('experiences 两条完整写入', r.experiences.length === 2 && r.experiences[0].公司 === '示例资本')
    ok('经历的性质字段(实习)未被丢弃', r.experiences[0].性质 === '实习')
    ok('经历的性质字段(正职)未被丢弃', r.experiences[1].性质 === '正职')
    ok('经历的描述字段未被丢弃', r.experiences[0].描述 === EXPERIENCE_A.描述)
    ok('custom 未再被静默删除', r.custom['个人网站'] === 'http://example.com/')
    ok('profile 同时保留了教育扁平字段(供填写引擎使用)', r.profile.学校 === '示例大学' && r.profile.学历 === '硕士')
    ok('新增的户口所在地字段可存取', r.profile.户口所在地 === '示例省示例市示例区')
    ok('户口类别与户口所在地互不覆盖', r.profile.户口类别 === '非农业户口' && r.profile.户口所在地 === '示例省示例市示例区')
    ok(
      '父母单位/职务四个字段都能存取',
      r.profile.父亲单位 === '示例市第一中学' &&
        r.profile.父亲职务 === '教研员' &&
        r.profile.母亲单位 === '示例市人民医院' &&
        r.profile.母亲职务 === '主治医师',
      JSON.stringify({ f1: r.profile.父亲单位, f2: r.profile.父亲职务, m1: r.profile.母亲单位, m2: r.profile.母亲职务 }),
    )
    ok(
      '微信号/QQ号/国家地区/内推码/远程面试五项都能存取',
      r.profile.微信号 === 'zhangming_wx' &&
        r.profile.QQ号 === '123456789' &&
        r.profile.国家地区 === '中国大陆' &&
        r.profile.内推码 === 'REF-8888' &&
        r.profile.远程面试 === '是',
      JSON.stringify({ wx: r.profile.微信号, qq: r.profile.QQ号, c: r.profile.国家地区, ref: r.profile.内推码, remote: r.profile.远程面试 }),
    )
    ok(
      '教育记录的导师/实验室/研究方向能存取',
      r.educations[0].导师 === '示例导师' && r.educations[0].实验室 === '示例实验室' && r.educations[0].研究方向 === '量化投资',
      JSON.stringify({ t: r.educations[0].导师, l: r.educations[0].实验室, d: r.educations[0].研究方向 }),
    )
    ok('项目经历完整写入', r.projects.length === 1 && r.projects[0].项目名称 === '示例项目A' && r.projects[0].项目角色 === '独立设计与开发')
    ok('获奖经历完整写入', r.awards.length === 1 && r.awards[0].奖项名称 === '校级一等奖学金' && r.awards[0].级别 === '校级')

    console.log(`\n全部通过(${passed} 项断言)`)
  } catch (err) {
    console.log('FAIL:', err && err.message)
    process.exitCode = 1
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
    app.exit(process.exitCode === undefined ? 0 : process.exitCode)
  }
})
