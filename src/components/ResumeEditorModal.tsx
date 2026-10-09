import { useState } from 'react'
import type { ChangeEvent } from 'react'
import type { AwardRecord, EducationRecord, ExperienceRecord, ProjectRecord, Resume, ResumeProfile } from '../mock/resumes'
import {
  EMPTY_PROFILE,
  applyEducationToProfile,
  emptyAward,
  emptyEducation,
  emptyExperience,
  emptyProject,
  normalizeResume,
} from '../mock/resumes'

/**
 * 「户口所在地」的候选值:34 个省级行政区。
 * 控件用 <input list> + <datalist> 实现「可下拉选、也可直接输入」——
 * 网申表单对这项的粒度并不统一(有的只要省级,有的要写到区县),所以只把省级做成快捷候选,
 * 更细的地址由用户自己补全。datalist 默认 display:none,不会在栅格里占位。
 */
const PROVINCES: readonly string[] = [
  '北京市', '天津市', '河北省', '山西省', '内蒙古自治区',
  '辽宁省', '吉林省', '黑龙江省', '上海市', '江苏省',
  '浙江省', '安徽省', '福建省', '江西省', '山东省',
  '河南省', '湖北省', '湖南省', '广东省', '广西壮族自治区',
  '海南省', '重庆市', '四川省', '贵州省', '云南省',
  '西藏自治区', '陕西省', '甘肃省', '青海省', '宁夏回族自治区',
  '新疆维吾尔自治区', '台湾省', '香港特别行政区', '澳门特别行政区',
]

/** 「国家/地区」候选值(combo 控件:可下拉,也可直接输入) */
const COUNTRY_REGIONS: readonly string[] = ['中国大陆', '中国香港', '中国澳门', '中国台湾', '海外']

