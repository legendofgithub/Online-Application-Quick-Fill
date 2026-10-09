// 重复区块填写回归测试(纯 Electron,无 GUI):
//   node_modules/.bin/electron scripts/test-records-fill.cjs
//
// 夹具 test-forms/sample-records-form.html:2 行教育 + 3 行经历 + 2 行项目 + 2 行获奖
// + 1 个区块外「个人描述」反例。测试跑两个场景:
//   场景 A:第 k 行取第 k 条记录;记录优先于扁平字段;性质别名;区块外的键不得漏出去。
//   场景 B(只有 1 条教育、其余记录为空):第 1 行照常填,**第 2 行必须留空** ——
//            这是用真实数据跑夹具时发现的 bug:扁平字段回退对第 2 行也生效,
//            会把第 1 行复制成第 2 行(提交上去就是两段一模一样的学历)。
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const assert = require('node:assert')
const fillScript = require('../electron/fillScript.cjs')

const PROFILE = {
  姓名: '张明',
  手机: '13800000000',
  紧急联系人电话: '13900000000',
  英语等级: 'IELTS',
  出生日期: '2024-03-15',
  国家地区: '中国大陆',
  // 扁平教育字段故意与第 1 条记录不同,用来证明记录优先
  学校: '扁平字段里的学校',
  专业: '扁平字段里的专业',
  学历: '本科',
  入学时间: '1999-01-01',
  毕业时间: '1999-12-31',
}
const EDUCATIONS = [
  {
    id: 'e0', 学校: '示例大学', 专业: '信息管理与信息系统（示例方向）', 学历: '硕士',
    入学时间: '2025-09-01', 毕业时间: '2027-06-30', 导师: '示例导师', 实验室: '示例实验室', 研究方向: '量化投资',
  },
  {
    id: 'e1', 学校: '示例师范大学', 专业: '信息管理与信息系统', 学历: '本科',
    入学时间: '2021-09-18', 毕业时间: '2025-06-20', 导师: '', 实验室: '', 研究方向: '',
  },
  {
    // 夹具里第 3 个教育块是「腾讯样式」(标签前置 + 自绘日期控件),用它验证:
    // 只有靠「控件之前的文本」才能找到标签时,仍能对齐到第 3 条记录
    id: 'e2', 学校: '示例交通大学', 专业: '经济学（联合培养）', 学历: '本科',
    入学时间: '2023-09-01', 毕业时间: '2024-06-30', 导师: '', 实验室: '', 研究方向: '',
  },
  {
    // 第 4 个教育块在「其他补充」里,测「起止时间」范围控件的配对
    id: 'e3', 学校: '示例财经大学', 专业: '金融学（辅修）', 学历: '本科',
    入学时间: '2022-03-01', 毕业时间: '2022-12-31', 导师: '', 实验室: '', 研究方向: '',
  },
]
const EXPERIENCES = [
  { id: 'x0', 公司: '示例资本', 职位: '投资助理(VC)', 性质: '实习', 开始时间: '2026-07-01', 结束时间: '2026-09-30', 描述: '一级市场投前行业分析' },
  { id: 'x1', 公司: '示例投资', 职位: '投资助理(PE)', 性质: '正职', 开始时间: '2025-12-01', 结束时间: '2026-03-31', 描述: 'PE 项目尽调与投委会材料' },
  { id: 'x2', 公司: '示例科技有限公司', 职位: 'IT 咨询审计', 性质: '兼职', 开始时间: '2024-06-01', 结束时间: '2024-09-30', 描述: 'ITGC 审计底稿' },
]
const PROJECTS = [
  { id: 'p0', 项目名称: '示例项目A', 项目角色: '独立设计与开发', 开始时间: '2026-01-01', 结束时间: '2026-05-31', 项目描述: 'AI 求职工具' },
  { id: 'p1', 项目名称: '示例项目B', 项目角色: '负责人', 开始时间: '2025-06-01', 结束时间: '2025-10-31', 项目描述: '视频生成评测' },
  { id: 'p2', 项目名称: '量化选股回测', 项目角色: '数据与回测', 开始时间: '2024-03-01', 结束时间: '2024-07-31', 项目描述: '多因子回测框架' },
]
const AWARDS = [
  { id: 'a0', 奖项名称: '校级一等奖学金', 获奖时间: '2024-10-01', 级别: '校级' },
  { id: 'a1', 奖项名称: '全国大学生数学建模竞赛二等奖', 获奖时间: '2023-11-15', 级别: '国家级' },
]

let passed = 0
function ok(name, cond, detail) {
  assert.ok(cond, `${name}${detail === undefined ? '' : ' — ' + detail}`)
  passed++
  console.log(`  PASS ${name}`)
}

