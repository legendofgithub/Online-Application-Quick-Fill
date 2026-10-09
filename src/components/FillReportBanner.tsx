import { useMemo, useState } from 'react'
import type { ExportReportResult, FillReport } from '../types/electron-api'
import type { Resume } from '../mock/resumes'
import { EMPTY_PROFILE } from '../mock/resumes'

interface FillReportBannerProps {
  report: FillReport
  currentResume: Resume | undefined
  onSetMapping: (payload: { label: string; target: string }) => void
  /** 把这次填写导成 Markdown(主进程弹保存对话框) */
  onExport: (mode?: 'dsh' | 'file') => Promise<ExportReportResult>
  onClose: () => void
}

/**
 * 填写报告(主窗口横幅):本次填写 n/m;缺项列表可逐项选择简历字段并「记住关联」,
 * 关联后下次填写优先按该映射取值。右上「导出报告」把这次结果落盘成 Markdown,
 * 便于照着补简历(本轮新增的微信号/QQ号/项目经历/获奖等字段就是这么来的)。
 */
export function FillReportBanner({ report, currentResume, onSetMapping, onExport, onClose }: FillReportBannerProps) {
  const [linked, setLinked] = useState<Record<string, string>>({})
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState('')

  const handleExport = (mode: 'dsh' | 'file'): void => {
    setExporting(true)
    setExportMsg('')
    void onExport(mode)
      .then(result => {
        if (result.ok && result.path !== undefined) {
          if (mode === 'file') setExportMsg(`已导出:${result.path}`)
          else
            setExportMsg(
              result.copied === true
                ? `已导出到 DSH:${result.path} — 提示语已复制,切到 DSH 按 Ctrl+V 回车即可`
                : `已导出到 DSH:${result.path} — 请把该路径发给我`,
            )
        }
        else if (result.reason === 'canceled') setExportMsg('已取消导出')
        else if (result.reason === 'no-report') setExportMsg('还没有可导出的填写记录')
        else setExportMsg(`导出失败(${result.reason ?? '未知原因'})`)
      })
      .catch(() => setExportMsg('导出失败'))
      .finally(() => setExporting(false))
  }

  const candidates = useMemo(() => {
    const profile = { ...EMPTY_PROFILE, ...currentResume?.profile }
    const entries: Array<{ key: string; display: string }> = []
    for (const [key, value] of Object.entries(profile)) {
      entries.push({ key, display: value === '' ? `${key}(空)` : `${key}:${value.slice(0, 12)}${value.length > 12 ? '…' : ''}` })
    }
    const custom = currentResume?.custom ?? {}
    for (const [key, value] of Object.entries(custom)) {
      entries.push({ key, display: `[自定义] ${key}:${value.slice(0, 12)}${value.length > 12 ? '…' : ''}` })
    }
    return entries
  }, [currentResume])

  const link = (label: string): void => {
    const target = choices[label] ?? ''
    if (target === '') return
    onSetMapping({ label, target })
    setLinked(prev => ({ ...prev, [label]: target }))
  }

  return (
    <section className="fill-report" aria-label="填写报告">
      <header className="fill-report-header">
        <strong>
          填写报告 · {report.resumeName}:已自动填写 {report.filled}/{report.total} 项
        </strong>
        <div className="fill-report-actions">
          {exportMsg !== '' && <span className="fill-report-export-msg">{exportMsg}</span>}
          {/* 两个入口:「导出报告」自己挑位置(原有行为);「导出到 DSH」写进 AI 能直接读的收件箱 */}
          <button type="button" className="resume-action-btn" disabled={exporting} onClick={() => handleExport('file')}>
            导出报告
          </button>
          <button type="button" className="resume-action-btn" disabled={exporting} onClick={() => handleExport('dsh')}>
            {exporting ? '导出中…' : '导出到 DSH'}
          </button>
          <button type="button" className="modal-close" aria-label="关闭报告" onClick={onClose}>
            ×
          </button>
        </div>
      </header>
      {report.missingPageFields.length > 0 ? (
        <>
          <p className="fill-report-tip">
            以下页面信息项没有匹配到简历数据(已留空,请人工补充)。选择一项简历字段并点「记住关联」,下次填写将自动使用:
          </p>
          <ul className="fill-report-list">
            {report.missingPageFields.map(label => (
              <li key={label}>
                <span className="fill-report-label" title={label}>
                  {label}
                </span>
                {linked[label] !== undefined ? (
                  <span className="fill-report-linked">已关联 → {linked[label]} ✓</span>
                ) : (
                  <>
                    <select value={choices[label] ?? ''} onChange={event => setChoices(prev => ({ ...prev, [label]: event.target.value }))}>
                      <option value="">选择简历字段…</option>
                      {candidates.map(candidate => (
                        <option key={candidate.key} value={candidate.key}>
                          {candidate.display}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="resume-action-btn"
                      disabled={(choices[label] ?? '') === ''}
                      onClick={() => link(label)}
                    >
                      记住关联
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="fill-report-tip">页面信息项全部匹配完成,无缺项。</p>
      )}
      {report.missingData.length > 0 && (
        <p className="fill-report-tip">
          另外这几项虽然匹配到了简历字段、但没能填进页面:{report.missingData.join('、')}。
          常见原因是该字段在你简历里是空的,或页面的下拉选项与你的取值对不上(如「正职」vs「全职」)。
        </p>
      )}
    </section>
  )
}
