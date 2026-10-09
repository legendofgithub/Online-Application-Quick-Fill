// 真实校招站点实战验证:逐站跑「适配器匹配 → GENERIC_PROBE 探测 → 通用引擎实填」。
// 铁律:只填不提交 —— 全程不定位、不触发任何提交按钮(与正式主进程同一套脚本)。
//
// 用法: electron scripts/test-real-sites.cjs
// 说明:探针读取的是**正式 userData 里的真实简历**,因此结果直接反映真实投递时的命中率。
const { app, BrowserWindow, WebContentsView } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { matchAdapter, GENERIC_PROBE } = require('../electron/adapters.cjs')
const fillScript = require('../electron/fillScript.cjs')

const APP_NAME = '校招快填'
const SITE_TIMEOUT_MS = 35000
const SETTLE_MS = 4000

// 与打包版共用同一份 userData:
//  1) 直接读到真实简历(不用再复制一份);
//  2) 复用「用户在软件里登录过」的会话 cookie —— 真实网申表单页未登录时根本到不了,
//     这是能否验证真实申请表单的前提。
// 必须在 app ready 之前设置。
app.setPath('userData', path.join(app.getPath('appData'), APP_NAME))

// T0/T1/T2 直达招聘系统入口(「官网进」的首页也保留,用于观察是否需要再点导航)
const SITES = [
  ['T0 中金公司', 'https://cicc.zhiye.com/campus'],
  ['T0 蚂蚁集团', 'https://talent.antgroup.com/campus/home'],
  ['T0 字节跳动', 'https://jobs.bytedance.com/'],
  ['T1 华泰证券', 'https://wecruit.hotjob.cn/SU6013d14e5d83dc11e4a8ae4d/pb/index.html'],
  ['T1 广发证券', 'https://job.gf.com.cn/'],
  ['T1 中信证券', 'https://careers.citics.com/'],
  ['T1 国泰海通', 'https://www.gtht.com/'],
  ['T2 建设银行', 'http://job.ccb.com/'],
  ['T2 工商银行', 'https://job.icbc.com.cn/'],
  ['T2 兴业银行', 'https://job.cib.com.cn/portal/'],
  ['T2 招银网络', 'https://cmbnt.cmbchina.com/'],
  ['T2 招商银行', 'https://career.cmbchina.com/'],
  ['T3 南方基金', 'https://www.nffund.com/'],
  ['T3 易方达基金', 'https://www.efunds.com.cn/'],
  ['T6 东方财富', 'https://zhaopin.eastmoney.com/campus-recruitment/eastmoney'],
]

/**
 * 诊断脚本:探测未命中时逐层回答「为什么」。
 * 与 adapters.cjs 的 GENERIC_PROBE 使用**完全相同**的过滤条件与标签推断口径,
 * 因此这里报出的 visible/matched 就是探测器真正看到的数字,不存在两套标准。
 */
const FIELD_WORDS = ['姓名', '性别', '出生', '手机', '电话', '邮箱', '学校', '院校', '专业', '学历', '毕业', '籍贯', '政治', '身份', '自我']
const DIAG_SCRIPT = `(function () {
  var WORDS = ${JSON.stringify(FIELD_WORDS)}
  var SKIP_TYPES = ['hidden','submit','button','reset','password','file','image','checkbox']
  function textOf(el) { return el ? (el.textContent || '').trim().replace(/\\s+/g, ' ') : '' }
  // 与 GENERIC_PROBE 的 labelFor 同口径
  function labelFor(doc, el) {
    var cands = []
    if (el.id) { var lb = doc.querySelector('label[for="' + el.id + '"]'); if (lb) cands.push(textOf(lb)) }
    var aria = el.getAttribute('aria-label') || el.getAttribute('placeholder') || ''
    if (aria) cands.push(aria)
    var lb2 = el.closest ? el.closest('label') : null
    if (lb2) cands.push(textOf(lb2))
    var cell = el.closest ? el.closest('td,th,dd,dt') : null
    if (cell && cell.previousElementSibling) cands.push(textOf(cell.previousElementSibling))
    var wrap = el.parentElement
    for (var d = 0; d < 4 && wrap; d++) { var t = textOf(wrap); if (t && t.length <= 30) cands.push(t); wrap = wrap.parentElement }
    for (var i = 0; i < cands.length; i++) if (cands[i]) return cands[i]
    return ''
  }
  function hit(label) { for (var i = 0; i < WORDS.length; i++) if (label.indexOf(WORDS[i]) >= 0) return WORDS[i]; return '' }
  var ctrls = document.querySelectorAll('input,select,textarea')
  var visible = 0, matched = 0, hidden = 0, disabled = 0, readOnly = 0, zeroSize = 0, skippedType = 0
  var samples = []
  for (var i = 0; i < ctrls.length; i++) {
    var el = ctrls[i]
    var t = (el.getAttribute('type') || el.type || 'text').toLowerCase()
    var lab = labelFor(document, el)
    var h = hit(lab)
    var why = ''
    if (SKIP_TYPES.indexOf(t) >= 0) { skippedType++; why = 'type=' + t }
    else if (el.disabled) { disabled++; why = 'disabled' }
    else if (el.readOnly) { readOnly++; why = 'readOnly' }
    else if (el.getClientRects().length === 0) { zeroSize++; why = 'invisible' }
    else { visible++; if (h) matched++ }
    if (samples.length < 16) {
      samples.push({
        tag: el.tagName, type: t, ro: !!el.readOnly, dis: !!el.disabled,
        vis: el.getClientRects().length > 0,
        ph: (el.getAttribute('placeholder') || '').slice(0, 12),
        nm: (el.getAttribute('name') || el.id || '').slice(0, 16),
        label: lab.slice(0, 18), hit: h, why: why
      })
    }
  }
  var body = (document.body ? document.body.innerText : '').slice(0, 5000)
  return {
    visibleControls: visible, matchedLabels: matched,
    totalControls: ctrls.length,
    filtered: { skippedType: skippedType, disabled: disabled, readOnly: readOnly, invisible: zeroSize },
    hasForm: document.querySelector('form') !== null,
    passwordInputs: document.querySelectorAll('input[type="password"]').length,
    loginHint: /登录|登陆|密码|验证码|sign in|log in/i.test(body),
    iframes: document.querySelectorAll('iframe').length,
    shadowHosts: (function () {
      var n = 0
      var all = document.querySelectorAll('*')
      for (var i = 0; i < all.length; i++) if (all[i].shadowRoot) n++
      return n
    })(),
    samples: samples
  }
})()`

