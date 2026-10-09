// 简历数据模型:内置高频字段(依大公司网申模板扩充,2026-10-03)+ 自定义字段。
// 13 个 demo 字段与模拟网申表单一一对应;其余为真实网申常见信息项,全部可空。

export interface ResumeProfile {
  // ── 基本信息(网申必填区)──
  姓名: string
  性别: '男' | '女' | ''
  出生日期: string // yyyy-MM-dd,允许为空
  民族: string
  籍贯: string
  出生地: string
  政治面貌: '群众' | '共青团员' | '中共党员' | ''
  婚姻状况: string
  身份证号: string
  户口类别: string
  /** 户口所在地:网申里常与「户籍」「户口地址」同义,与「籍贯」是两回事,故独立成字段 */
  户口所在地: string
  身高: string
  体重: string
  视力: string
  // ── 联系方式 ──
  手机: string
  邮箱: string
  固定电话: string
  /** 微信号 / QQ号:腾讯等网申表单的必填项(据 2026-10-03 腾讯填写报告补充) */
  微信号: string
  QQ号: string
  /** 国家/地区:网申下拉,通常选「中国大陆」 */
  国家地区: string
  /** 个人主页/作品集链接:腾讯网申单独问的一项(据 2026-10-03 填写报告补充) */
  个人主页: string
  /** 外企表单(安永等)把姓名拆成拼音与英文名分别问(据 2026-10-04 安永填写报告补充) */
  英文名: string
  /** 姓（拼音）:键名跟着表单原文走,便于自动匹配 */
  姓拼音: string
  名拼音: string
  /** 姓名拼音:部分表单只要一整串 */
  姓名拼音: string
  现居住城市: string
  /** 当前所处地 / 目前就读地:腾讯网申分开问的两项(据 2026-10-03 填写报告补充) */
  当前所处地: string
  目前就读地: string
  通信地址: string
  邮政编码: string
  紧急联系人: string
  紧急联系人电话: string
  // ── 求职意向 ──
  求职意向: string // 自由文本:真实简历的意向岗位不限枚举
  期望工作地: string
  期望月薪: string
  到岗时间: string
  是否接受调剂: string
  /**
   * 网申附加项(据腾讯填写报告补充)。
   * 注意:「内推码」是**按公司变化**的,投不同公司前记得改;「远程面试」取值用 是/否,
   * 以便直接命中网申表单里的 是/否 单选或下拉。
   */
  内推码: string
  远程面试: string
  // ── 教育背景 ──
  学校: string
  院系: string
  专业: string
  学历: '本科' | '硕士' | '博士' | ''
  学制: string
  入学时间: string
  毕业时间: string // yyyy-MM-dd,允许为空
  统招与否: string
  GPA: string
  专业排名: string
  辅修专业: string
  // ── 外语与计算机能力 ──
  英语等级: string
  /** 历年平均成绩(百分制):安永等表单单独问的一项 */
  平均成绩: string
  /** 招聘信息来源:快手校招等表单会问「你从哪里得知本次招聘」 */
  招聘信息来源: string
  /** 安永等表单单独问的语言/证书/职务/协议项(据 2026-10-04 安永填写报告补充) */
  所在行业: string
  最高奖学金级别: string
  最高学生职务: string
  日语能力: string
  韩语能力: string
  英语其他考试: string
  /** 是否有仍在生效的保密/竞业限制协议:是 / 否 */
  是否有竞业限制协议: string
  注会通过门数: string
  ACCA通过门数: string
  英语分数: string
  其他外语: string
  计算机等级: string
  其他证书: string
  /** 开发语言:腾讯网申必填(如 Java / Python) */
  开发语言: string
  // ── 学生身份与家庭 ──
  生源所在地: string
  学生证号: string
  就业推荐表编号: string
  在校职务: string
  是否独生子女: string
  父亲姓名: string
  父亲电话: string
  父亲单位: string
  父亲职务: string
  母亲姓名: string
  母亲电话: string
  母亲单位: string
  母亲职务: string
  // ── 自我介绍 ──
  自我评价: string
  个人特长: string
  兴趣爱好: string
}

/** 一段教育背景(可重复:本科、硕士各一条) */
export interface EducationRecord {
  /** 稳定 id:仅用于 React key 与增删定位,不参与填写 */
  id: string
  学校: string
  院系: string
  专业: string
  学历: '本科' | '硕士' | '博士' | ''
  学制: string
  入学时间: string
  毕业时间: string
  统招与否: string
  GPA: string
  专业排名: string
  辅修专业: string
  /** 导师 / 实验室 / 研究方向:腾讯等网申的「教育经历」里是按段填的(据填写报告补充) */
  导师: string
  实验室: string
  研究方向: string
}

