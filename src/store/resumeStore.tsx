import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { mockResumes, normalizeResume } from '../mock/resumes'
import type { Resume } from '../mock/resumes'
import { resumeStoreContext } from './useResumeStore'
import type { ResumeStore } from './useResumeStore'
import type { ResumeSnapshot } from '../types/electron-api'

/**
 * 简历数据源:web 开发模式用内置 mock 的本地副本;Electron 模式从主进程读写
 * (userData/resumes.json 落盘,主进程同时用它驱动真实页面的注入填写)。
 */
function useResumeSource(): {
  resumes: readonly Resume[]
  currentId: string | null
  loading: boolean
  select: (id: string) => void
  save: (resume: Resume) => void
  remove: (id: string) => void
} {
  const api = window.campusFill
  const [snapshot, setSnapshot] = useState<ResumeSnapshot | null>(null)
  // 防御:HMR/边界场景下 mock 模块未就绪时不至于在读取 [0].id 时崩溃
  const [localId, setLocalId] = useState<string>(() => mockResumes[0]?.id ?? '')
  const [localResumes, setLocalResumes] = useState<readonly Resume[]>(() =>
    mockResumes.map(resume =>
      normalizeResume({
        ...resume,
        profile: { ...resume.profile },
        custom: { ...resume.custom },
        educations: resume.educations.map(e => ({ ...e })),
        experiences: resume.experiences.map(e => ({ ...e })),
        projects: resume.projects.map(e => ({ ...e })),
        awards: resume.awards.map(e => ({ ...e })),
      }),
    ),
  )

  useEffect(() => {
    if (api === undefined) return
    let active = true
    const load = (): void => {
      void api.getResumes().then(data => {
        if (active) setSnapshot(data)
      })
    }
    load()
    api.onResumesChanged(data => setSnapshot(data))
  }, [api])

  if (api === undefined) {
    const localSave = (resume: Resume): void => {
      const isNew = resume.id === '' || !localResumes.some(item => item.id === resume.id)
      const record: Resume = {
        ...resume,
        id: isNew ? `resume-local-${Date.now().toString(36)}` : resume.id,
        updatedAt: new Date().toISOString(),
      }
      setLocalResumes(prev =>
        isNew ? [...prev, record] : prev.map(item => (item.id === record.id ? record : item)),
      )
      if (isNew) setLocalId(record.id)
    }
    const localRemove = (id: string): void => {
      setLocalResumes(prev => (prev.length <= 1 ? prev : prev.filter(item => item.id !== id)))
      setLocalId(prev => (prev === id ? (localResumes.find(item => item.id !== id)?.id ?? prev) : prev))
    }
    return { resumes: localResumes, currentId: localId, loading: false, select: setLocalId, save: localSave, remove: localRemove }
  }
  if (snapshot === null) {
    return { resumes: [], currentId: null, loading: true, select: () => {}, save: () => {}, remove: () => {} }
  }
  return {
    resumes: snapshot.resumes,
    currentId: snapshot.currentId,
    loading: false,
    select: id => api.selectResume(id),
    save: resume => api.saveResume(resume),
    remove: id => api.deleteResume(id),
  }
}

export function ResumeProvider({ children }: { children: ReactNode }) {
  const { resumes, currentId, loading, select, save, remove } = useResumeSource()
  const value = useMemo<ResumeStore>(() => {
    // 过滤掉任何非法元素,杜绝 undefined.id 之类的渲染期崩溃;
    // normalizeResume 兼容旧数据:没有 educations 的简历用扁平教育字段派生第一条记录
    const safe = resumes
      .filter((resume): resume is Resume => resume != null && typeof resume.id === 'string')
      .map(normalizeResume)
    const current = safe.find(resume => resume.id === currentId) ?? safe[0]
    return { resumes: safe, currentResume: current, loading, setCurrentResume: select, saveResume: save, deleteResume: remove }
  }, [resumes, currentId, loading, select, save, remove])
  return <resumeStoreContext.Provider value={value}>{children}</resumeStoreContext.Provider>
}
