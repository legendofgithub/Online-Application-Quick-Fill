// 注入式填写脚本:demo 页专用(精确选择器,与页面内 filler.ts 同行为)+ 真实页面通用引擎(标签语义匹配)。
// 铁律:脚本只对匹配到的输入控件赋值/选中单选,绝不定位或触发任何提交按钮、绝不 form.submit()。
// 进度经 window.campusFillBridge.report() 回传(见 preload.cjs);页面无 bridge 时静默降级为一次性填写。

// ── demo 演示表单:13 个 data-field 精确映射(与 src/autofill/fieldMapping.ts 保持一致)──

async function injectedDemoFill(profileJson) {
  var p = JSON.parse(profileJson)
  var FIELDS = [
    { key: '姓名', sel: '[data-field="name"] input', control: 'text' },
    { key: '性别', sel: '[data-field="gender"]', control: 'radio' },
    { key: '出生日期', sel: '[data-field="birthDate"] input', control: 'date' },
    { key: '手机', sel: '[data-field="phone"] input', control: 'text' },
    { key: '邮箱', sel: '[data-field="email"] input', control: 'text' },
    { key: '政治面貌', sel: '[data-field="politicalStatus"] select', control: 'select' },
    { key: '籍贯', sel: '[data-field="hometown"] input', control: 'text' },
    { key: '学校', sel: '[data-field="school"] input', control: 'text' },
    { key: '专业', sel: '[data-field="major"] input', control: 'text' },
    { key: '学历', sel: '[data-field="degree"] select', control: 'select' },
    { key: '毕业时间', sel: '[data-field="graduationDate"] input', control: 'date' },
    { key: '求职意向', sel: '[data-field="jobIntention"] select', control: 'select' },
    { key: '自我评价', sel: '[data-field="selfEvaluation"] textarea', control: 'textarea' },
  ]
  var FLASH_CLASS = 'autofill-flash'
  function flash(el) {
    el.classList.add(FLASH_CLASS)
    setTimeout(function () { el.classList.remove(FLASH_CLASS) }, 300)
  }
  function setNative(el, value) {
    var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype
    var d = Object.getOwnPropertyDescriptor(proto, 'value')
    if (d && d.set) d.set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }
  var report = function (i, label) {
    if (window.campusFillBridge) window.campusFillBridge.report(JSON.stringify({ index: i, total: FIELDS.length, label: label }))
  }
  var container = document.querySelector('[data-campus-form]')
  if (!container) return { ok: false, reason: 'no-form' }
  for (var i = 0; i < FIELDS.length; i++) {
    var f = FIELDS[i]
    var target = container.querySelector(f.sel)
    if (!target) { report(i + 1, f.key); continue }
    if (f.control === 'radio') {
      var radios = Array.prototype.slice.call(target.querySelectorAll('input[type="radio"]'))
      var hit = radios.filter(function (r) { return r.value === p[f.key] })[0]
      if (hit && !hit.checked) hit.click()
      if (hit) flash(hit)
    } else {
      setNative(target, p[f.key])
      flash(target)
    }
    report(i + 1, f.key)
    await new Promise(function (r) { setTimeout(r, 200) })
  }
  return { ok: true, filled: FIELDS.length, total: FIELDS.length }
}

function injectedDemoReset() {
  var container = document.querySelector('[data-campus-form]')
  if (!container) return
  var sels = ['[data-field="name"] input', '[data-field="birthDate"] input', '[data-field="phone"] input',
    '[data-field="email"] input', '[data-field="politicalStatus"] select', '[data-field="hometown"] input',
    '[data-field="school"] input', '[data-field="major"] input', '[data-field="degree"] select',
    '[data-field="graduationDate"] input', '[data-field="jobIntention"] select', '[data-field="selfEvaluation"] textarea']
  sels.forEach(function (sel) {
    var el = container.querySelector(sel)
    if (!el) return
    var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    var d = Object.getOwnPropertyDescriptor(proto, 'value')
    if (d && d.set) d.set.call(el, '')
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
  var radios = container.querySelectorAll('[data-field="gender"] input[type="radio"]')
  Array.prototype.forEach.call(radios, function (r) {
    if (!r.checked) return
    var cd = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')
    var prevent = function (e) { e.preventDefault() }
    r.addEventListener('click', prevent)
    if (cd && cd.set) cd.set.call(r, false)
    r.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }))
    r.removeEventListener('click', prevent)
    r.dispatchEvent(new Event('input', { bubbles: true }))
    r.dispatchEvent(new Event('change', { bubbles: true }))
  })
  return { ok: true }
}

// ── 真实页面通用引擎:控件收集 → 标签推断 → 三级匹配(手动关联 > 自定义字段 > 同义词表)→ 原生事件写入 ──