/** 编辑表单分组定义(单值字段;可重复的教育背景/实习经历见下方独立分组) */
const EDIT_GROUPS_TOP: ReadonlyArray<{
  title: string
  fields: ReadonlyArray<{
    key: keyof ResumeProfile
    label: string
    control: 'text' | 'radio' | 'date' | 'select' | 'textarea' | 'combo'
    options?: readonly string[]
    placeholder?: string
  }>
}> = [
  {
    title: '基本信息',
    fields: [
      { key: '姓名', label: '姓名', control: 'text' },
      { key: '性别', label: '性别', control: 'radio', options: ['男', '女'] },
      { key: '出生日期', label: '出生日期', control: 'date' },
      { key: '民族', label: '民族', control: 'text' },
      { key: '籍贯', label: '籍贯', control: 'text' },
      { key: '出生地', label: '出生地', control: 'text' },
      { key: '政治面貌', label: '政治面貌', control: 'select', options: ['', '群众', '共青团员', '中共党员'] },
      { key: '婚姻状况', label: '婚姻状况', control: 'text' },
      { key: '身份证号', label: '身份证号', control: 'text' },
      { key: '户口类别', label: '户口类别', control: 'text' },
      { key: '户口所在地', label: '户口所在地', control: 'combo', options: PROVINCES },
      { key: '身高', label: '身高(cm)', control: 'text' },
      { key: '体重', label: '体重(kg)', control: 'text' },
      { key: '视力', label: '视力', control: 'text' },
    ],
  },
  {
    title: '联系方式',
    fields: [
      { key: '手机', label: '手机', control: 'text' },
      { key: '邮箱', label: '邮箱', control: 'text' },
      { key: '固定电话', label: '固定电话', control: 'text' },
      { key: '微信号', label: '微信号', control: 'text' },
      { key: 'QQ号', label: 'QQ号', control: 'text' },
      { key: '国家地区', label: '国家/地区', control: 'combo', options: COUNTRY_REGIONS },
      { key: '个人主页', label: '个人主页/作品集链接', control: 'text' },
      // 外企表单(安永等)把姓名拆开问
      { key: '英文名', label: '英文名', control: 'text' },
      { key: '姓拼音', label: '姓（拼音）', control: 'text', placeholder: '如 DING' },
      { key: '名拼音', label: '名（拼音）', control: 'text', placeholder: '如 BOWEN' },
      { key: '姓名拼音', label: '姓名拼音', control: 'text', placeholder: '如 DING BOWEN' },
      { key: '现居住城市', label: '现居住城市', control: 'text' },
      { key: '当前所处地', label: '当前所处地', control: 'text' },
      { key: '目前就读地', label: '目前就读地', control: 'text' },
      { key: '通信地址', label: '通信地址', control: 'text' },
      { key: '邮政编码', label: '邮政编码', control: 'text' },
      { key: '紧急联系人', label: '紧急联系人', control: 'text' },
      { key: '紧急联系人电话', label: '紧急联系人电话', control: 'text' },
    ],
  },
  {
    title: '求职意向',
    fields: [
      { key: '求职意向', label: '求职意向', control: 'text' },
      { key: '期望工作地', label: '期望工作地', control: 'text' },
      { key: '期望月薪', label: '期望月薪', control: 'text' },
      { key: '到岗时间', label: '到岗时间', control: 'text' },
      { key: '是否接受调剂', label: '是否接受调剂', control: 'text' },
    ],
  },
  {
    // 据腾讯填写报告补充:内推码与「远程面试」是网申表单里会单独问的两项
    title: '网申附加',
    fields: [
      {
        key: '招聘信息来源',
        label: '招聘信息来源',
        control: 'combo',
        options: ['校园宣讲会', '公司官网', '招聘网站/APP', '学校就业网', '朋友/学长推荐', '社交媒体', '招聘会', '其他'],
      },
      { key: '所在行业', label: '所在行业', control: 'text' },
      { key: '最高奖学金级别', label: '最高奖学金级别', control: 'text', placeholder: '如 校级 / 省级 / 国家级' },
      { key: '最高学生职务', label: '最高学生职务', control: 'text' },
      { key: '日语能力', label: '日语能力', control: 'text', placeholder: '如 N1 / 无' },
      { key: '韩语能力', label: '韩语能力', control: 'text', placeholder: '如 TOPIK 4级 / 无' },
      { key: '英语其他考试', label: '英语能力(其他考试)', control: 'text', placeholder: '如 雅思 6.5 / 托福 100' },
      { key: '是否有竞业限制协议', label: '是否有生效的保密/竞业限制协议', control: 'select', options: ['', '否', '是'] },
      { key: '注会通过门数', label: '中国注册会计师通过门数', control: 'text', placeholder: '如 0 / 3' },
      { key: 'ACCA通过门数', label: 'ACCA 通过门数', control: 'text', placeholder: '如 0 / 5' },
      { key: '内推码', label: '内推码(按公司变化)', control: 'text' },
      { key: '远程面试', label: '是否接受远程面试', control: 'select', options: ['', '是', '否'] },
    ],
  },
]