const FIXTURE = path.join(__dirname, '..', 'test-forms', 'sample-records-form.html')
const READ_VALUES = `(() => { const o = {}; document.querySelectorAll('input,select,textarea').forEach(e => { if (e.id) o[e.id] = e.value }); return o })()`

/** 重新加载夹具(清空上一轮的填写结果)并按给定记录跑一次通用填写 */
async function fillWith(win, profile, records) {
  await win.loadFile(FIXTURE)
  const script = fillScript.genericFillScript(profile, { mappings: {}, custom: {}, debug: process.env.DEBUG_TASKS === '1', ...records })
  const result = await win.webContents.mainFrame.executeJavaScript(script)
  const values = await win.webContents.executeJavaScript(READ_VALUES)
  if (Array.isArray(result.tasks)) {
    console.log('  --- 教育相关任务 ---')
    for (const t of result.tasks.filter(t => ['入学时间', '毕业时间', '学校'].includes(t.key))) {
      console.log(`    ${t.key} record=${t.record} occ=${t.occ} id=${t.id} value=${JSON.stringify(t.value)}`)
    }
  }
  return { result, values }
}

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } })

    // ── 场景 A ──
    console.log('场景 A — 2 教育 / 3 经历 / 2 项目 / 2 获奖:')
    const a = await fillWith(win, PROFILE, { educations: EDUCATIONS, experiences: EXPERIENCES, projects: PROJECTS, awards: AWARDS })
    const v = a.values
    console.log('  RAW-RESULT =', JSON.stringify(a.result))

    ok('扁平字段照常填写(姓名/手机)', v.name === '张明' && v.phone === '13800000000', JSON.stringify({ n: v.name, p: v.phone }))
    ok('第 1 段教育 = educations[0](记录优先,不是扁平字段)', v['edu0-school'] === '示例大学' && v['edu0-degree'] === '硕士', JSON.stringify({ s: v['edu0-school'], d: v['edu0-degree'] }))
    ok('第 2 段教育 = educations[1]', v['edu1-school'] === '示例师范大学' && v['edu1-degree'] === '本科', JSON.stringify({ s: v['edu1-school'], d: v['edu1-degree'] }))
    ok('第 1 条经历 = experiences[0]', v['exp0-company'] === '示例资本' && v['exp0-title'] === '投资助理(VC)', JSON.stringify({ c: v['exp0-company'], t: v['exp0-title'] }))
    ok('第 3 条经历 = experiences[2]', v['exp2-company'] === '示例科技有限公司' && v['exp2-start'] === '2024-06-01', JSON.stringify({ c: v['exp2-company'], s: v['exp2-start'] }))
    ok('经历描述逐行对齐', v['exp0-desc'] === '一级市场投前行业分析' && v['exp2-desc'] === 'ITGC 审计底稿')
    ok('性质「正职」落到下拉里的「全职」', v['exp1-kind'] === '全职', v['exp1-kind'])
    ok('第 1 条项目 = projects[0]', v['prj0-name'] === '示例项目A' && v['prj0-role'] === '独立设计与开发', JSON.stringify({ n: v['prj0-name'], r: v['prj0-role'] }))
    ok('第 2 条项目 = projects[1](行级对齐)', v['prj1-name'] === '示例项目B' && v['prj1-role'] === '负责人', JSON.stringify({ n: v['prj1-name'], r: v['prj1-role'] }))
    ok('项目描述逐行对齐', v['prj0-desc'] === 'AI 求职工具' && v['prj1-desc'] === '视频生成评测')
    ok('第 1 项获奖 = awards[0]', v['awd0-name'] === '校级一等奖学金' && v['awd0-time'] === '2024-10-01' && v['awd0-level'] === '校级', JSON.stringify({ n: v['awd0-name'], t: v['awd0-time'], l: v['awd0-level'] }))
    ok('第 2 项获奖 = awards[1](行级对齐)', v['awd1-name'] === '全国大学生数学建模竞赛二等奖' && v['awd1-level'] === '国家级', JSON.stringify({ n: v['awd1-name'], l: v['awd1-level'] }))
    ok('区块外的「个人描述」保持为空(经历描述没有漏出去)', v.selfdesc === '', JSON.stringify(v.selfdesc))
    // 腾讯样式:标签在控件之前 + 自绘只读日期框 + 占位符是「请选择」+ 整行文本超 30 字。
    // 修复前这两格必然为空(标签候选被 30 字上限挡掉),用户报的「起止时间全填不上」就是它。
    ok(
      '教育块内的「开始时间/结束时间」映射到该段入学/毕业时间(腾讯样式)',
      v['edu2-t1'] === '2023-09-01' && v['edu2-t2'] === '2024-06-30',
      JSON.stringify({ s: v['edu2-t1'], e: v['edu2-t2'] }),
    )
    // 「其他补充」区块:一次覆盖报告暴露的四种结构
    ok(
      '超长标签(紧急联系人电话* 如与本人手机号不同…)能靠截断头部匹配上',
      v['extra-phone'] === '13900000000',
      JSON.stringify(v['extra-phone']),
    )
    ok(
      '含 select 的容器不再把 option 选项串当标签',
      v['extra-english'] === 'IELTS',
      JSON.stringify(v['extra-english']),
    )
    // 日期存的是 2024-03-15,而页面只给了「年」下拉 —— 必须靠候选写法命中
    ok(
      '日期字段能填进「年」下拉(2024-03-15 → 2024年)',
      v['extra-birth-year'] === '2024年',
      JSON.stringify(v['extra-birth-year']),
    )
    // 复现腾讯的手机号陷阱:国家下拉(选项含 +86)必须归「国家地区」,不能抢手机号的键位
    ok('手机号前的国家下拉归到「国家地区」并选中中国大陆', v['extra-country'] === '中国大陆', JSON.stringify(v['extra-country']))
    ok('手机号仍落进真正的文本框(没被国家下拉抢走)', v['extra-phone'] === '13900000000', JSON.stringify(v['extra-phone']))
    ok(
      '「起止时间」范围控件配对:第 1 个填入学时间、第 2 个填毕业时间',
      v['extra-t1'] === '2022-03-01' && v['extra-t2'] === '2022-12-31',
      JSON.stringify({ t1: v['extra-t1'], t2: v['extra-t2'] }),
    )
    ok(
      '弱证据块里的「描述」靠同块内的项目字段佐证后能填上',
      v['extra-prj-desc'] === '多因子回测框架',
      JSON.stringify(v['extra-prj-desc']),
    )
    ok('该块的学校/专业也对齐到第 4 条教育记录', v['extra-school'] === '示例财经大学' && v['extra-major'] === '金融学（辅修）', JSON.stringify({ s: v['extra-school'], m: v['extra-major'] }))
    ok('该块的项目字段对齐到第 3 条项目记录', v['extra-prj-name'] === '量化选股回测' && v['extra-prj-role'] === '数据与回测', JSON.stringify({ n: v['extra-prj-name'], r: v['extra-prj-role'] }))
    // 「添加」按钮:夹具的获奖区初始只有 1 行,第 2 条必须靠引擎点「添加」生成
    ok('引擎点「添加」生成了第 2 行获奖(初始只有 1 行)', a.result.addedRows !== undefined && a.result.addedRows.awards === 1, JSON.stringify(a.result.addedRows))
    ok('新生成的那一行被正确填写(第 2 项获奖)', v['awd1-name'] === '全国大学生数学建模竞赛二等奖' && v['awd1-level'] === '国家级', JSON.stringify({ n: v['awd1-name'], l: v['awd1-level'] }))

    // ── 场景 B:只有 1 条教育,其余记录为空 ──
    console.log('\n场景 B — 只有 1 条教育、其余记录为空:')
    const b = await fillWith(win, PROFILE, { educations: [EDUCATIONS[0]], experiences: [], projects: [], awards: [] })
    const v2 = b.values
    ok('第 1 行教育照常填(兼容没有 educations 的旧简历)', v2['edu0-school'] === '示例大学' && v2['edu0-degree'] === '硕士', JSON.stringify({ s: v2['edu0-school'], d: v2['edu0-degree'] }))
    ok('第 2 行教育必须留空,不得把第 1 行复制过去', v2['edu1-school'] === '' && v2['edu1-degree'] === '' && v2['edu1-major'] === '', JSON.stringify({ s: v2['edu1-school'], d: v2['edu1-degree'] }))
    ok('第 3 行教育(腾讯样式)同样留空,不复制第 1 行', v2['edu2-t1'] === '' && v2['edu2-t2'] === '', JSON.stringify({ s: v2['edu2-t1'], e: v2['edu2-t2'] }))
    ok('没有经历/项目/获奖记录时,各行留空且不残留', v2['exp0-company'] === '' && v2['prj0-name'] === '' && v2['awd0-name'] === '' && v2['exp0-desc'] === '')
    ok('没有获奖记录时不会去点「添加」', b.result.addedRows === undefined || b.result.addedRows.awards === undefined, JSON.stringify(b.result.addedRows))
    console.log('  场景 B 引擎结果 =', JSON.stringify({ filled: b.result.filled, total: b.result.total }))

    console.log(`\n全部通过(${passed} 项断言)`)
  } catch (err) {
    console.log('FAIL:', err && err.message)
    process.exitCode = 1
  } finally {
    app.exit(process.exitCode === undefined ? 0 : process.exitCode)
  }
})