async function injectedGenericFill(profileJson, optionsJson) {
  var p = JSON.parse(profileJson)
  var opts = JSON.parse(optionsJson || '{}')
  var mappings = opts.mappings || {}
  var custom = opts.custom || {}
  // 可重复记录(多段教育 / 多条实习经历)。第 k 个同名字段会对应第 k 条记录(见 valueFor)。
  // 为空数组时行为与旧版完全一致:教育键回退到扁平字段,经历键根本不参与匹配。
  var eduRecs = Array.isArray(opts.educations) ? opts.educations : []

  // 内置标签同义词表(依大公司网申模板扩充):值按最长命中优先,防「毕业院校」被短词抢先
  var SYN = {
    姓名: ['姓名', '名字', '真实姓名', '您的姓名', 'name'],
    性别: ['性别', 'gender', 'sex'],
    出生日期: ['出生日期', '出生年月', '生日', 'birthday', 'birth'],
    民族: ['民族', '种族'],
    籍贯: ['籍贯', '户籍', '户口', 'native place'],
    出生地: ['出生地', '出生城市'],
    政治面貌: ['政治面貌', '面貌', 'politic'],
    婚姻状况: ['婚姻状况', '婚姻', '婚否'],
    身份证号: ['身份证号码', '身份证号', '证件号码', '身份证', 'id card'],
    户口类别: ['户口类别', '户口性质', '户口类型'],
    // 户口所在地独立成键:此前它被挂在「籍贯」的同义词里,导致标着「户口所在地」的
    // 表单字段会被填成籍贯。这里的长词(户籍所在地/户籍地址…)比籍贯的「户籍/户口」更长,
    // 按最长命中优先,能稳定抢到;而只写「户籍」「户口」的字段仍归籍贯,行为不变。
    户口所在地: ['户口所在地', '户籍所在地', '户籍地址', '户籍地', '户口地址', '户口所属地', '户籍所属地'],
    身高: ['身高'],
    体重: ['体重'],
    视力: ['视力'],
    手机: ['手机号码', '手机号', '手机', '联系电话', '联系方式', '电话号码', '电话', 'mobile', 'phone', 'tel'],
    邮箱: ['电子邮箱', '电子邮件', '邮箱', 'email', 'e-mail', 'mail'],
    固定电话: ['固定电话', '座机'],
    // 据 2026-10-03 腾讯填写报告补充:微信号/QQ号是国家/地区之外的必填项
    微信号: ['微信号', '微信', 'wechat', 'weixin'],
    QQ号: ['QQ号', 'QQ号码', 'qq'],
    国家地区: ['国家/地区', '国家地区', '所在国家/地区', '国籍', '国家'],
    个人主页: ['个人主页链接', '个人主页', '个人网站', '主页链接', '作品集链接', 'portfolio'],
    // 外企表单把姓名拆开问(安永等)
    英文名: ['英文名', '英文姓名', 'english name', '英文名称'],
    姓拼音: ['姓（拼音）', '姓(拼音)', '姓氏拼音', '姓拼音', 'last name', 'surname', 'family name'],
    名拼音: ['名（拼音）', '名(拼音)', '名字拼音', '名拼音', 'first name', 'given name'],
    姓名拼音: ['姓名拼音', '拼音姓名', '拼音', 'name in pinyin', 'pinyin'],
    现居住城市: ['现居住城市', '居住城市', '现居住地', '居住地', '所在城市', '现居城市'],
    // 据腾讯填写报告补充:这几项是它单独问的
    当前所处地: ['当前所处地', '当前所在地', '当前所在城市', '目前所在地', '目前所在城市'],
    目前就读地: ['目前就读地', '就读地', '就读城市', '就读院校所在地', '目前就读城市'],
    通信地址: ['通信地址', '联系地址', '常用地址', '现住地址', '通讯地址', '地址'],
    邮政编码: ['邮政编码', '邮编', 'zipcode', 'zip'],
    紧急联系人: ['紧急联系人'],
    紧急联系人电话: ['紧急联系人电话', '紧急联系方式', '紧急联系人手机'],
    求职意向: ['求职意向', '意向岗位', '应聘岗位', '申请职位', '期望职位', '应聘职位', '意向职位', '岗位名称', '职位', '岗位', '意向'],
    期望工作地: ['期望工作地', '期望工作城市', '工作地点', '期望城市', '意向城市', '期望地点'],
    期望月薪: ['期望月薪', '期望薪资', '薪资要求', '月薪要求', '期望年薪'],
    到岗时间: ['到岗时间', '入职时间', '可到岗时间', '最快到岗'],
    是否接受调剂: ['接受调剂', '服从调剂', '服从分配', '是否调剂'],
    // 网申附加项(据腾讯填写报告补充)
    内推码: ['内推码', '内推串码', '内推编号', '推荐码', '内推'],
    远程面试: ['远程面试', '是否接受远程面试', '接受远程面试', '线上面试'],
    学校: ['毕业院校', '学校名称', '最高学历院校', '院校', '学校', 'university', 'school', 'college'],
    院系: ['院系', '学院名称', '所属学院', '二级学院'],
    专业: ['所学专业', '专业名称', '专业', 'major'],
    学历: ['最高学历', '学历学位', '学历', '学位', 'education', 'degree'],
    学制: ['学制', '学习年限'],
    入学时间: ['入学时间', '入学日期', '入学年月'],
    毕业时间: ['毕业时间', '毕业日期', '毕业年月', 'graduation'],
    统招与否: ['统招', '统分', '是否统招'],
    GPA: ['gpa', '绩点', '平均学分绩点'],
    专业排名: ['专业排名', '成绩排名', '排名'],
    // 据腾讯填写报告补充:教育经历里这三项是按段填的,归入 EDU_KEYS 做行级对齐
    导师: ['导师', '指导教师', '导师姓名'],
    实验室: ['实验室', '所属实验室'],
    研究方向: ['研究方向', '研究领域', '研究内容'],
    英语等级: ['英语等级', '英语水平', '英语级别', 'cet', '四六级', '大学英语'],
    平均成绩: ['历年平均成绩（百分制）', '历年平均成绩(百分制)', '历年平均成绩', '平均成绩', '平均分', 'gpa', '绩点'],
    招聘信息来源: ['招聘信息来源', '信息来源', '你从哪里得知', '获知渠道', '招聘信息渠道'],
    所在行业: ['所在行业', '行业', '所属行业'],
    最高奖学金级别: ['最高奖学金级别', '奖学金级别', '最高奖学金'],
    最高学生职务: ['最高学生职务', '学生职务', '最高职务', '担任职务'],
    日语能力: ['日语能力', '日语水平', '日语等级', '日语'],
    韩语能力: ['韩语能力', '韩语水平', '韩语等级', '韩语'],
    英语其他考试: ['英语能力（其他考试）', '英语能力(其他考试)', '其他英语考试', '其他英语能力'],
    是否有竞业限制协议: ['保密协议', '竞业限制', '竞业协议', '是否有签订'],
    注会通过门数: ['中国注册会计师考试通过门数', '注册会计师通过门数', '注会通过门数', 'cpa'],
    ACCA通过门数: ['ACCA考试通过门数', 'ACCA通过门数', 'acca'],
    英语分数: ['英语分数', '英语成绩', '四六级成绩', '六级成绩', '四级成绩', '托福', '雅思', 'toefl', 'ielts'],
    其他外语: ['其他外语', '第二外语', '小语种', '非通用语种'],
    计算机等级: ['计算机等级', '计算机水平', '计算机能力', '计算机证书'],
    其他证书: ['其他证书', '专业证书', '资格证书', '职业资格'],
    开发语言: ['开发语言', '编程语言', '掌握语言', '熟悉语言', 'programming language'],
    生源所在地: ['生源所在地', '生源地', '生源'],
    学生证号: ['学生证号', '学号', '学生编号'],
    就业推荐表编号: ['就业推荐表', '推荐表编号'],
    在校职务: ['在校职务', '担任职务', '校内职务', '学生干部', '干部经历'],
    是否独生子女: ['独生子女'],
    父亲姓名: ['父亲姓名', '父亲名字'],
    父亲电话: ['父亲电话', '父亲联系电话', '父亲手机'],
    // 家庭主要成员栏常写成「工作单位 / 职务」,没有「父亲」前缀时靠父/母前缀区分,
     // 所以这里必须带上「父亲」「父」的写法,并覆盖「所在单位」「职位」「岗位」等变体
    父亲单位: ['父亲工作单位', '父亲所在单位', '父亲单位', '父工作单位', '父亲工作', '父单位'],
    父亲职务: ['父亲职务', '父亲职位', '父亲岗位', '父职务', '父职位'],
    母亲姓名: ['母亲姓名', '母亲名字'],
    母亲电话: ['母亲电话', '母亲联系电话', '母亲手机'],
    母亲单位: ['母亲工作单位', '母亲所在单位', '母亲单位', '母工作单位', '母亲工作', '母单位'],
    母亲职务: ['母亲职务', '母亲职位', '母亲岗位', '母职务', '母职位'],
    自我评价: ['自我评价', '自我介绍', '个人评价', '自我描述', '个人简介', '个人优势'],
    个人特长: ['个人特长', '特长', '专长'],
    兴趣爱好: ['兴趣爱好', '爱好'],
  }

  // ── 可重复区块:多段教育 / 多条实习经历 / 项目 / 获奖 ────────────────
  // 教育键已在上面的 SYN 里(学校/专业/学历…),这里只声明它们**可以重复出现**:
  // 第 k 个同名字段取第 k 条教育记录。记录缺失或字段为空时回退到扁平字段,
  // 所以「只有一段教育」的旧表单行为一点不变。
  var EDU_KEYS = { 学校: 1, 院系: 1, 专业: 1, 学历: 1, 学制: 1, 入学时间: 1, 毕业时间: 1, 统招与否: 1, GPA: 1, 专业排名: 1, 导师: 1, 实验室: 1, 研究方向: 1 }
  // 其余记录类型统一成一张表:每种区块 = 一个记录数组 + 一套字段同义词 + 一组区块标题关键词。
  // 新增一类记录(比如「论文」)只要在这里加一项,匹配/取值/行级对齐都是共用的。
  // 这些键**只在已识别的对应区块内**参与匹配 —— 「开始时间」「描述」这类词太泛,
  // 放进全局同义词表会在无关表单上误填。
  var RECORD_KINDS = [
    {
      // 教育也做成一种记录类型,目的不只是行级对齐,更是为了让**块内的
      // 「开始时间/结束时间」能映射到这一段的入学/毕业时间** ——
      // 腾讯网申的教育经历就是这么标的,块内不认这两个词,日期整列就填不上。
      name: 'educations',
      records: eduRecs,
      blockRe: /教育|学校|院校|学历|毕业|就读|学习经历|求学/,
      syn: {
        学校: ['毕业院校', '学校名称', '最高学历院校', '院校', '学校'],
        院系: ['院系', '学院名称', '所属学院', '二级学院'],
        专业: ['所学专业', '专业名称', '专业'],
        // 辅修专业必须是**独立的键**:安永每段教育同时有「专业」和「辅修专业」两个控件,
        // 若都算作「专业」,占位次数会被吃掉,真正的专业字段就会落到第 3、4 次出现,
        // 而用户通常只有 1~2 段教育 → 取值为空 → 报告第七节里 专业×7 全是 值「」。
        辅修专业: ['辅修专业', '双学位专业', '第二专业', '辅修'],
        学历: ['最高学历', '学历学位', '学历', '学位'],
        学制: ['学制', '学习年限'],
        入学时间: ['入学时间', '入学日期', '入学年月', '开始时间', '起始时间', '起始年月', '开始年月', '起止时间', '起止年月', '起止日期', '在校时间', '就读时间'],
        毕业时间: ['毕业时间', '毕业日期', '毕业年月', '结束时间', '结束年月'],
        导师: ['导师', '指导教师', '导师姓名'],
        实验室: ['实验室', '所属实验室'],
        研究方向: ['研究方向', '研究领域', '研究内容'],
      },
    },
    {
      name: 'experiences',
      records: Array.isArray(opts.experiences) ? opts.experiences : [],
      blockRe: /实习|工作|任职|职业|就业|公司|单位|履历|实践/,
      syn: {
        公司: ['公司名称', '公司全称', '公司', '单位名称', '工作单位', '实习单位', '雇主', '企业名称', 'company'],
        职位: ['职位名称', '职位', '岗位名称', '岗位', '职务', '担任职位', '实习岗位', 'position', 'title'],
        性质: ['工作性质', '实习性质', '用工性质', '性质', '类型'],
        开始时间: ['开始时间', '起始时间', '入职时间', '实习开始时间', '工作开始时间', '起止时间', 'start'],
        结束时间: ['结束时间', '离职时间', '实习结束时间', '工作结束时间', 'end'],
        描述: ['工作描述', '工作内容', '主要职责', '职责描述', '实习内容', '工作职责', '实习描述', '工作业绩', '业绩描述', '工作成果', '描述'],
        证明人姓名: ['证明人', '证明人姓名', '推荐人', '联系人姓名'],
        证明人身份: ['证明人身份', '证明人职务', '证明人职位', '推荐人身份'],
        证明人电话: ['证明人电话', '证明人联系电话', '推荐人电话'],
        所在部门: ['所在部门', '部门', '所属部门', '部门名称'],
        汇报对象: ['汇报对象', '汇报给', '直接上级', '直属上级', 'report to'],
      },
    },
    {
      // 腾讯网申把「项目名称」「在项目中担任的角色」标为必填
      name: 'projects',
      records: Array.isArray(opts.projects) ? opts.projects : [],
      blockRe: /项目|作品|科研/,
      syn: {
        项目名称: ['项目名称', '项目名', '课题名称', '作品名称', 'project'],
        项目角色: ['在项目中担任的角色', '项目角色', '担任角色', '项目职责', '承担角色', '角色'],
        开始时间: ['项目开始时间', '开始时间', '起始时间', '起止时间'],
        结束时间: ['项目结束时间', '结束时间'],
        项目描述: ['项目描述', '项目内容', '项目简介', '项目职责描述', '描述'],
        项目链接: ['相关项目或作品链接', '项目链接', '作品链接', '项目地址', '项目网址', 'github'],
      },
    },
    {
      // 腾讯网申把「奖项名称」「获奖时间」标为必填
      name: 'awards',
      records: Array.isArray(opts.awards) ? opts.awards : [],
      blockRe: /奖|荣誉|竞赛|表彰|称号/,
      syn: {
        获奖类型: ['获奖类型', '奖项类型', '奖励类型', '荣誉类型'],
        奖项名称: ['奖项名称', '奖励名称', '荣誉名称', '获奖名称', '奖项', '所获奖励'],
        获奖时间: ['获奖时间', '获奖日期', '获得时间', '授奖时间'],
        级别: ['奖项级别', '获奖级别', '级别', '等级'],
      },
    },
  ]
  // 键名 → 所属记录类型(仅用于取「可重复」集合;同名键在不同类型里各算各的,
  // 具体归属由控件所在的区块决定,存在 task.record 上)
  var RECORD_KEYS = {}
  for (var _ki = 0; _ki < RECORD_KINDS.length; _ki++) {
    for (var _kn in RECORD_KINDS[_ki].syn) RECORD_KEYS[_kn] = 1
  }
  var REPEATABLE = {}
  for (var _rk in EDU_KEYS) REPEATABLE[_rk] = 1
  for (var _rk2 in RECORD_KEYS) REPEATABLE[_rk2] = 1
  // 本身毫无指向性的词:只有在**显式标题**(如「实习经历」)确认的区块里才敢用,
  // 仅靠行内文字推断出的弱证据区块禁用它们。否则「个人描述」会被写成实习描述。
  var GENERIC_SYNS = { 描述: 1, 类型: 1, 级别: 1, 角色: 1 }
  // 「起止时间」这类**范围**标签:腾讯网申的教育经历就是一对起止控件(或一个区间选择器)。
  // 单独映射成「入学时间」会把两半都填成开始值,所以这里标记为 range,
  // 由任务组装阶段配对:同一个块内第 1 个填开始、第 2 个改填结束。
  var RANGE_SYNS = { 起止时间: 1, 起止年月: 1, 起止日期: 1, 在校时间: 1, 就读时间: 1, 开始日期: 1, 结束日期: 1 }
  var RANGE_END = { 入学时间: '毕业时间', 开始时间: '结束时间' }
  // 「性质」在网申下拉里的写法不统一(我们存「正职」,表单常写「全职」),按候选依次尝试
  var KIND_ALIAS = { 正职: ['正职', '全职', '正式'], 实习: ['实习', '实习生'], 兼职: ['兼职', '非全日制'] }
  var KEY_ORDER = Object.keys(SYN)

  function norm(s) { return String(s || '').replace(/[\s:*:::　]/g, '').toLowerCase() }
  function valueOf(key) {
    var v = p[key] !== undefined ? p[key] : custom[key]
    return v === undefined || v === null ? '' : String(v)
  }
  /** 按类型名取记录数组(experiences / projects / awards …) */
  function recordsOf(name) {
    for (var i = 0; i < RECORD_KINDS.length; i++) {
      if (RECORD_KINDS[i].name === name) return RECORD_KINDS[i].records
    }
    return []
  }

  /**
   * 取值:可重复键按「第 k 个同名字段 → 第 k 条记录」取,其余键仍走扁平字段。
   *
   * 扁平字段回退**只对第 1 行教育生效**:它原本是为了兼容「没有 educations 的旧简历」
   * 和「只有一段教育的表单」。但对第 2 行及以后回退就是错的 —— 扁平字段等于第 1 条记录,
   * 于是表单第 2 行会被复制成和第 1 行一模一样(实测:用户只有 1 条教育记录、
   * 表单有 2 行时,两行都填成示例大学硕士)。宁可留空,也不能提交重复学历。
   * 其余记录类型没有扁平等价物,没有记录就是空值。
   */
  function valueFor(task) {
    var k = task.occ || 0
    var rec = typeof task.record === 'string' ? task.record : ''
    // 教育走**独立分支**:它是唯一有扁平字段可回退的记录类型(兼容旧简历与单段教育表单)
    if (rec === 'educations' || (rec === '' && EDU_KEYS[task.key] === 1)) {
      var e = eduRecs[k]
      if (e && e[task.key] !== undefined && e[task.key] !== null && String(e[task.key]) !== '') return String(e[task.key])
      if (k === 0) return valueOf(task.key)
      return ''
    }
    if (rec !== '') {
      var r = recordsOf(rec)[k]
      return r && r[task.key] !== undefined && r[task.key] !== null ? String(r[task.key]) : ''
    }
    return valueOf(task.key)
  }
  // 三级匹配:手动关联(规范化 label 精确) > 自定义字段(双向包含,≥2字) > 内置同义词(最长命中)
  function matchKey(labelText, block) {
    if (!labelText) return null
    var n = norm(labelText)
    if (!n || n.length > 30) return null
    var mapped = mappings[n]
    if (mapped && (p[mapped] !== undefined || custom[mapped] !== undefined)) return { key: mapped, record: '' }
    var customKeys = Object.keys(custom)
    for (var c = 0; c < customKeys.length; c++) {
      var ck = norm(customKeys[c])
      if (ck.length >= 2 && (n.indexOf(ck) >= 0 || ck.indexOf(n) >= 0)) return { key: customKeys[c], record: '' }
    }
    var best = null
    var bestRec = ''
    var bestRange = false
    var bestLen = 0
    var k
    for (k in SYN) {
      var syns = SYN[k]
      for (var i = 0; i < syns.length; i++) {
        var sn = norm(syns[i])
        if (n.indexOf(sn) >= 0 && sn.length > bestLen) { best = k; bestLen = sn.length; bestRange = RANGE_SYNS[sn] === 1 }
      }
    }
    // 只有落在已识别区块里的控件才参与该类型的记录键匹配;同样按最长命中优先,
    // 所以「工作单位」会命中经历键「公司」,而不会被区块外的任何东西抢走。
    if (block !== null && block !== undefined) {
      var syn2 = block.kind.syn
      for (k in syn2) {
        var syns2 = syn2[k]
        for (var j = 0; j < syns2.length; j++) {
          var sn2 = norm(syns2[j])
          // 「描述」「类型」这类词本身没有指向性,只有在**证据充分**的区块里才用:
          // 显式标题(strict),或该块里已命中 ≥2 个同类型字段(corroborated)。
          // 只靠行内文字推断出来的孤立弱区块禁用它们,避免误填到「个人描述」上。
          if (block.strict !== true && block.corroborated !== true && GENERIC_SYNS[sn2] === 1) continue
          // 用 >= 而不是 >:全局表里「职位」「岗位」是**求职意向**的同义词(长度 2),与经历键同名。
          // 在已识别的区块内长度相同时必须让记录键胜出(实测:用 > 会让「职位」整列填不上)。
          if (n.indexOf(sn2) >= 0 && sn2.length >= bestLen) {
            best = k
            bestLen = sn2.length
            bestRec = block.kind.name
            bestRange = RANGE_SYNS[sn2] === 1
          }
        }
      }
    }
    return best === null ? null : { key: best, record: bestRec, range: bestRange }
  }

  function styleInject() {
    if (document.getElementById('campusfill-flash-style')) return
    var st = document.createElement('style')
    st.id = 'campusfill-flash-style'
    st.textContent = '.campusfill-flash{outline:2px solid #f59e0b!important;outline-offset:2px;box-shadow:0 0 0 4px rgba(245,158,11,.35)!important}'
    document.head.appendChild(st)
  }
  function flash(el) {
    el.classList.add('campusfill-flash')
    setTimeout(function () { el.classList.remove('campusfill-flash') }, 300)
  }
  function setNative(el, value) {
    var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    var d = Object.getOwnPropertyDescriptor(proto, 'value')
    if (d && d.set) d.set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  // 控件收集:跳过提交类/隐藏/禁用控件;深入同源 iframe
  // readonly input 不再跳过——自绘下拉(Element UI 等)的触发器常为只读输入框
  function collect(doc, out) {
    var ctrls = doc.querySelectorAll('input,select,textarea,[role=\"combobox\"]')
    Array.prototype.forEach.call(ctrls, function (el) {
      var tag = el.tagName
      if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA' && el.getAttribute('role') !== 'combobox') return
      var t = (el.getAttribute('type') || el.type || 'text').toLowerCase()
      if (['hidden', 'submit', 'button', 'reset', 'password', 'file', 'image', 'checkbox'].indexOf(t) >= 0) return
      if (el.disabled) return
      if (el.getClientRects().length === 0) return
      out.push(el)
    })
    var iframes = doc.querySelectorAll('iframe')
    Array.prototype.forEach.call(iframes, function (f) {
      try { if (f.contentDocument) collect(f.contentDocument, out) } catch (e) { /* 跨域 iframe 无法访问,忽略 */ }
    })
  }

  // 标签推断:返回「由具体到宽泛」的候选数组,交由调用方逐个尝试匹配。
  // 顺序是关键:placeholder 必须排在外层容器文本之后——真实网申页里 placeholder
  // 常是「请选择」这类提示语而非字段名,排前面会遮蔽真正的字段标签
  // (自绘下拉与单选组都栽在这里:label 取到「请选择(自绘下拉)」/「男」,整项就填不上)。
  function textOf(el) {
    if (!el) return ''
    var t = el.textContent || ''
    // <select> 的 textContent 包含**全部 option 文本**,会把「CET-4 CET-6 TOEFL…」这种
    // 选项串当成字段名(腾讯网申的英语等级就是这样,报告里出现了一长串考试名)。
    var sels = el.querySelectorAll ? el.querySelectorAll('select') : []
    for (var i = 0; i < sels.length && i < 8; i++) {
      var st = sels[i].textContent || ''
      if (st !== '') t = t.split(st).join(' ')
    }
    return t.trim().replace(/\s+/g, ' ')
  }
  /**
   * 收集容器内、位于 el 之前的文本(不含 el 自身与其后续兄弟)。
   *
   * 这是「最接近真实标签」的候选,专门解决自绘日期/下拉组件:
   *   <div class="row"><span>开始时间</span><div class="picker"><input><span>- 至今</span></div></div>
   * 整个 row 的文本会超过 30 字而被 matchKey 的长度上限挡掉,而控件**前面**那段
   * 「开始时间」通常就是标签本身。实测腾讯网申的起止时间整列填不上,根因就在这里。
   */
  /**
   * 取 wrap 内、el 之前**最近的一个**「不含控件」的兄弟节点文本。
   *
   * 关键是「最近的一个」而不是把前面所有兄弟的文字累加 —— 累加会让同一行的
   * 第 2 个控件把第 1 个控件的标签也带上:实测「学校名称 专业」里的「专业」
   * 因此被匹配成了「学校名称」→ 整块行号错位、后面两行填不上。
   */
  function nearestLabelBefore(el, wrap) {
    var node = el
    var guard = 0
    while (node && node !== wrap && guard < 8) {
      var sib = node.previousElementSibling
      while (sib) {
        if (sib.querySelector('input,select,textarea') === null) {
          var t = textOf(sib)
          if (t !== '') return t
          break
        }
        sib = sib.previousElementSibling
      }
      node = node.parentElement
      guard++
    }
    return ''
  }

  /** 纯噪音文本:占位提示、分隔符、计数器 —— 不能当字段名,否则填写报告会被它们淹没 */
  var NOISE_RE = /^(请输入|请选择|请填写|请选择或输入|输入|选择|无|暂无|暂无数据|无数据|没有数据|-|—|–|~|至|至今|- 至今|— 至今|0\/\d+|\d+|\d+\/\d+|\*|必填|选填|\?\?|rc_select_\d+|rc-input-\d+|ant-select-\w+|undefined|null|男|女|汉族|必填项未填写|因未有全职工作经历.*)$/

  function labelCandidates(el) {
    var cands = []
    var doc = el.ownerDocument || document
    if (el.id) {
      // CSS.escape 兜底:脚本注入到不可控的第三方页面,id 可能含引号/方括号等非法选择器字符
      var esc = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(el.id) : el.id
      var lb = null
      try { lb = doc.querySelector('label[for="' + esc + '"]') } catch { lb = null }
      if (lb) cands.push(textOf(lb))
    }
    // aria-label 通常是真实字段名,可信度高
    var aria = el.getAttribute('aria-label') || ''
    if (aria) cands.push(aria)
    var lb2 = el.closest ? el.closest('label') : null
    if (lb2) cands.push(textOf(lb2))
    var cell = el.closest ? el.closest('td,th,dd,dt') : null
    if (cell && cell.previousElementSibling) cands.push(textOf(cell.previousElementSibling))
    // 外层容器文本:自绘下拉/单选组的真实字段名通常落在这一层
    // 控件之前的文本:最贴近真实标签,优先于整个容器的文本
    var before = el.parentElement
    for (var b = 0; b < 6 && before; b++) {
      var bt = nearestLabelBefore(el, before)
      if (bt) cands.push(bt)
      before = before.parentElement
    }
    var wrap = el.parentElement
    for (var d = 0; d < 4 && wrap; d++) {
      var t = textOf(wrap)
      if (t && t.length <= 30) cands.push(t)
      wrap = wrap.parentElement
    }
    var ph = el.getAttribute('placeholder') || ''
    if (ph) cands.push(ph)
    var nameId = el.getAttribute('name') || el.getAttribute('id') || ''
    if (nameId) cands.push(nameId)
    return cands
  }

  /** 依次尝试候选标签,取首个能匹配到简历字段的;全失败则回退到首个候选文案(缺项报告用) */
  function pickLabel(el) {
    var cands = labelCandidates(el)
    var block = blockKind(el)
    var shown = ''
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i]
      if (!c) continue
      // 报告里展示的字段名不能是「请输入」「- 至今」这类噪音,否则报告没法用
      if (!shown && NOISE_RE.test(c.trim()) !== true) shown = c
      var hit = matchKey(c, block)
      if (!hit && c.length > 30) {
        // 长候选再试一次「截断后的头部」:真实字段名带帮助说明时会被拼成长串
        // (腾讯网申的「手机号码* 如您是中国大陆籍,建议您使用+86…」),
        // 而 matchKey 对 >30 字的候选直接放弃 —— 不截断就整项填不上。
        hit = matchKey(c.slice(0, 24), block)
      }
      if (hit) {
        return {
          key: hit.key,
          label: hit.key,
          record: hit.record,
          range: hit.range,
          row: block !== null && block !== undefined ? block.row : null,
          blockName: block !== null && block !== undefined ? block.kind.name : '',
        }
      }
    }
    return { key: null, label: shown, record: '', blockName: block !== null && block !== undefined ? block.kind.name : '' }
  }

  /**
   * 判断控件落在什么样的重复区块里,返回 '' | 'weak' | 'strict'。
   *
   * 为什么必须做区块识别:经历键里有「开始时间」「结束时间」「描述」这类通用词,
   * 一旦无条件放进同义词表,教育经历的起止时间、任何一处「描述」都会被误填。
   *
   * 判定刻意收紧:先找最近的「行容器」(含 ≥2 个控件的最近祖先),再看它的标题 ——
   * 只看紧邻的前几个兄弟节点、行容器首个非控件子元素、父容器首个非控件子元素,
   * 不向更高层泛化查找:否则整个表单容器里只要出现过「实习经历」四个字,
   * 所有控件都会被判成经历区块。
   * 返回 '' 时控件退回旧行为(只匹配扁平字段),所以这个函数不可能造成误填。
   */
  /**
   * 组装区块判定结果,并顺带算出 corroborated:
   * 该块的文字里出现了 ≥2 个同类型字段的同义词 → 证据充分。
   * 用途:弱证据区块本来禁用「描述」这类泛词,但若同块内已能看到
   * 「项目名称」「在项目中担任的角色」两个项目字段,那这个块几乎必然是项目块,
   * 「描述」在里面就是安全的(腾讯网申的项目描述就靠这条才填得上)。
   */
  function blockResult(kind, row, strict) {
    var text = (row.textContent || '').slice(0, 600)
    var hits = 0
    for (var key in kind.syn) {
      var syns = kind.syn[key]
      for (var i = 0; i < syns.length; i++) {
        if (syns[i] !== '' && text.indexOf(syns[i]) >= 0) {
          hits++
          break
        }
      }
      if (hits >= 2) break
    }
    return { kind: kind, strict: strict === true, corroborated: hits >= 2, row: row }
  }

  function blockKind(el) {
    var row = el.parentElement
    var guard = 0
    /** 沿途见过的最大「≤24 个控件」容器 —— 走过头时的退路 */
    var near = null
    while (row && row !== document.body && guard < 8) {
      if (row.querySelectorAll('input,select,textarea').length <= 24) near = row
      if (row.querySelectorAll('input,select,textarea,[role="combobox"]').length >= 2) break
      row = row.parentElement
      guard++
    }
    if (!row || row === document.body) return null
    // 行容器不能太大:整个表单容器也「含 ≥2 个控件」,那说明它不是一条记录。
    // 但**不能就此放弃** —— Element-UI 每个字段各包一层(el-form-item / el-input),
    // 没有「一条记录」这种容器,向上走会直接跨到整段表单(>24 控件)。
    // 原先这里直接 return null,导致腾讯自绘的「起止时间」永远判不出区块
    // (报告里连报 6 条「区块=未识别」),连带整块字段匹配不上。
    // 现在退回沿途最大的「≤24 控件」容器做弱证据判定。
    if (row.querySelectorAll('input,select,textarea').length > 24) {
      if (near === null || near === row) return null
      var nearText = near.textContent || ''
      var nearParent = near.parentElement
      if (
        nearParent &&
        nearParent !== document.body &&
        nearParent.querySelectorAll('input,select,textarea').length <= 24
      ) {
        nearText += ' ' + (nearParent.textContent || '')
      }
      var nearScope = nearText.slice(0, 200)
      for (var nw = 0; nw < RECORD_KINDS.length; nw++) {
        if (RECORD_KINDS[nw].blockRe.test(nearScope)) return blockResult(RECORD_KINDS[nw], near, false)
      }
      return null
    }
    var heads = []
    var sib = row.previousElementSibling
    for (var s = 0; s < 3 && sib; s++) {
      // 只把「自身不含控件」的兄弟当标题。否则上一条记录的卡片会被误当标题:
      // 例如项目经历的最后一张卡片正好是获奖区块第一张卡片的前一个兄弟,
      // 它的文字里含「项目」,会把获奖区块整块判成项目区块。
      if (sib.querySelector('input,select,textarea') === null) heads.push(textOf(sib))
      sib = sib.previousElementSibling
    }
    var first = row.firstElementChild
    if (first && !/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(first.tagName)) heads.push(textOf(first))
    if (row.parentElement && row.parentElement !== document.body) {
      var h = row.parentElement.firstElementChild
      if (h && h !== row && h.querySelector('input,select,textarea') === null) heads.push(textOf(h))
    }
    for (var i = 0; i < heads.length; i++) {
      var t = (heads[i] || '').slice(0, 40)
      if (t === '') continue
      for (var q = 0; q < RECORD_KINDS.length; q++) {
        if (RECORD_KINDS[q].blockRe.test(t)) return blockResult(RECORD_KINDS[q], row, true)
      }
    }
    // 没有标题的重复区块:退一步看行容器自身的文字(公司名称/职位/实习时间…),证据较弱。
    // 行容器太窄时(如「起止时间」独立成一行)再看一层父容器 —— 区块类型通常由
    // 同一块内的其他行体现(学校名称/专业 → 教育)。父容器过大(整个表单)则不采信。
    var weakTexts = [row.textContent || '']
    var parentRow = row.parentElement
    if (parentRow && parentRow !== document.body && parentRow.querySelectorAll('input,select,textarea').length <= 24) {
      weakTexts.push(parentRow.textContent || '')
    }
    for (var wt = 0; wt < weakTexts.length; wt++) {
      var own = weakTexts[wt].slice(0, 200)
      if (own === '') continue
      for (var w = 0; w < RECORD_KINDS.length; w++) {
        if (RECORD_KINDS[w].blockRe.test(own)) return blockResult(RECORD_KINDS[w], row, false)
      }
    }
    return null
  }

  function radioLabelText(radio) {
    var v = radio.value || ''
    var lb = radio.closest ? radio.closest('label') : null
    var wrapText = lb ? textOf(lb) : (radio.parentElement ? textOf(radio.parentElement) : '')
    return (v + ' ' + wrapText).trim()
  }

  function selectMatch(select, value) {
    var opts = select.options
    var nv = norm(value)
    for (var i = 0; i < opts.length; i++) {
      if (norm(opts[i].text) === nv || norm(opts[i].value) === nv) return opts[i]
    }
    for (var j = 0; j < opts.length; j++) {
      var t = norm(opts[j].text)
      if (t && (t.indexOf(nv) >= 0 || nv.indexOf(t) >= 0)) return opts[j]
    }
    return null
  }

  // ── 自绘下拉(需点击展开选项面板的组件)交互填写 ──
  // 覆盖常见组件库:Element UI、Ant Design/rc-select、Semi、Naive、Arco、Vuetify,
  // 以及 role=listbox/option 的 ARIA 标准实现与 [class*=option] 通用兜底
  var OPTION_SELECTORS = [
    '[role="listbox"] [role="option"]',
    '.el-select-dropdown__item',
    '.ant-select-item-option',
    '.ant-select-dropdown-menu-item',
    '.rc-select-item-option',
    '.semi-select-option',
    '.n-base-select-option',
    '.arco-select-option',
    '.v-select-list .v-list-item',
    '[class*="dropdown"] [class*="item"]',
    '[class*="select"] [class*="option"]',
    '[class*="option"]',
    'ul.dropdown-menu li',
    'ul[role="menu"] li'
  ]

  /** 是否疑似自绘下拉:只读输入框、ARIA combobox,或带 listbox 展开指示 */
  function isCustomSelect(el) {
    if (el.tagName === 'SELECT') return false
    var role = el.getAttribute('role')
    if (role === 'combobox' || role === 'listbox') return true
    if (el.tagName === 'INPUT') {
      if (el.readOnly) return true
      var haspopup = el.getAttribute('aria-haspopup')
      if (haspopup === 'listbox' || haspopup === 'true') return true
      // 占位符是「请选择」的文本框几乎一定是自绘下拉的触发器。
      // 实测(安永 13:39 报告):学校/专业/学历这类控件 readonly=false,
      // 被当成普通文本框直接赋 value —— 但它们是 React 受控组件,赋值被忽略,
      // 表现为「匹配到了却填不上」。它们唯一的共同特征就是这个占位符。
      var ph = el.getAttribute('placeholder') || ''
      if (ph.indexOf('请选择') === 0 || ph.indexOf('选择') === 0) return true
    }
    return false
  }

  function visibleInViewport(el) {
    if (el.getClientRects().length === 0) return false
    var parent = el.parentElement
    for (var i = 0; i < 8 && parent; i++) {
      if (parent.getClientRects && parent.getClientRects().length === 0) return false
      parent = parent.parentElement
    }
    return true
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }

  /** 轮询等待选项面板渲染(自绘下拉多为点击后懒渲染) */
  async function findOpenOptions(aboutMs) {
    var deadline = Date.now() + aboutMs
    while (Date.now() < deadline) {
      await wait(200)
      for (var i = 0; i < OPTION_SELECTORS.length; i++) {
        var nodes = document.querySelectorAll(OPTION_SELECTORS[i])
        var visible = []
        Array.prototype.forEach.call(nodes, function (n) {
          var text = (n.textContent || '').trim()
          if (text !== '' && visibleInViewport(n)) visible.push(n)
        })
        if (visible.length >= 1) return visible
      }
    }
    return []
  }

  async function closePopovers() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wait(120)
  }

  /**
   * 交互式填写自绘下拉:点开触发器 → 等选项面板 → 文本匹配点选。
   * 可编辑 combobox 先输入过滤(可搜索选择器)再点选;匹配不到时收起面板。
   */
  async function fillCustomSelect(trigger, value) {
    var editable = trigger.tagName === 'INPUT' && !trigger.readOnly
    if (editable) {
      setNative(trigger, value)
      await wait(250)
    }
    trigger.click()
    var options = await findOpenOptions(1600)
    if (options.length === 0) {
      await closePopovers()
      return editable
    }
    var nv = norm(value)
    var hit = null
    for (var i = 0; i < options.length && hit === null; i++) {
      var t = norm(options[i].textContent)
      if (t === nv) hit = options[i]
    }
    if (hit === null) {
      for (var j = 0; j < options.length && hit === null; j++) {
        var tj = norm(options[j].textContent)
        if (tj !== '' && (tj.indexOf(nv) >= 0 || nv.indexOf(tj) >= 0)) hit = options[j]
      }
    }
    if (hit !== null) {
      hit.click()
      await wait(150)
      // 回读验证:组件应把所选项写入触发器;未生效不算成功
      var shown = norm(trigger.value)
      return shown !== '' && (shown.indexOf(nv) >= 0 || nv.indexOf(shown) >= 0)
    }
    await closePopovers()
    // 可编辑输入框:仅当输入的文本真实保留时算半成功
    return editable && norm(trigger.value) === nv
  }

  // ── 「添加」按钮:多段经历必须先点出来,否则第 2、3 条根本没有输入框 ──
  // 产品铁律是「只填不提交」,所以这里用**白名单 + 黑名单**双重约束:
  // 只有文字命中「添加/新增/增加」、且**不**命中「提交/保存/确认/删除…」的短文本可点元素才是候选。
  var ADD_RE = /(添加|新增|增加|再加|追加|add)/i
  var DANGER_RE = /(提交|保存|确认|删除|移除|清空|上一步|下一步|预览|导出|完成|投递|申请)/
  /** 「添加」按钮的诊断记录:每个类型的记录数 / 识别到的行数 / 需新增数 / 找到的按钮 */
  var addDiag = []

  /** 元素的 aria-label / title:图标按钮的「文字」通常在这两处 */
  function ariaOf(el) {
    return el.getAttribute('aria-label') || el.getAttribute('title') || ''
  }

  /** 一个元素的可读标识(诊断用):文字 / aria-label / title / class */
  function idOf(el) {
    var t = textOf(el)
    if (t === '') t = el.getAttribute('aria-label') || el.getAttribute('title') || ''
    var cls = typeof el.className === 'string' ? el.className : ''
    return (el.tagName + ' 「' + t.slice(0, 16) + '」' + (cls ? ' .' + cls.slice(0, 30) : '')).slice(0, 70)
  }

  /** 宽松枚举「看起来像添加」的可点元素,附带被拒原因 —— 找不到按钮时靠它定位真相 */
  function addCandidates() {
    var out = []
    var nodes = document.querySelectorAll('button,a,[role="button"],input[type="button"],span,div,li,i')
    for (var i = 0; i < nodes.length && out.length < 12; i++) {
      var el = nodes[i]
      var t = textOf(el)
      var aria = ariaOf(el)
      var cls = typeof el.className === 'string' ? el.className : ''
      var loose = ADD_RE.test(t) === true || ADD_RE.test(aria) === true || /(^|[\s_-])(add|plus|tianjia)([\s_-]|$)/i.test(cls)
      if (loose !== true) continue
      if (t.length > 16) continue
      out.push(idOf(el))
    }
    return out
  }

  /** 该类型的「添加」按钮:从按钮自身往上找最近的、文字命中该类型关键词的容器 */
  function findAddButton(kind) {
    var nodes = document.querySelectorAll('button,a,[role="button"],input[type="button"],span,div,li,i')
    // 扫描上限必须足够大:真实网申页面有几千个元素,而「添加实习经历」这类按钮
    // 往往在很靠后的位置 —— 原先卡在 400,导致按钮明明存在却被报成「未找到」
    // (报告第五节里宽松枚举能列出它、严格查找却找不到,差别就在这里)。
    for (var i = 0; i < nodes.length && i < 6000; i++) {
      var el = nodes[i]
      var t = textOf(el)
      // 图标按钮没有文字:一并看 aria-label / title;Element-UI 之类还用 class 表达(icon-plus / add-btn)
      var label = t
      if (label === '') label = el.getAttribute('aria-label') || el.getAttribute('title') || ''
      var cls = typeof el.className === 'string' ? el.className : ''
      var looksAdd = ADD_RE.test(label) === true || ADD_RE.test(ariaOf(el)) === true || /(^|[\s_-])(add|plus|tianjia)([\s_-]|$)/i.test(cls)
      if (looksAdd !== true) continue
      if (label === '') label = 'add'
      if (label.length > 12) continue
      if (DANGER_RE.test(label) === true) continue
      if (typeof el.getClientRects !== 'function' || el.getClientRects().length === 0) continue
      // 只在「长得像可点」的元素上动手:原生按钮/链接、role=button、或光标是手型
      var clickable = el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button'
      if (!clickable) {
        try {
          clickable = window.getComputedStyle(el).cursor === 'pointer'
        } catch (e) {
          clickable = false
        }
      }
      if (!clickable) continue
      // 归属哪个区块:先看按钮自己的文字(如「添加实习经历」直接点明类型),
      // 再向上找最近的、文字命中该类型关键词的容器
      if (kind.blockRe.test(label) === true) return el
      var node = el
      for (var d = 0; d < 5 && node && node !== document.body; d++) {
        var box = (node.textContent || '').slice(0, 400)
        if (kind.blockRe.test(box)) return el
        node = node.parentElement
      }
    }
    return null
  }

  /**
   * 该类型当前已渲染出多少行。
   *
   * 不用「数容器」:同一条记录的字段可能落在**互为兄弟**的多个容器里(日期单独一行、
   * 学校/专业在外层),按容器数会严重高估 —— 实测 4 条教育被数成 7 行,need 变负数,
   * 于是压根不进入找按钮的分支(用户报的「没能自动添加」就是这个)。
   *
   * 改用「每个键各被匹配到几次」的**最大值**:同一行的每个键只出现一次,
   * 这个口径天然免疫容器的层次与兄弟关系 ✓
   * 范围控件(「起止时间」一对输入映射到同一个键)会双倍计数,故整体排除。
   */
  function countRows(kind) {
    var perKey = {}
    var probe = []
    collect(document, probe)
    for (var i = 0; i < probe.length; i++) {
      var pick = pickLabel(probe[i])
      if (pick.key === null || pick.record !== kind.name) continue
      if (pick.range === true) continue
      perKey[pick.key] = (perKey[pick.key] || 0) + 1
    }
    var max = 0
    for (var k in perKey) {
      if (perKey[k] > max) max = perKey[k]
    }
    return max
  }

  /** 按记录条数把「添加」点够;返回每个类型新增的行数(供报告/诊断) */
  async function ensureExtraRows() {
    var added = {}
    for (var ki = 0; ki < RECORD_KINDS.length; ki++) {
      var kind = RECORD_KINDS[ki]
      if (kind.records.length === 0) continue
      var rows = countRows(kind)
      var need = kind.records.length - rows
      var btn = need > 0 ? findAddButton(kind) : null
      // 每个类型都把「记录数 / 识别到的行数 / 需新增数 / 找到的按钮」落盘:
      // 用户报「没能自动添加」时,靠这一条就能分出是行数判多了、还是按钮没找到
      addDiag.push({
        kind: kind.name,
        records: kind.records.length,
        rows: rows,
        need: need,
        btn: btn === null ? '(未找到)' : idOf(btn),
      })
      if (need <= 0 || btn === null) continue
      var clicked = 0
      // 上限保护:按钮没生效时不能无限点;真实表单一次加一行,连点即可
      while (clicked < need && clicked < 8) {
        // 用冒泡的真实 click 事件而不是 el.click():Element 上没有 click 方法,
        // 且委托式框架(React 等)在根节点监听,冒泡事件才能被它们收到
        await reveal(btn)
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
        clicked++
        await wait(280)
      }
      if (clicked > 0) added[kind.name] = clicked
    }
    // 宽松枚举页面上所有「看起来像添加」的元素:即使一个都没归属成功,也能看到真实按钮长什么样
    var cands = addCandidates()
    if (cands.length > 0) addDiag.push({ kind: '(宽松匹配到的候选按钮)', records: 0, rows: 0, need: 0, btn: cands.join(' ‖ ') })
    return added
  }

  /**
   * 日期值的候选写法。
   *
   * 我们统一存 yyyy-MM-dd,但网申的日期下拉五花八门:2025年9月 / 2025/09 / 2025-09 /
   * 2025.09,甚至**拆成「年」「月」两个下拉**。只拿原值去比对必然一个都对不上
   * (用户报的「所有需要下拉填写时间的部分都无法自动填写」就是这个)。
   * 这里按「最具体 → 最粗」排序逐个尝试:
   *   完整日期 → 年-月 → 年月中文 → 年 → 月
   * 拆分下拉各自的候选天然落在列表的不同位置,所以同一套候选能同时覆盖
   * 「整日期下拉」「年下拉」「月下拉」三种实现。
   */
  function valueCandidates(value) {
    var m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(value)
    if (m === null) {
      // 下拉选项常写「北京」而简历里是「北京市」(安永籍贯下拉确实打开了却选不中,
      // 见 13:39 报告第六节:可见候选 10 个)。先原样,再去掉行政区后缀试一次。
      var plain = [value]
      var bare = value.replace(/(省|市|区|县|自治区|特别行政区|自治州|地区|盟)$/, '')
      if (bare !== value && bare !== '') plain.push(bare)
      // 值里带了分隔符时(籍贯常存成「某省；某市；某区」),
      // 下拉只认单个省份 → 逐段也作为候选试一次
      var parts = value.split(/[；;、,，\/|]/)
      if (parts.length > 1) {
        for (var pi = 0; pi < parts.length; pi++) {
          var seg = parts[pi].trim()
          if (seg !== '' && plain.indexOf(seg) < 0) plain.push(seg)
        }
      }
      return plain
    }
    var y = m[1]
    var moNum = String(parseInt(m[2], 10))
    var moPad = moNum.length === 1 ? '0' + moNum : moNum
    return [
      value,
      y + '-' + moPad,
      y + '/' + moPad,
      y + '.' + moPad,
      y + '年' + moNum + '月',
      y + '年' + moPad + '月',
      y + '年',
      y,
      moNum + '月',
      moPad + '月',
      moNum,
      moPad,
    ]
  }

  /** 一个字段值的全部候选写法(性质走别名表,日期走日期候选,其余原样) */
  function candidatesFor(key, value) {
    if (key === '性质') return KIND_ALIAS[value] || [value]
    return valueCandidates(value)
  }

  /**
   * 只可能是「文本输入」的字段:这些键绝不能落在下拉上。
   *
   * 实测腾讯的手机号前面有个「国家/地区」下拉(Element-UI,选项含「中国 +86」),
   * 它的标签推断会命中「手机」→ 抢走手机号的键位 → 手机号被写进国家下拉(无效),
   * 而真正的手机输入框反而空着。这里让它让位给真正的文本框。
   */
  var TEXT_ONLY_KEYS = { 姓名: 1, 手机: 1, 邮箱: 1, 固定电话: 1, 身份证号: 1, 微信号: 1, QQ号: 1, 紧急联系人电话: 1, 紧急联系人: 1 }

  /** 手机号前那种「国家/地区」下拉:靠选项里的 +86 / 中国大陆 识别,它应归「国家地区」 */
  function isCountrySelect(el) {
    if (el.tagName !== 'SELECT') return false
    var opts = el.options
    if (!opts) return false
    for (var i = 0; i < opts.length && i < 40; i++) {
      var t = opts[i].text || opts[i].value || ''
      if (t.indexOf('+86') >= 0 || t.indexOf('中国大陆') >= 0) return true
    }
    return false
  }

  styleInject()
  // 必须先点够「添加」再收集控件:新行的输入框在此之前并不存在
  var addedRows = await ensureExtraRows()
  var all = []
  collect(document, all)

  var used = {}
  var occOf = {}
  /** 「起止时间」配对用:记录上一个范围控件所在的块与落到的键 */
  var lastRange = null
  /** 未匹配控件(供填写报告给出结构诊断) */
  /**
   * 祖先链:逐层打出 标签名 / 首个 class / 控件数 / 文本前缀。
   *
   * 「区块=未识别」是腾讯与安永的「起止时间」共同卡点。区块判定要从控件向上
   * 找一个「含 ≥2 个控件、但不超过 24 个」的容器,再从中找教育/实习这类关键词。
   * 光看单个控件的结构看不出问题,必须看到每一层的控件数与文字才知道是
   * 「关键词在更外层」还是「被 24 的守卫挡掉了」。
   */
  function ancestorChain(el, maxDepth) {
    var out = []
    var node = el.parentElement
    for (var d = 0; d < maxDepth && node && node !== document.body; d++) {
      var cls = typeof node.className === 'string' ? node.className : ''
      var cnt = node.querySelectorAll('input,select,textarea').length
      var txt = String(node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20)
      out.push('L' + (d + 1) + ' <' + node.tagName.toLowerCase() + (cls ? ' .' + cls.split(/\s+/)[0] : '') + '> 控件' + cnt + ' 「' + txt + '」')
      node = node.parentElement
    }
    return out.join(' | ')
  }
  
  var unmatched = []
  /** 自绘下拉填写失败的诊断:0 个候选 = 没点开;>0 = 点开了但没匹配上 */
  var customFail = []
  /** 匹配到但没填上的控件结构:这一类此前完全没有诊断,是当前最大的盲区 */
  var fillFail = []
  var tasks = []
  var pageFields = {}
  var radioGroups = {}
  /** 页面字段登记:命中简历字段的用字段名登记,否则用推断出的原文(供手动关联) */
  function noteField(key, rawLabel) {
    var name = key || rawLabel
    if (name && !pageFields[name]) pageFields[name] = { label: name, filled: false }
  }
  all.forEach(function (el) {
    // 单选组延后统一处理:单个 radio 最近的 label 是选项名(男/女)而非字段名,
    // 提前登记会把选项名当成缺项字段塞进报告
    if (el.tagName === 'INPUT' && (el.type || 'text').toLowerCase() === 'radio') {
      var gname = el.name || el.id || el.value
      radioGroups[gname] = radioGroups[gname] || []
      radioGroups[gname].push(el)
      return
    }
    var pick = pickLabel(el)
    // 手机号前的「国家/地区」下拉强制归到「国家地区」,不让它抢走手机号的键位
    if (isCountrySelect(el)) {
      pick = { key: '国家地区', label: '国家地区', record: '', range: false, row: null, blockName: '' }
    }
    // 手机/邮箱这类只可能是文本输入的字段:落在下拉上就让位,留给真正的文本框
    if (pick.key !== null && TEXT_ONLY_KEYS[pick.key] === 1 && (el.tagName === 'SELECT' || isCustomSelect(el))) {
      noteField(pick.key, pick.label)
      return
    }
    if (!pick.key) {
      // 未匹配控件登记结构:填写报告据此直接给出「这个控件长什么样」,
      // 不用再靠猜(实测腾讯的「起止时间」一直匹配不上,只能靠这个看清真相)
      if (unmatched.length < 20) {
        // ctx:向上三层里最外层的非空文本 —— 用来判断这个控件到底属于哪个区块
        // (「起止时间」一直报「区块=未识别」,只有看到它的外层文字才知道该怎么放宽规则)
        var ctx = ''
        var walker = el.parentElement
        for (var cd = 0; cd < 6 && walker && walker !== document.body; cd++) {
          var ct = textOf(walker)
          if (ct !== '') ctx = ct.slice(0, 50)
          walker = walker.parentElement
        }
        unmatched.push({
          label: String(pick.label || '').slice(0, 40),
          tag: el.tagName,
          type: String(el.getAttribute('type') || el.type || '').toLowerCase(),
          ro: el.readOnly === true,
          ph: (el.getAttribute('placeholder') || '').slice(0, 20),
          blk: pick.blockName || '',
          // 祖先链只给前 8 条:报告要能读,不需要每个控件都铺开
          chain: unmatched.length < 8 ? ancestorChain(el, 7) : '',
          ctx: ctx,
        })
      }
      noteField(pick.key, pick.label)
      return
    }
    var key = pick.key
    var record = pick.record
    // 范围控件配对(「起止时间」):同一个块内第 1 个填开始、第 2 个改填结束。
    // 不做配对的话两半都会填成开始值(腾讯网申教育经历的一对起止控件就是这种情况)。
    if (pick.range === true) {
      if (lastRange !== null && lastRange.row !== null && lastRange.row === pick.row && lastRange.key === key) {
        key = RANGE_END[key] || key
        record = lastRange.record
      }
      lastRange = { row: pick.row, key: key, record: record }
    }
    // 可重复键(教育/经历/项目/获奖的字段)允许同名多次出现:第 k 次出现取第 k 条记录。
    // 占位按「记录类型 + 键名」计数 —— 同名键(如项目的「开始时间」与经历的「开始时间」)
    // 在不同区块里各算各的,否则两边的行号会互相串。其余键仍是「首次出现者胜」。
    var occKey = (record === '' ? '-' : record) + '|' + key
    if (REPEATABLE[key] !== 1 && used[occKey]) return
    used[occKey] = true
    var occ = occOf[occKey] || 0
    occOf[occKey] = occ + 1
    tasks.push({ key: key, occ: occ, record: record, el: el, label: key, customSelect: isCustomSelect(el) })
  })
  Object.keys(radioGroups).forEach(function (g) {
    if (radioGroups[g].length < 2) return
    var first = radioGroups[g][0]
    var pick = pickLabel(first)
    noteField(pick.key, pick.label)
    if (!pick.key || used[pick.key]) return
    used[pick.key] = true
    tasks.push({ key: pick.key, radios: radioGroups[g], label: pick.key })
  })
  tasks.sort(function (a, b) { return KEY_ORDER.indexOf(a.key) - KEY_ORDER.indexOf(b.key) })

  var total = tasks.length
  var filled = 0
  var missingData = []
  function report(i, label) {
    if (window.campusFillBridge) window.campusFillBridge.report(JSON.stringify({ index: i, total: total, label: label }))
  }
  /**
   * 让镜头跟着填写走:把即将填写的控件滚进视野。
   *
   * 只在控件**不在视野内**时才滚动 —— 同屏内的连续字段不会来回抖动;
   * 跨屏时是平滑滚动,用户看到的就是「镜头跟着进度往下走」。
   */
  async function reveal(el) {
    try {
      var rect = el.getBoundingClientRect()
      var vh = window.innerHeight || 800
      if (rect.top >= 0 && rect.bottom <= vh) return false
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      // 只等一下让滚动**起步**即可:平滑动画会在后续填写过程中继续跑完。
      // 这里曾等 240ms,字段一多就累计十几秒 —— 实测把小窗口下的填写拖到超时
      // (导出回归因此报 no-report)。镜头跟随不该以牺牲速度为代价。
      await wait(90)
      return true
    } catch (e) {
      return false
    }
  }

  for (var i = 0; i < tasks.length; i++) {
    var task = tasks[i]
    // 镜头跟随:让用户看得见"正在填这里"
    await reveal(task.el)
    var ok = false
    var value = valueFor(task)
    if (value !== '') {
      if (task.radios) {
        var nv = norm(String(value))
        var hit = task.radios.filter(function (r) { return norm(radioLabelText(r)).indexOf(nv) >= 0 })[0]
        if (hit) { if (!hit.checked) hit.click(); flash(hit); ok = true }
      } else if (task.el.tagName === 'SELECT') {
        // 日期下拉(2025年9月 / 年+月拆开)、「性质」的写法(正职 vs 全职)都不统一:
        // 统一走候选列表逐个尝试
        var selCands = candidatesFor(task.key, String(value))
        var opt = null
        for (var kc = 0; kc < selCands.length && opt === null; kc++) opt = selectMatch(task.el, selCands[kc])
        if (opt) {
          task.el.value = opt.value
          setNative(task.el, opt.value)
          // 回读验证:严格受控组件可能拒绝赋值,未生效不计成功
          if (task.el.value === opt.value) { flash(task.el); ok = true }
        }
      } else if (task.customSelect === true) {
        // 自绘下拉(含自绘日期选择器):同样按候选逐个尝试,任一成功即算填上
        var cusCands = candidatesFor(task.key, String(value))
        var customOk = false
        for (var cc = 0; cc < cusCands.length && customOk !== true; cc++) {
          customOk = await fillCustomSelect(task.el, cusCands[cc])
        }
        if (customOk !== true) {
          // 记下失败现场:点击后页面上有多少个「像选项」的元素。
          // 0 → 下拉根本没打开(可能是 readonly 触发器/需要真实鼠标事件);
          // >0 → 打开了但没匹配到值(选项文案与我们的候选对不上)。
          var optNodes = document.querySelectorAll(
            '[role="option"],[class*="option"],[class*="Option"],[class*="dropdown"] li,li[class*="item"]',
          )
          // 候选原文:用来判断"值对不上"到底是文案差异(改候选)还是压根没渲染(改点击方式)
          var optSample = []
          for (var oi2 = 0; oi2 < optNodes.length && optSample.length < 8; oi2++) {
            var ot = String(textOf(optNodes[oi2]) || '').slice(0, 12)
            if (ot !== '') optSample.push(ot)
          }
          if (customFail.length < 12) {
            customFail.push({
              key: task.key,
              probe: String(textOf(task.el) || '').slice(0, 20),
              ro: task.el.readOnly === true,
              opts: optNodes.length,
              sample: optSample.join(' / '),
              val: String(value).slice(0, 20),
            })
          }
        }
        if (customOk === true) {
          flash(task.el)
          ok = true
        } else {
          // 自绘下拉这条路失败时**必须回退成直接赋值**。
          // isCustomSelect 把「只读输入框」一律当成下拉触发器,但腾讯网申的起止时间
          // 就是只读输入框 + 日期选择器:它没有可选项列表,填充必然失败且不报错,
          // 结果是整列日期静默为空(用户报的「所有起止时间都没填上」)。
          setNative(task.el, String(value))
          if (task.el.value === String(value)) {
            flash(task.el)
            ok = true
          } else if (task.customSelect !== true) {
            // 直接赋值被页面忽略(React 受控组件不认 .value)—— 再按自绘下拉的方式试一次。
            // 安永的「学校 / 专业 / 学历」正是这种情形:简历里明明有值、键也匹配上了,
            // 但控件是自绘组件,赋值被丢弃,于是表现为「匹配到了却填不上」。
            // 这一步只在**已经失败之后**发生,不会减少任何原本成功的路径。
            var retryCands = candidatesFor(task.key, String(value))
            for (var rc = 0; rc < retryCands.length && ok !== true; rc++) {
              if ((await fillCustomSelect(task.el, retryCands[rc])) === true) {
                flash(task.el)
                ok = true
              }
            }
          }
        }
      } else {
        setNative(task.el, String(value))
        // 回读验证:框架回滚/组件拦截会让值弹回,读不到即视为未填上
        if (task.el.value === String(value)) { flash(task.el); ok = true }
      }
    }
    if (ok) {
      filled++
      if (task.label && pageFields[task.label]) pageFields[task.label].filled = true
    } else {
      missingData.push(task.key)
      // 匹配到了却没能填上:记下控件结构。安永的 学校/专业/学历(简历里明明有值)
      // 就卡在这一类 —— 它既不在「未匹配」里,也不在「自绘下拉失败」里,
      // 没有这条记录就完全无从定位(回读验证已在上面判定过,这里只补现场信息)。
      if (fillFail.length < 24) {
        fillFail.push({
          key: task.key,
          tag: task.el.tagName,
          type: String(task.el.getAttribute('type') || '').toLowerCase(),
          ph: String(task.el.getAttribute('placeholder') || '').slice(0, 16),
          ro: task.el.readOnly === true,
          cs: task.customSelect === true,
          val: String(value).slice(0, 20),
        })
      }
    }
    report(i + 1, task.key)
    await new Promise(function (r) { setTimeout(r, 200) })
  }
  // 缺项报告:页面上带标签、可见、但没被填上的信息项(供 UI 提醒与手动关联)
  var missingPageFields = Object.keys(pageFields)
    .map(function (k) { return pageFields[k] })
    .filter(function (f) { return !f.filled })
    .map(function (f) { return f.label })
  var out = { ok: true, filled: filled, total: total, missingData: missingData, missingPageFields: missingPageFields.slice(0, 20), unmatched: unmatched, addedRows: addedRows, addDiag: addDiag, customFail: customFail, fillFail: fillFail }
  // 调试:把每个任务的「键 / 记录类型 / 行号 / 控件 id / 取到的值」一起返回。
  // 排查「匹配上了但没填上」时,这一个字段就能定位是取值错还是写入失败。
  if (opts.debug === true) {
    out.tasks = tasks.map(function (t) {
      return { key: t.key, record: t.record || '', occ: t.occ || 0, id: t.el && t.el.id ? t.el.id : '', value: valueFor(t) }
    })
  }
  return out
}