/** 「求职意向」之后、「能力证书」之前会插入教育背景 / 实习经历 / 项目经历 / 获奖 四个可重复分组 */
const EDIT_GROUPS_BOTTOM: typeof EDIT_GROUPS_TOP = [
  {
    title: '能力证书',
    fields: [
      { key: '英语等级', label: '英语等级(CET-4/6 等)', control: 'text' },
      { key: '平均成绩', label: '历年平均成绩(百分制)', control: 'text', placeholder: '如 85.6' },
      { key: '英语分数', label: '英语分数', control: 'text' },
      { key: '其他外语', label: '其他外语', control: 'text' },
      { key: '计算机等级', label: '计算机等级', control: 'text' },
      { key: '其他证书', label: '其他证书', control: 'text' },
      { key: '开发语言', label: '开发语言(如 Java/Python)', control: 'text' },
    ],
  },
  {
    title: '学生身份与家庭',
    fields: [
      { key: '生源所在地', label: '生源所在地', control: 'text' },
      { key: '学生证号', label: '学生证号/学号', control: 'text' },
      { key: '就业推荐表编号', label: '就业推荐表编号', control: 'text' },
      { key: '在校职务', label: '在校职务', control: 'text' },
      { key: '是否独生子女', label: '是否独生子女', control: 'text' },
      { key: '父亲姓名', label: '父亲姓名', control: 'text' },
      { key: '父亲电话', label: '父亲电话', control: 'text' },
      { key: '父亲单位', label: '父亲单位', control: 'text' },
      { key: '父亲职务', label: '父亲职务', control: 'text' },
      { key: '母亲姓名', label: '母亲姓名', control: 'text' },
      { key: '母亲电话', label: '母亲电话', control: 'text' },
      { key: '母亲单位', label: '母亲单位', control: 'text' },
      { key: '母亲职务', label: '母亲职务', control: 'text' },
    ],
  },
  {
    title: '自我介绍',
    fields: [
      { key: '自我评价', label: '自我评价', control: 'textarea' },
      { key: '个人特长', label: '个人特长', control: 'textarea' },
      { key: '兴趣爱好', label: '兴趣爱好', control: 'textarea' },
    ],
  },
]

/**
 * 记录分组里一个字段的描述。
 * key 故意用宽松的 string(而不是各记录类型的 keyof):四类记录共用同一个渲染器,
 * 用联合类型反而处处要断言;真正的类型安全由各记录类型本身保证。
 */
interface RecordField {
  key: string
  label: string
  control: 'text' | 'date' | 'select' | 'textarea'
  options?: readonly string[]
  placeholder?: string
}

/** 教育记录的字段描述(与 profile 的扁平教育字段同名,保存时整组同步过去) */
const EDUCATION_FIELDS: readonly RecordField[] = [
  { key: '学校', label: '学校', control: 'text' },
  { key: '院系', label: '院系', control: 'text' },
  { key: '专业', label: '专业', control: 'text' },
  { key: '学历', label: '学历', control: 'select', options: ['', '本科', '硕士', '博士'] },
  { key: '学制', label: '学制', control: 'text' },
  { key: '入学时间', label: '入学时间', control: 'date' },
  { key: '毕业时间', label: '毕业时间', control: 'date' },
  { key: '统招与否', label: '统招与否', control: 'text' },
  { key: 'GPA', label: 'GPA', control: 'text' },
  { key: '专业排名', label: '专业排名', control: 'text' },
  { key: '辅修专业', label: '辅修专业', control: 'text', placeholder: '没有就留空' },
  // 据腾讯填写报告补充:网申的「教育经历」里这三项是按段填的
  { key: '导师', label: '导师', control: 'text' },
  { key: '实验室', label: '实验室', control: 'text' },
  { key: '研究方向', label: '研究方向', control: 'text' },
]

/**
 * 实习/工作经历字段。
 * 用户口径是「起止时间」,这里拆成两个日期输入:网申表单里几乎都是分开的
 * 「开始时间/结束时间」两个空位,拆开才能各自填进去;单框文本无法拆。
 * 「性质」按用户要求做下拉:兼职 / 实习 / 正职。
 */
const EXPERIENCE_FIELDS: readonly RecordField[] = [
  { key: '公司', label: '公司', control: 'text' },
  { key: '职位', label: '职位', control: 'text' },
  { key: '性质', label: '性质', control: 'select', options: ['', '兼职', '实习', '正职'] },
  { key: '开始时间', label: '开始时间', control: 'date' },
  { key: '结束时间', label: '结束时间', control: 'date' },
  { key: '描述', label: '描述', control: 'textarea', placeholder: '职责、做的事、可量化的成果' },
  // 腾讯网申在每条经历里还问证明人(据 2026-10-03 填写报告补充)
  { key: '证明人姓名', label: '证明人姓名', control: 'text' },
  { key: '证明人身份', label: '证明人身份', control: 'text', placeholder: '如:直属上级 / 部门经理' },
  { key: '证明人电话', label: '证明人电话', control: 'text' },
  // 安永等表单在每条经历里还问部门与汇报对象
  { key: '所在部门', label: '所在部门', control: 'text' },
  { key: '汇报对象', label: '汇报对象', control: 'text', placeholder: '如 部门经理' },
]