/** 经历性质:网申表单里通常是「实习/全职/兼职」单选或下拉,与用户口径一致 */
export type ExperienceKind = '兼职' | '实习' | '正职' | ''

/** 一段实习/工作经历(可重复) */
export interface ExperienceRecord {
  id: string
  公司: string
  职位: string
  /** 性质:兼职 / 实习 / 正职 */
  性质: ExperienceKind
  开始时间: string
  结束时间: string
  描述: string
  /** 证明人:腾讯网申在每条经历里问「证明人身份*」等(据填写报告补充) */
  证明人姓名: string
  证明人身份: string
  证明人电话: string
  /** 所在部门 / 汇报对象:安永等表单在每条经历里问(据 2026-10-04 安永填写报告补充) */
  所在部门: string
  汇报对象: string
}

/** 一段项目经历(可重复)。腾讯网申把「项目名称」「在项目中担任的角色」标为必填。 */
export interface ProjectRecord {
  id: string
  项目名称: string
  项目角色: string
  开始时间: string
  结束时间: string
  项目描述: string
  /** 相关项目或作品链接:腾讯网申单独问的一项 */
  项目链接: string
}

/** 一项获奖/荣誉(可重复)。腾讯网申把「奖项名称」「获奖时间」标为必填。 */
export interface AwardRecord {
  id: string
  /** 获奖类型:奖学金 / 竞赛 / 荣誉 …(腾讯网申必填) */
  获奖类型: string
  奖项名称: string
  获奖时间: string
  /** 级别:国家级 / 省级 / 校级 / 院级 … */
  级别: string
}

export interface Resume {
  id: string
  /** 简历显示名,如「我的简历-金融科技」 */
  name: string
  updatedAt: string
  profile: ResumeProfile
  /** 自定义字段:网申模板未覆盖或开放性问题的自由键值对,填写时按字段名匹配 */
  custom: Record<string, string>
  /**
   * 教育背景(可多条)。
   * **约定:第 1 条是最高/最近学历**,保存时同步进 profile 的扁平教育字段
   * (学校/院系/专业/学历/学制/入学时间/毕业时间/统招与否/GPA/专业排名)。
   * 扁平字段是填写引擎读取的唯一位置(同义词表按那些键匹配),
   * 所以这样既支持多段教育,又不必改动引擎的单值模型。
   */
  educations: EducationRecord[]
  /** 实习/工作经历(可多条) */
  experiences: ExperienceRecord[]
  /** 项目经历(可多条) */
  projects: ProjectRecord[]
  /** 获奖/荣誉(可多条) */
  awards: AwardRecord[]
}

let recordSeq = 0
/** 记录 id:只要在本进程内唯一即可(React key 与增删定位用) */
function nextRecordId(prefix: string): string {
  recordSeq += 1
  return `${prefix}-${Date.now().toString(36)}-${recordSeq}`
}

export function emptyEducation(): EducationRecord {
  return {
    id: nextRecordId('edu'),
    学校: '',
    院系: '',
    专业: '',
    学历: '',
    学制: '',
    入学时间: '',
    毕业时间: '',
    统招与否: '',
    GPA: '',
    专业排名: '',
    辅修专业: '',
    导师: '',
    实验室: '',
    研究方向: '',
  }
}

export function emptyProject(): ProjectRecord {
  return {
    id: nextRecordId('prj'),
    项目名称: '',
    项目角色: '',
    开始时间: '',
    结束时间: '',
    项目描述: '',
    项目链接: '',
  }
}

export function emptyAward(): AwardRecord {
  return {
    id: nextRecordId('awd'),
    获奖类型: '',
    奖项名称: '',
    获奖时间: '',
    级别: '',
  }
}

export function emptyExperience(): ExperienceRecord {
  return {
    id: nextRecordId('exp'),
    公司: '',
    职位: '',
    性质: '',
    开始时间: '',
    结束时间: '',
    描述: '',
    证明人姓名: '',
    证明人身份: '',
    证明人电话: '',
    所在部门: '',
    汇报对象: '',
  }
}

/** 由 profile 的扁平教育字段派生一条教育记录(用于兼容没有 educations 的旧数据) */
export function educationFromProfile(profile: ResumeProfile, id: string): EducationRecord {
  return {
    id,
    学校: profile.学校 ?? '',
    院系: profile.院系 ?? '',
    专业: profile.专业 ?? '',
    学历: profile.学历 ?? '',
    学制: profile.学制 ?? '',
    入学时间: profile.入学时间 ?? '',
    毕业时间: profile.毕业时间 ?? '',
    统招与否: profile.统招与否 ?? '',
    GPA: profile.GPA ?? '',
    专业排名: profile.专业排名 ?? '',
    辅修专业: profile.辅修专业 ?? '',
    // 导师/实验室/研究方向是记录独有的,扁平字段里没有对应物,派生时留空
    导师: '',
    实验室: '',
    研究方向: '',
  }
}