function injectedGenericReset() {
  // 通用清空:仅清空「当前已填且标签可匹配」的控件,最小侵入
  var all = document.querySelectorAll('input,select,textarea')
  Array.prototype.forEach.call(all, function (el) {
    var t = (el.type || 'text').toLowerCase()
    if (['hidden', 'submit', 'button', 'reset', 'password', 'file', 'image', 'checkbox'].indexOf(t) >= 0) return
    if (el.disabled || el.readOnly) return
    var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    var d = Object.getOwnPropertyDescriptor(proto, 'value')
    if (d && d.set) d.set.call(el, '')
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
  return { ok: true }
}

// ── 打包器:把上述函数序列化为可在目标页面执行的 IIFE 源码 ──

function iife(fn, args) {
  // 双层序列化:内联参数必须是字符串字面量,注入函数内部以 JSON.parse 解开。
  // 单层会把对象直接内联成 {…},JSON.parse(对象) 抛 "[object Object]" is not valid JSON,
  // 曾导致 demo 与真实站点全部填写静默失败。
  var parts = args.map(a => JSON.stringify(JSON.stringify(a)))
  return `(${fn.toString()})(${parts.join(', ')})`
}

module.exports = {
  demoFillScript: profile => iife(injectedDemoFill, [profile]),
  demoResetScript: () => iife(injectedDemoReset, []),
  genericFillScript: (profile, options) => iife(injectedGenericFill, [profile, options ?? {}]),
  genericResetScript: () => iife(injectedGenericReset, []),
}