/** 项目经历:腾讯网申把「项目名称」「在项目中担任的角色」标为必填(*) */
const PROJECT_FIELDS: readonly RecordField[] = [
  { key: '项目名称', label: '项目名称', control: 'text' },
  { key: '项目角色', label: '担任角色', control: 'text' },
  { key: '开始时间', label: '开始时间', control: 'date' },
  { key: '结束时间', label: '结束时间', control: 'date' },
  { key: '项目描述', label: '项目描述', control: 'textarea', placeholder: '项目做了什么、你负责哪部分、结果' },
  { key: '项目链接', label: '相关项目/作品链接', control: 'text', placeholder: 'https://…(如有)' },
]

/** 获奖/荣誉:腾讯网申把「获奖类型」「奖项名称」「获奖时间」标为必填(*) */
const AWARD_FIELDS: readonly RecordField[] = [
  { key: '获奖类型', label: '获奖类型', control: 'select', options: ['', '奖学金', '竞赛获奖', '荣誉称号', '其他'] },
  { key: '奖项名称', label: '奖项名称', control: 'text' },
  { key: '获奖时间', label: '获奖时间', control: 'date' },
  { key: '级别', label: '级别', control: 'select', options: ['', '国家级', '省级', '市级', '校级', '院级', '其他'] },
]

interface ResumeEditorModalProps {
  /** 编辑已有简历时传入;新增时传 null */
  initial: Resume | null
  onSave: (resume: Resume) => void
  onClose: () => void
}

