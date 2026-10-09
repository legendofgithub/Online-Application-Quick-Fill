// 站点适配器(技术方案 §2.3):urlPattern 粗筛 + 注入探测脚本确认。
// v1 提供通用适配器(任意含表单的 http/https 页面与本地测试页)与 mokahr 适配器;
// 后续按站点逐个追加覆盖(字段选择器优先级、特殊控件)。

/**
 * 通用表单探测:可见控件 >= 3 且其中至少 2 个的标签命中常见简历字段词,
 * 或存在 form 且满足同样词命中——避免把登录页/搜索页(单纯多输入框)误判为网申表单。
 * 词表为常用 15 词的精简版,与 fillScript 的完整同义词表独立维护。
 */
const FIELD_WORDS = ['姓名', '性别', '出生', '手机', '电话', '邮箱', '学校', '院校', '专业', '学历', '毕业', '籍贯', '政治', '身份', '自我']
const GENERIC_PROBE = `(function () {
  var WORDS = ${JSON.stringify(FIELD_WORDS)}
  function textOf(el) { return el ? (el.textContent || '').trim().replace(/\s+/g, ' ') : '' }
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
  function hits(doc, label) {
    for (var i = 0; i < WORDS.length; i++) if (label.indexOf(WORDS[i]) >= 0) return 1
    return 0
  }
  function scan(doc) {
    var visible = 0
    var matched = 0
    var ctrls = doc.querySelectorAll('input,select,textarea')
    for (var i = 0; i < ctrls.length; i++) {
      var t = ctrls[i].type || ''
      if (['hidden', 'submit', 'button', 'reset', 'password', 'file', 'image', 'checkbox'].indexOf(t) >= 0) continue
      if (ctrls[i].disabled || ctrls[i].readOnly) continue
      if (ctrls[i].getClientRects().length === 0) continue
      visible++
      matched += hits(doc, labelFor(doc, ctrls[i]))
    }
    var hasForm = doc.querySelector('form') !== null
    var iframes = doc.querySelectorAll('iframe')
    for (var j = 0; j < iframes.length; j++) {
      try {
        if (iframes[j].contentDocument) {
          var sub = scan(iframes[j].contentDocument)
          visible += sub.visible
          matched += sub.matched
        }
      } catch (e) { /* 跨域 */ }
    }
    return { visible: visible, matched: matched, hasForm: hasForm }
  }
  var r = scan(document)
  return (r.visible >= 3 || r.hasForm) && r.matched >= 2
})()`

/** demo 演示表单探测(与页面内 detector.ts 同口径) */
const DEMO_PROBE = `(function () { return !!document.querySelector('[data-campus-form]') })()`

const adapters = [
  {
    id: 'mokahr',
    name: 'MokaHR',
    urlPattern: /(^https?:\/\/|^wss?:\/\/)?([a-z0-9-]+\.)*mokahr\.com\//i,
    probe: GENERIC_PROBE,
  },
  {
    id: 'generic',
    name: '通用表单',
    // http(s) 任意站点;file:// 仅放行本地测试页,避免误检测
    urlPattern: /^https?:\/\//i,
    fileAllow: /(^|\/)test-forms\//i,
    probe: GENERIC_PROBE,
  },
]

/**
 * 按 URL 匹配适配器:urlPattern 命中即可(moka 等站点专属适配器优先于 generic);
 * file:// 仅当命中 fileAllow 的测试页才交给 generic。
 */
function matchAdapter(url) {
  if (typeof url !== 'string' || url === '') return null
  if (url.startsWith('file://')) {
    const generic = adapters.find(a => a.id === 'generic')
    return generic !== undefined && generic.fileAllow !== undefined && generic.fileAllow.test(url) ? generic : null
  }
  return adapters.find(a => a.urlPattern.test(url)) ?? null
}

module.exports = { matchAdapter, GENERIC_PROBE, DEMO_PROBE }