/** 把一条教育记录写回 profile 的扁平教育字段(第 1 条记录 = 最高/最近学历) */
export function applyEducationToProfile(profile: ResumeProfile, edu: EducationRecord | undefined): ResumeProfile {
  const e = edu ?? emptyEducation()
  return {
    ...profile,
    学校: e.学校,
    院系: e.院系,
    专业: e.专业,
    学历: e.学历,
    学制: e.学制,
    入学时间: e.入学时间,
    毕业时间: e.毕业时间,
    统招与否: e.统招与否,
    GPA: e.GPA,
    专业排名: e.专业排名,
    辅修专业: e.辅修专业,
  }
}

/** 各可重复记录的字段清单(用于逐条补齐缺失键) */
const EDUCATION_KEYS = ['学校', '院系', '专业', '辅修专业', '学历', '学制', '入学时间', '毕业时间', '统招与否', 'GPA', '专业排名', '导师', '实验室', '研究方向'] as const
const EXPERIENCE_KEYS = ['公司', '职位', '性质', '开始时间', '结束时间', '描述', '证明人姓名', '证明人身份', '证明人电话', '所在部门', '汇报对象'] as const
const PROJECT_KEYS = ['项目名称', '项目角色', '开始时间', '结束时间', '项目描述', '项目链接'] as const
const AWARD_KEYS = ['获奖类型', '奖项名称', '获奖时间', '级别'] as const

/**
 * 逐条补齐记录字段:缺失键补空串、缺 id 补一个。
 * 必须补齐的原因:受控 <input>/<select> 的 value 拿到 undefined 会从非受控切到受控并触发
 * React 警告,而新增字段(导师/实验室/研究方向/项目/奖项)在老数据里必然缺失。
 */
function normalizeRecord<T extends { id: string }>(record: T, keys: readonly string[], prefix: string): T {
  const out: Record<string, string> = {}
  for (const key of keys) {
    const value = (record as unknown as Record<string, unknown>)[key]
    out[key] = typeof value === 'string' ? value : ''
  }
  return { ...out, id: typeof record.id === 'string' && record.id !== '' ? record.id : nextRecordId(prefix) } as unknown as T
}

/** 兼容旧数据:补齐/校正可重复字段,保证 educations 至少一条、其余为数组 */
export function normalizeResume(resume: Resume): Resume {
  const source =
    Array.isArray(resume.educations) && resume.educations.length > 0
      ? resume.educations
      : [educationFromProfile(resume.profile, `${resume.id}-edu-0`)]
  return {
    ...resume,
    educations: source.map(e => normalizeRecord(e, EDUCATION_KEYS, 'edu')),
    experiences: (Array.isArray(resume.experiences) ? resume.experiences : []).map(e => normalizeRecord(e, EXPERIENCE_KEYS, 'exp')),
    projects: (Array.isArray(resume.projects) ? resume.projects : []).map(p => normalizeRecord(p, PROJECT_KEYS, 'prj')),
    awards: (Array.isArray(resume.awards) ? resume.awards : []).map(a => normalizeRecord(a, AWARD_KEYS, 'awd')),
  }
}

export const EMPTY_PROFILE: ResumeProfile = {
  姓名: '',
  性别: '',
  出生日期: '',
  民族: '',
  籍贯: '',
  出生地: '',
  政治面貌: '',
  婚姻状况: '',
  身份证号: '',
  户口类别: '',
  户口所在地: '',
  身高: '',
  体重: '',
  视力: '',
  手机: '',
  邮箱: '',
  固定电话: '',
  微信号: '',
  QQ号: '',
  国家地区: '',
  个人主页: '',
  英文名: '',
  姓拼音: '',
  名拼音: '',
  姓名拼音: '',
  现居住城市: '',
  当前所处地: '',
  目前就读地: '',
  通信地址: '',
  邮政编码: '',
  紧急联系人: '',
  紧急联系人电话: '',
  求职意向: '',
  期望工作地: '',
  期望月薪: '',
  到岗时间: '',
  是否接受调剂: '',
  内推码: '',
  远程面试: '',
  学校: '',
  院系: '',
  专业: '',
  学历: '',
  学制: '',
  入学时间: '',
  毕业时间: '',
  统招与否: '',
  GPA: '',
  专业排名: '',
  辅修专业: '',
  英语等级: '',
  平均成绩: '',
  招聘信息来源: '',
  所在行业: '',
  最高奖学金级别: '',
  最高学生职务: '',
  日语能力: '',
  韩语能力: '',
  英语其他考试: '',
  是否有竞业限制协议: '',
  注会通过门数: '',
  ACCA通过门数: '',
  英语分数: '',
  其他外语: '',
  计算机等级: '',
  其他证书: '',
  开发语言: '',
  生源所在地: '',
  学生证号: '',
  就业推荐表编号: '',
  在校职务: '',
  是否独生子女: '',
  父亲姓名: '',
  父亲电话: '',
  父亲单位: '',
  父亲职务: '',
  母亲姓名: '',
  母亲电话: '',
  母亲单位: '',
  母亲职务: '',
  自我评价: '',
  个人特长: '',
  兴趣爱好: '',
}

