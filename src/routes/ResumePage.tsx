import { useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { FIELD_MAPPINGS } from '../autofill/fieldMapping'
import type { Resume } from '../mock/resumes'
import { ResumeEditorModal } from '../components/ResumeEditorModal'
import { useResumeStore } from '../store/useResumeStore'

/** 页面 #/resume:简历卡片预览 + 切换当前使用 + 新增/编辑/删除 */
export function ResumePage() {
  const { resumes, currentResume, setCurrentResume, saveResume, deleteResume } = useResumeStore()
  const [editing, setEditing] = useState<Resume | null>(null)
  const [creating, setCreating] = useState(false)

  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>, id: string): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setCurrentResume(id)
    }
  }

  const stopAnd = (event: MouseEvent, action: () => void): void => {
    event.stopPropagation()
    action()
  }

  // 删除采用两段式确认(避免依赖原生 confirm——Electron 下行为不稳定且自动化不可控)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

  const handleDeleteClick = (resume: Resume): void => {
    if (resumes.length <= 1) return
    if (confirmingDeleteId !== resume.id) {
      setConfirmingDeleteId(resume.id)
      window.setTimeout(() => {
        setConfirmingDeleteId(prev => (prev === resume.id ? null : prev))
      }, 3000)
      return
    }
    setConfirmingDeleteId(null)
    deleteResume(resume.id)
  }

  const modalOpen = creating || editing !== null

  return (
    <main className="page resume-page">
      <h1 className="page-title">简历管理</h1>
      <p className="page-tip">点击卡片切换「当前使用」简历;悬浮球自动填写时将使用该简历的内容。</p>
      <div className="resume-toolbar">
        <button type="button" className="fb-btn fb-btn-primary resume-add-btn" onClick={() => setCreating(true)}>
          + 新增简历
        </button>
        {/*
          内置演示表单入口。原先挂在悬浮球的待机态按钮上(「进入演示网申页」),
          但那会让球把用户从真实网申站踢走 —— 球只该判断当前页面,不该负责导航。
          演示表单是练习/自测用的靶子,因此挪到这里作为显式入口。
        */}
        <button
          type="button"
          className="fb-btn fb-btn-secondary resume-add-btn"
          title="打开内置的模拟网申表单,用于熟悉填写流程与自测(真实投递请在「网申浏览」里打开目标公司的网申页)"
          onClick={() => {
            window.location.hash = '#/apply'
          }}
        >
          练习填写
        </button>
      </div>
      <div className="resume-grid">
        {resumes.map(resume => {
          const isCurrent = resume.id === currentResume?.id
          return (
            <section
              key={resume.id}
              className={isCurrent ? 'resume-card current' : 'resume-card'}
              role="button"
              tabIndex={0}
              aria-pressed={isCurrent}
              onClick={() => setCurrentResume(resume.id)}
              onKeyDown={event => handleCardKeyDown(event, resume.id)}
            >
              <header className="resume-card-header">
                <h2 className="resume-card-title">{resume.name}</h2>
                {isCurrent && <span className="resume-current-badge">当前使用</span>}
                <span className="resume-card-actions">
                  <button
                    type="button"
                    className="resume-action-btn"
                    aria-label={`编辑 ${resume.name}`}
                    onClick={event => stopAnd(event, () => setEditing(resume))}
                  >
                    编辑
                  </button>
                  {resumes.length > 1 && (
                    <button
                      type="button"
                      className={confirmingDeleteId === resume.id ? 'resume-action-btn danger confirming' : 'resume-action-btn danger'}
                      aria-label={`删除 ${resume.name}`}
                      onClick={event => stopAnd(event, () => handleDeleteClick(resume))}
                    >
                      {confirmingDeleteId === resume.id ? '确认删除？' : '删除'}
                    </button>
                  )}
                </span>
              </header>
              <dl className="resume-fields">
                {FIELD_MAPPINGS.map(field => (
                  <div
                    className={field.control === 'textarea' ? 'resume-field wide' : 'resume-field'}
                    key={field.key}
                  >
                    <dt>{field.label}</dt>
                    <dd>{resume.profile?.[field.key] || '—'}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )
        })}
      </div>
      {modalOpen && (
        <ResumeEditorModal
          initial={editing}
          onSave={resume => {
            saveResume(resume)
            setCreating(false)
            setEditing(null)
          }}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
        />
      )}
    </main>
  )
}