/** 简历新增/编辑弹窗:分组字段 + 自定义字段(网申模板未覆盖的信息项/开放性问题) */
export function ResumeEditorModal({ initial, onSave, onClose }: ResumeEditorModalProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [profile, setProfile] = useState<ResumeProfile>(() => ({ ...EMPTY_PROFILE, ...initial?.profile }))
  const [custom, setCustom] = useState<Record<string, string>>(() => ({ ...initial?.custom }))
  // 可重复记录:旧简历没有这些字段,normalizeResume 会补齐(教育至少一条,用扁平字段派生)
  const [educations, setEducations] = useState<EducationRecord[]>(() =>
    initial === null ? [emptyEducation()] : normalizeResume(initial).educations,
  )
  const [experiences, setExperiences] = useState<ExperienceRecord[]>(() =>
    initial === null ? [] : normalizeResume(initial).experiences,
  )
  const [projects, setProjects] = useState<ProjectRecord[]>(() => (initial === null ? [] : normalizeResume(initial).projects))
  const [awards, setAwards] = useState<AwardRecord[]>(() => (initial === null ? [] : normalizeResume(initial).awards))
  const [error, setError] = useState('')

  const setField = (key: keyof ResumeProfile, value: string): void => {
    setProfile(prev => ({ ...prev, [key]: value }) as ResumeProfile)
  }

  // 通用记录渲染器按 string key 取值,所以四个 setter 都用宽松签名(内部断言回具体类型)
  const setEducationField = (id: string, key: string, value: string): void => {
    setEducations(prev => prev.map(e => (e.id === id ? ({ ...e, [key]: value } as EducationRecord) : e)))
  }

  const setExperienceField = (id: string, key: string, value: string): void => {
    setExperiences(prev => prev.map(e => (e.id === id ? ({ ...e, [key]: value } as ExperienceRecord) : e)))
  }

  const setProjectField = (id: string, key: string, value: string): void => {
    setProjects(prev => prev.map(p => (p.id === id ? ({ ...p, [key]: value } as ProjectRecord) : p)))
  }

  const setAwardField = (id: string, key: string, value: string): void => {
    setAwards(prev => prev.map(a => (a.id === id ? ({ ...a, [key]: value } as AwardRecord) : a)))
  }

  const handleSave = (): void => {
    if (name.trim() === '') {
      setError('请填写简历名称(如「我的简历-金融科技」)')
      return
    }
    if (profile.姓名.trim() === '' || profile.手机.trim() === '') {
      setError('姓名与手机为必填(网申页面几乎都会要这两项)')
      return
    }
    setError('')
    onSave({
      id: initial?.id ?? '',
      name: name.trim(),
      updatedAt: initial?.updatedAt ?? '',
      // 第 1 条教育记录 = 最高/最近学历,写回扁平字段供填写引擎使用(引擎按扁平键匹配同义词)
      profile: applyEducationToProfile(profile, educations[0]),
      custom: { ...custom },
      educations: educations.map(e => ({ ...e })),
      experiences: experiences.map(e => ({ ...e })),
      projects: projects.map(p => ({ ...p })),
      awards: awards.map(a => ({ ...a })),
    })
  }

  const onTextChange =
    (key: keyof ResumeProfile) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setField(key, event.target.value)
    }

  const addCustomField = (): void => {
    setCustom(prev => {
      let n = 1
      while (prev[`新字段${n}`] !== undefined) n += 1
      return { ...prev, [`新字段${n}`]: '' }
    })
  }

  const renameCustomKey = (oldKey: string, newKey: string): void => {
    setCustom(prev => {
      const next: Record<string, string> = {}
      for (const [k, v] of Object.entries(prev)) next[k === oldKey ? newKey : k] = v
      return next
    })
  }

  const setCustomValue = (key: string, value: string): void => {
    setCustom(prev => ({ ...prev, [key]: value }))
  }

  const removeCustomField = (key: string): void => {
    setCustom(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  /** 扁平分组渲染(顶部组与底部组共用,避免把同一段 JSX 写两遍) */
  const renderGroup = (group: (typeof EDIT_GROUPS_TOP)[number]) => (
    <section className="modal-group" key={group.title}>
      <h3>{group.title}</h3>
      {group.fields.map(field => (
        // 未填写的字段标黄:只作视觉提示,不拦保存、不强制填写
        <div className={'modal-field' + (profile[field.key].trim() === '' ? ' is-empty' : '')} key={field.key}>
          <label htmlFor={`rf-${field.key}`}>{field.label}</label>
          {field.control === 'textarea' && (
            <textarea id={`rf-${field.key}`} rows={3} value={profile[field.key]} onChange={onTextChange(field.key)} />
          )}
          {field.control === 'radio' && (
            <div className="modal-radio" id={`rf-${field.key}`}>
              {(field.options ?? []).map(option => (
                <label key={option}>
                  <input
                    type="radio"
                    name={`rf-${field.key}`}
                    checked={profile[field.key] === option}
                    onChange={() => setField(field.key, option)}
                  />
                  {option === '' ? '不填' : option}
                </label>
              ))}
            </div>
          )}
          {field.control === 'select' && (
            <select id={`rf-${field.key}`} value={profile[field.key]} onChange={onTextChange(field.key)}>
              {(field.options ?? []).map(option => (
                <option key={option} value={option}>
                  {option === '' ? '(不填)' : option}
                </option>
              ))}
            </select>
          )}
          {field.control === 'combo' && (
            <>
              <input
                id={`rf-${field.key}`}
                type="text"
                list={`dl-${field.key}`}
                value={profile[field.key]}
                placeholder="可下拉选择,也可直接输入"
                onChange={onTextChange(field.key)}
              />
              <datalist id={`dl-${field.key}`}>
                {(field.options ?? []).map(option => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </>
          )}
          {(field.control === 'text' || field.control === 'date') && (
            <input
              id={`rf-${field.key}`}
              type={field.control === 'date' ? 'date' : 'text'}
              value={profile[field.key]}
              onChange={onTextChange(field.key)}
            />
          )}
        </div>
      ))}
    </section>
  )

  /**
   * 通用记录分组:教育/经历/项目/获奖四类可重复记录共用同一套卡片渲染。
   * 新增一类记录只需要补一个字段描述表 + 一个 state,不必再抄一遍 JSX。
   */
  const renderRecords = (opts: {
    title: string
    hint: string
    emptyHint?: string
    fields: readonly RecordField[]
    records: ReadonlyArray<{ id: string }>
    onAdd: () => void
    onRemove: (id: string) => void
    onSet: (id: string, key: string, value: string) => void
    /** 至少保留一条(教育背景必须有一条,用于同步扁平字段) */
    keepAtLeastOne?: boolean
    /** 第一条的额外标注,如「(最高/最近学历)」 */
    firstTag?: string
  }) => (
    <section className="modal-group modal-field-wide">
      <h3>
        {opts.title}
        <button type="button" className="resume-action-btn" onClick={opts.onAdd}>
          + 添加
        </button>
      </h3>
      <p className="modal-hint">{opts.hint}</p>
      {opts.records.length === 0 && opts.emptyHint !== undefined && <p className="modal-hint">{opts.emptyHint}</p>}
      {opts.records.map((record, index) => (
        <div className="record-card" key={record.id}>
          <div className="record-card-head">
            <span className="record-card-title">
              第 {index + 1} 条{opts.firstTag !== undefined && index === 0 ? opts.firstTag : ''}
            </span>
            {(!opts.keepAtLeastOne || opts.records.length > 1) && (
              <button type="button" className="resume-action-btn danger" onClick={() => opts.onRemove(record.id)}>
                删除
              </button>
            )}
          </div>
          <div className="record-grid">
            {opts.fields.map((field, fi) => {
              const id = `${record.id}-${fi}`
              const value = (record as unknown as Record<string, string>)[field.key] ?? ''
              return (
                <div
                  className={
                    (field.control === 'textarea' ? 'modal-field modal-field-wide' : 'modal-field') +
                    (value.trim() === '' ? ' is-empty' : '')
                  }
                  key={field.key}
                >
                  <label htmlFor={id}>{field.label}</label>
                  {field.control === 'textarea' && (
                    <textarea
                      id={id}
                      rows={4}
                      value={value}
                      placeholder={field.placeholder}
                      onChange={event => opts.onSet(record.id, field.key, event.target.value)}
                    />
                  )}
                  {field.control === 'select' && (
                    <select id={id} value={value} onChange={event => opts.onSet(record.id, field.key, event.target.value)}>
                      {(field.options ?? ['']).map(option => (
                        <option key={option} value={option}>
                          {option === '' ? '(未选择)' : option}
                        </option>
                      ))}
                    </select>
                  )}
                  {(field.control === 'text' || field.control === 'date') && (
                    <input
                      id={id}
                      type={field.control === 'date' ? 'date' : 'text'}
                      value={value}
                      placeholder={field.placeholder}
                      onChange={event => opts.onSet(record.id, field.key, event.target.value)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )

  /** 教育背景(可多条):第 1 条为最高/最近学历,保存时同步到扁平字段 */
  const renderEducations = () =>
    renderRecords({
      title: '教育背景',
      hint: '可添加多段(如本科、硕士)。第 1 条作为最高/最近学历,用于网申表单里「学校/专业/学历」这类只有一个空位的字段。',
      fields: EDUCATION_FIELDS,
      records: educations,
      onAdd: () => setEducations(prev => [...prev, emptyEducation()]),
      onRemove: id => setEducations(prev => prev.filter(e => e.id !== id)),
      onSet: setEducationField,
      keepAtLeastOne: true,
      firstTag: '(最高/最近学历)',
    })

  /** 实习/工作经历(可多条) */
  const renderExperiences = () =>
    renderRecords({
      title: '实习 / 工作经历',
      hint: '按时间倒序添加(最近的放最前)。描述可写职责与成果,一行一条更易读。',
      emptyHint: '(暂无经历,点右上「+ 添加」新增一条)',
      fields: EXPERIENCE_FIELDS,
      records: experiences,
      onAdd: () => setExperiences(prev => [...prev, emptyExperience()]),
      onRemove: id => setExperiences(prev => prev.filter(e => e.id !== id)),
      onSet: setExperienceField,
    })

  /** 项目经历(可多条):腾讯网申把「项目名称」「在项目中担任的角色」标为必填 */
  const renderProjects = () =>
    renderRecords({
      title: '项目经历',
      hint: '腾讯等网申的必填区。若页面把「项目名称」和「担任角色」分开问,这里逐条对应。',
      emptyHint: '(暂无项目,点右上「+ 添加」新增一条)',
      fields: PROJECT_FIELDS,
      records: projects,
      onAdd: () => setProjects(prev => [...prev, emptyProject()]),
      onRemove: id => setProjects(prev => prev.filter(p => p.id !== id)),
      onSet: setProjectField,
    })

  /** 获奖/荣誉(可多条) */
  const renderAwards = () =>
    renderRecords({
      title: '获奖 / 荣誉',
      hint: '奖项名称与获奖时间是网申常见必填项;级别用于「国家级/省级/校级」之类的手动关联。',
      emptyHint: '(暂无奖项,点右上「+ 添加」新增一条)',
      fields: AWARD_FIELDS,
      records: awards,
      onAdd: () => setAwards(prev => [...prev, emptyAward()]),
      onRemove: id => setAwards(prev => prev.filter(a => a.id !== id)),
      onSet: setAwardField,
    })

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={initial === null ? '新增简历' : '编辑简历'}>
      <div className="modal-card">
        <header className="modal-header">
          <h2>{initial === null ? '新增简历' : `编辑简历 · ${initial.name}`}</h2>
          <button type="button" className="modal-close" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal-body">
          <div className="modal-field modal-field-wide">
            <label htmlFor="resume-name">简历名称</label>
            <input
              id="resume-name"
              type="text"
              value={name}
              placeholder="如「我的简历-金融科技」,展示在简历卡片与悬浮球面板"
              onChange={event => setName(event.target.value)}
            />
          </div>
          {EDIT_GROUPS_TOP.map(renderGroup)}
          {renderEducations()}
          {renderExperiences()}
          {renderProjects()}
          {renderAwards()}
          {EDIT_GROUPS_BOTTOM.map(renderGroup)}
          <section className="modal-group modal-field-wide">
            <h3>
              自定义字段
              <button type="button" className="resume-action-btn" onClick={addCustomField}>
                + 添加字段
              </button>
            </h3>
            <p className="modal-hint">
              网申模板未覆盖的信息项(如「高考成绩」「职业规划」)在这里自行添加;填写时按字段名自动匹配。
            </p>
            {Object.entries(custom).map(([key, value]) => (
              <div className="custom-field-row" key={key}>
                <input
                  type="text"
                  className="custom-key"
                  value={key}
                  aria-label="自定义字段名"
                  onChange={event => renameCustomKey(key, event.target.value)}
                />
                <input
                  type="text"
                  className="custom-value"
                  value={value}
                  aria-label="自定义字段值"
                  onChange={event => setCustomValue(key, event.target.value)}
                />
                <button type="button" className="resume-action-btn danger" onClick={() => removeCustomField(key)}>
                  删除
                </button>
              </div>
            ))}
            {Object.keys(custom).length === 0 && <p className="modal-hint">(暂无自定义字段)</p>}
          </section>
          {error !== '' && <p className="modal-error">{error}</p>}
        </div>
        <footer className="modal-footer">
          <button type="button" className="fb-btn fb-btn-secondary" onClick={onClose}>
            取消
          </button>
          <button type="button" className="fb-btn fb-btn-primary" onClick={handleSave}>
            保存
          </button>
        </footer>
      </div>
    </div>
  )
}
