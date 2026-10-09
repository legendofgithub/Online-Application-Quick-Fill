import { createContext, useContext } from 'react'
import type { Resume } from '../mock/resumes'

export interface ResumeStore {
  resumes: readonly Resume[]
  /** Electron 模式数据异步加载,加载期间此值为 undefined */
  currentResume: Resume | undefined
  loading: boolean
  setCurrentResume: (id: string) => void
  /** 新增或更新简历(id 为空串时新增,新增后自动切换为当前简历) */
  saveResume: (resume: Resume) => void
  /** 删除简历(至少保留一份;删除当前简历时自动切换) */
  deleteResume: (id: string) => void
}

export const resumeStoreContext = createContext<ResumeStore | null>(null)

/** 当前使用简历的读写:web 模式为 React state;Electron 模式落在主进程 userData/resumes.json */
export function useResumeStore(): ResumeStore {
  const store = useContext(resumeStoreContext)
  if (store === null) {
    throw new Error('useResumeStore 必须在 <ResumeProvider> 内使用')
  }
  return store
}