function readRealResume() {
  const candidates = [
    path.join(app.getPath('appData'), APP_NAME, 'resumes.json'),
    path.join(__dirname, '..', '.dev-data', 'resumes.json'),
  ]
  for (const p of candidates) {
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'))
      const list = Array.isArray(data.resumes) ? data.resumes.filter(r => r && typeof r.id === 'string') : []
      if (list.length > 0) {
        const cur = list.find(r => r.id === data.currentId) || list[0]
        return { resume: cur, from: p }
      }
    } catch { /* 试下一个 */ }
  }
  return { resume: null, from: '(未找到)' }
}

const wait = ms => new Promise(r => setTimeout(r, ms))

/**
 * 与主进程 executeOnFrames 同口径:主 frame + 全部子 frame 各执行一次。
 * 真实招聘站大量使用 iframe 承载申请表(如 moka/北森),只探主 frame 会漏判。
 * 返回每个 frame 的结果(注入失败的 frame 为 null)。
 */
async function onFrames(wc, script) {
  if (wc == null || wc.isDestroyed()) return []
  if (wc.mainFrame == null) return []
  const frames = []
  try {
    frames.push(wc.mainFrame)
    for (const f of wc.mainFrame.frames) frames.push(f)
  } catch { /* 退回仅主 frame */ }
  return Promise.all(frames.map(f => f.executeJavaScript(script).catch(() => null)))
}

async function withTimeout(promise, ms, label) {
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
}

async function inspect(win, url) {
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload-bridge.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // 隐藏窗口会被 Chromium 节流定时器,填写脚本靠 setTimeout 逐字段推进
      backgroundThrottling: false,
    },
  })
  win.contentView.addChildView(view)
  view.setBounds({ x: 0, y: 0, width: 1280, height: 900 })
  const wc = view.webContents
  const out = { url, finalUrl: '', title: '', adapter: null, probe: null, diag: null, fill: null, error: '' }
  try {
    await withTimeout(wc.loadURL(url), SITE_TIMEOUT_MS, 'load-timeout')
    await wait(SETTLE_MS)
    out.finalUrl = wc.getURL()
    out.title = wc.getTitle()
    const adapter = matchAdapter(out.finalUrl)
    out.adapter = adapter === null ? null : adapter.name
    if (adapter !== null) {
      try {
        const rs = await onFrames(wc, adapter.probe)
        out.frames = rs.length
        out.probe = rs.some(r => r === true) ? true : (rs.some(r => r !== null) ? false : 'error')
      } catch (e) {
        out.probe = 'threw: ' + String(e && e.message).slice(0, 80)
      }
    }
    try {
      // 诊断取「控件最多的那个 frame」,这样 iframe 里的表单不会被主 frame 的 0 控件掩盖
      const ds = (await onFrames(wc, DIAG_SCRIPT)).filter(d => d !== null)
      out.diag = ds.length === 0
        ? null
        : ds.reduce((a, b) => (b.visibleControls > a.visibleControls ? b : a))
    } catch { /* ignore */ }
  } catch (e) {
    out.error = String((e && e.message) || e).slice(0, 120)
  }
  return { out, view }
}