/**
 * 浏览器开发模式(`npm run dev`)下的演示简历。
 *
 * 这里放**用户本人的真实简历结构**(与打包版 userData 里的「张明-金融科技」同源),
 * 取代了早期的虚构人物「张三」——虚构数据会与真实简历混淆,已明确要求清除。
 * 联系方式做了脱敏:开发模式只用于验证字段结构与填写行为,不应携带可用的真实联系方式。
 */
export const mockResumes: readonly Resume[] = [
  {
    // 完全虚构的占位简历:不对应任何真实个人。用来在开发模式下展示字段结构、
    // 验证填写行为(真实简历由用户自己在应用里录入,不进代码库)。
    id: 'resume-sample',
    name: '示例简历-后端开发',
    updatedAt: '2026-10-03T16:37:00+08:00',
    profile: {
      ...EMPTY_PROFILE,
      姓名: '张明',
      籍贯: '示例省示例市',
      手机: '138****0000',
      邮箱: 'zhang****@example.com',
      现居住城市: '示例市',
      求职意向: '后端开发、平台工程',
      期望工作地: '示例市/示例省',
      学校: '示例大学',
      专业: '信息管理与信息系统（示例方向）',
      学历: '硕士',
      入学时间: '2025-09-01',
      毕业时间: '2027-06-30',
      英语等级: 'CET-6',
      英语分数: '500',
      在校职务: '示例大学学生科技社团负责人',
      兴趣爱好: '长跑',
      自我评价:
        '这是一份用于开发与演示的示例简历:所有内容均为虚构占位,不对应任何真实个人。它的作用是展示字段结构(基本信息 / 联系方式 / 教育背景 / 实习经历 / 项目经历 / 获奖 / 自定义字段),便于在开发模式下验证自动填写的匹配行为。',
    },
    custom: {
      个人网站: 'https://example.com/',
    },
    // 第 1 条 = 最高/最近学历,与上面 profile 里的扁平教育字段保持一致
    educations: [
      {
        id: 'edu-demo-0',
        学校: '示例大学',
        院系: '示例学院',
        专业: '信息管理与信息系统（示例方向）',
        学历: '硕士',
        学制: '2年',
        入学时间: '2025-09-01',
        毕业时间: '2027-06-30',
        统招与否: '非统招',
        GPA: '',
        专业排名: '',
        辅修专业: '',
        导师: '',
        实验室: '',
        研究方向: '',
      },
      {
        id: 'edu-demo-1',
        学校: '示例师范大学',
        院系: '',
        专业: '计算机科学与技术（示例方向）',
        学历: '本科',
        学制: '4年',
        入学时间: '2021-09-01',
        毕业时间: '2025-06-30',
        统招与否: '统招',
        GPA: '',
        专业排名: '',
        辅修专业: '',
        导师: '',
        实验室: '',
        研究方向: '',
      },
    ],
    experiences: [
      {
        id: 'exp-demo-0',
        公司: '示例科技有限公司',
        职位: '后端开发实习生',
        性质: '实习',
        开始时间: '2026-07-01',
        结束时间: '2026-09-30',
        描述: '参与示例服务的接口开发与联调,补充单元测试。',
        证明人姓名: '',
        证明人身份: '',
        证明人电话: '',
        所在部门: '',
        汇报对象: '',
      },
    ],
    projects: [
      {
        id: 'prj-demo-0',
        项目名称: '示例项目A',
        项目角色: '独立设计与开发',
        开始时间: '2026-01-01',
        结束时间: '2026-05-31',
        项目描述: '一个用于演示项目经历字段的示例项目。',
        项目链接: 'https://example.com/project-a',
      },
    ],
    awards: [
      {
        id: 'awd-demo-0',
        获奖类型: '奖学金',
        奖项名称: '示例大学一等奖学金',
        获奖时间: '2024-10-01',
        级别: '校级',
      },
    ],
  },
]
