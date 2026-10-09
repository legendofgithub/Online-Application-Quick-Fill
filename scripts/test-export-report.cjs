// 「导出填写报告」回归测试(真实主进程 + 悬浮球 IPC + 内嵌浏览视图):
//   node_modules/.bin/electron scripts/test-export-report.cjs
//
// 安全:用临时 userData(预置一份测试简历),既不动用户正式数据,也不动 .dev-data 夹具。
// 覆盖:填写 → 导出 Markdown → 校验内容(时间/简历名/页面 URL/结果数/两个缺项小节)。
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-export-'))
const FIXTURE_URL =
  'file:///' + path.join(__dirname, '..', 'test-forms', 'sample-records-form.html').replace(/\\/g, '/')

// 预置简历:必须落在临时 userData 里,而且要在 require 主进程之前写好(它读盘在 app ready)
const RESUME = {
  id: 'resume-export-test',
  name: '导出测试简历',
  updatedAt: '',
  profile: {
    姓名: '张明',
    手机: '13800000000',
    学校: '示例大学',
    专业: '信息管理与信息系统（示例方向）',
    学历: '硕士',
    入学时间: '2025-09-01',
    毕业时间: '2027-06-30',
  },
  custom: {},
  educations: [
    {
      id: 'e0', 学校: '示例大学', 院系: '商学院', 专业: '信息管理与信息系统（示例方向）', 学历: '硕士',
      学制: '2年', 入学时间: '2025-09-01', 毕业时间: '2027-06-30', 统招与否: '非统招', GPA: '', 专业排名: '',
      导师: '示例导师', 实验室: '示例实验室', 研究方向: '量化投资',
    },
  ],
  experiences: [
    { id: 'x0', 公司: '示例资本', 职位: '投资助理(VC)', 性质: '实习', 开始时间: '2026-07-01', 结束时间: '2026-08-21', 描述: '一级市场投前行业分析' },
  ],
  projects: [{ id: 'p0', 项目名称: '示例项目A', 项目角色: '独立设计与开发', 开始时间: '2026-01-01', 结束时间: '2026-05-31', 项目描述: 'AI 求职工具' }],
  awards: [{ id: 'a0', 奖项名称: '校级一等奖学金', 获奖时间: '2024-10-01', 级别: '校级' }],
}
fs.writeFileSync(path.join(tmp, 'resumes.json'), JSON.stringify({ currentId: RESUME.id, resumes: [RESUME] }))

require('../electron/main.cjs')
app.setPath('userData', tmp)

const wait = ms => new Promise(r => setTimeout(r, ms))
let passed = 0
function ok(name, cond, detail) {
  assert.ok(cond, `${name}${detail === undefined ? '' : ' — ' + detail}`)
  passed++
  console.log(`  PASS ${name}`)
}

app.whenReady().then(async () => {
  try {
    await wait(3000)
    const wins = BrowserWindow.getAllWindows()
    const main = wins.find(w => w.webContents.getURL().includes('index.html'))
    const ball = wins.find(w => w.webContents.getURL().includes('ball.html'))
    if (!main || !ball) throw new Error('windows not ready')

    // 走真实链路:切标签 → 地址栏导航 → 开始检测 → 开始填写
    await main.webContents.executeJavaScript(`window.campusFill.shellTab('browse'); true`)
    await wait(600)
    await main.webContents.executeJavaScript(`window.campusFill.nav({ type: 'url', url: ${JSON.stringify(FIXTURE_URL)} }); true`)
    await wait(3000)
    await ball.webContents.executeJavaScript(`window.campusFill.detectNow(); true`)
    await wait(4500)
    await ball.webContents.executeJavaScript(`window.campusFill.startFill(); true`)
    await wait(30000)

    const outPath = path.join(tmp, 'report.md')
    const result = await main.webContents.executeJavaScript(
      `window.campusFill.exportReport({ toPath: ${JSON.stringify(outPath)} })`,
    )
    ok('导出返回成功并给出落盘路径', result && result.ok === true && result.path === outPath, JSON.stringify(result))
    ok('报告文件已落盘', fs.existsSync(outPath))

    const md = fs.readFileSync(outPath, 'utf8')
    ok('标题正确', md.includes('# 校招快填 · 填写报告'))
    ok('含简历名与页面 URL', md.includes('导出测试简历') && md.includes('sample-records-form.html'), md.slice(0, 300))
    ok('含结果计数(填写数/总数)', /- 结果:已自动填写 \d+\/\d+ 项/.test(md))
    ok(
      '含四个小节:页面缺字段 / 匹配到但没填上 / 手动关联 / 未匹配控件结构',
      md.includes('## 一、页面有、简历里没有的字段') &&
        md.includes('## 二、匹配到简历字段但没能填上') &&
        md.includes('## 三、已记住的手动关联') &&
        md.includes('## 四、未匹配控件的结构'),
      md,
    )
    ok('未匹配控件带出了结构信息(标签/标签名/是否只读/区块判定)', /- .+ — <[A-Z]+ type=\w+.*区块=/.test(md), md)
    ok('把页面上未匹配到的字段写进了报告(夹具里的「个人描述」)', md.includes('个人描述'), md)

    // 再验一次边界:没有填写记录时导出应当明确拒绝
    await ball.webContents.executeJavaScript(`window.campusFill.resetFill(); true`)
    await wait(1500)
    const afterReset = await main.webContents.executeJavaScript(`window.campusFill.exportReport({ toPath: ${JSON.stringify(path.join(tmp, 'x.md'))} })`)
    ok('「清空重填」后不再是完成态,导出被拒绝且不写文件', afterReset && afterReset.ok === false && !fs.existsSync(path.join(tmp, 'x.md')), JSON.stringify(afterReset))

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