app.whenReady().then(async () => {
  const { resume, from } = readRealResume()
  console.log('简历来源:', from)
  console.log('简历:', resume === null ? '(无)' : resume.name)
  if (resume === null) {
    console.log('没有可用简历,终止')
    app.quit()
    return
  }
  const win = new BrowserWindow({ show: false, width: 1280, height: 900 })
  // 支持只测指定 URL:electron scripts/test-real-sites.cjs <url> [url...]
  // 用于「在软件里登录某站后」定点复测那个站的真实申请表单页。
  const argv = process.argv.slice(1).filter(a => /^https?:\/\//i.test(a))
  const targets = argv.length > 0 ? argv.map(u => ['指定', u]) : SITES
  if (argv.length > 0) console.log('仅测指定 URL,共 ' + argv.length + ' 个')
  const results = []
  for (const [tier, url] of targets) {
    console.log('---- ' + tier + ' ' + url)
    const { out, view } = await inspect(win, url)
    // 探测命中才实填(与正式流程一致:探测通过 → 复检 → 填写)
    if (out.probe === true) {
      const script = fillScript.genericFillScript(resume.profile, {
        mappings: {},
        custom: resume.custom || {},
      })
      try {
        // 与主进程一致:多 frame 各跑一次,取实际填写数最多的结果
        const rs = await withTimeout(onFrames(view.webContents, script), 120000, 'fill-timeout')
        const objs = rs.filter(x => x != null && typeof x === 'object')
        out.fill = objs.sort((a, b) => (b.filled || 0) - (a.filled || 0))[0] ?? { error: 'no-result' }
      } catch (e) {
        out.fill = { error: String((e && e.message) || e).slice(0, 120) }
      }
    }
    results.push({ tier, ...out })
    try {
      win.contentView.removeChildView(view)
      view.webContents.close()
    } catch { /* ignore */ }
    await wait(600)
  }

  console.log('\n================ 汇总 ================')
  for (const r of results) {
    const probe = r.error !== '' ? 'ERR:' + r.error : String(r.probe)
    const fill = r.fill === null
      ? '-'
      : (r.fill.error !== undefined
        ? 'ERR'
        : `filled=${r.fill.filled}/${r.fill.total} 缺项=${(r.fill.missingPageFields || []).length}`)
    console.log(
      [r.tier.padEnd(12), ('probe=' + probe).padEnd(18), ('适配=' + (r.adapter || '无')).padEnd(12),
        ('frame=' + (r.frames === undefined ? '?' : r.frames)).padEnd(9),
        ('控件=' + (r.diag ? r.diag.visibleControls : '?')).padEnd(9),
        (r.diag && r.diag.passwordInputs > 0 ? '有密码框' : '        '),
        ('fill=' + fill)].join(' '),
    )
  }
  console.log('\n================ 明细 ================')
  for (const r of results) {
    console.log('\n■ ' + r.tier + '  ' + r.url)
    console.log('  最终URL: ' + r.finalUrl)
    console.log('  标题:    ' + (r.title || '').slice(0, 70))
    if (r.diag !== null) {
      const d = r.diag
      console.log('  探测结论: ' + (r.probe === true ? '命中' : String(r.probe)))
      console.log('  诊断:    可见控件=' + d.visibleControls + ' 命中标签=' + d.matchedLabels +
        ' (探测器判定阈值: 可见>=3 或 有form, 且 命中标签>=2)')
      console.log('  控件总数=' + d.totalControls + ' 表单=' + d.hasForm + ' iframe=' + d.iframes +
        ' shadowHost=' + d.shadowHosts + ' 密码框=' + d.passwordInputs + ' 登录字样=' + d.loginHint)
      console.log('  被过滤:  ' + JSON.stringify(d.filtered))
      for (const s of (d.samples || []).slice(0, 14)) {
        console.log('    · ' + s.tag + '/' + s.type + (s.ro ? ' readonly' : '') + (s.dis ? ' disabled' : '') +
          (s.vis ? '' : ' 不可见') + (s.why ? ' [' + s.why + ']' : '') +
          ' ph=' + JSON.stringify(s.ph) + ' nm=' + JSON.stringify(s.nm) +
          ' label=' + JSON.stringify(s.label) + (s.hit ? ' 命中「' + s.hit + '」' : ' 未命中'))
      }
    }
    if (r.fill !== null && r.fill.error === undefined) {
      console.log('  填写:    ' + JSON.stringify({ filled: r.fill.filled, total: r.fill.total }))
      console.log('  未匹配:  ' + ((r.fill.missingPageFields || []).slice(0, 10).join('、') || '(无)'))
      console.log('  数据闲置: ' + ((r.fill.missingData || []).join('、') || '(无)'))
    }
  }
  app.quit()
})
