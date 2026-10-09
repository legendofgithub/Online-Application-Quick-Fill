import type { AutofillStatus } from '../autofill/types'
import { TOTAL_FIELD_COUNT } from '../autofill/fieldMapping'

interface PanelProps {
  status: AutofillStatus
  /** 面板顶部展示的当前简历名 */
  resumeName: string
  /** 已检测到文案中的站点名(demo 为「演示公司」,真实页面为适配器名) */
  siteLabel?: string
  className?: string
  /** 「开始检测」:探测当前页面是否为网申表单页 */
  onDetect: () => void
  onStartFill: () => void
  onReset: () => void
  /**
   * 未检测到时的补充提示。桌面版必须说明前提:球只能检测**本软件内**的页面
   * (主窗口或「网申浏览」里的内嵌页),看不见 Chrome/Edge 等其他浏览器的窗口
   * —— 用户报「检测不到腾讯网申页」正是因为在外部浏览器里打开了页面。
   */
  idleHint?: string
}

/**
 * 悬浮球面板。
 *
 * 产品口径:球只回答一个问题——**当前页面是不是网申表单页**,结果只有两种:
 * 「未检测到网申表单」与「已检测到网申表单(站点名)」。
 * 因此面板不再提供「进入演示网申页」这类跳转:球不负责带用户去某个页面,
 * 只负责判断用户已经打开的页面。(演示表单已挪到简历管理页的「练习填写」入口。)
 */
export function Panel({ status, resumeName, siteLabel, className, onDetect, onStartFill, onReset, idleHint }: PanelProps) {
  const total = status.totalFields > 0 ? status.totalFields : TOTAL_FIELD_COUNT
  const rootClass = className === undefined || className === '' ? 'fb-panel' : `fb-panel ${className}`

  return (
    <section className={rootClass} aria-label="校招快填面板">
      <header className="fb-panel-header" title={resumeName}>
        当前简历:{resumeName}
      </header>
      <div className="fb-panel-body">
        {status.state === 'idle' && (
          <>
            <p className="fb-text fb-text-danger">✗ 未检测到网申表单</p>
            {idleHint !== undefined && idleHint !== '' && <p className="fb-hint">{idleHint}</p>}
            <button type="button" className="fb-btn fb-btn-primary" onClick={onDetect}>
              开始检测
            </button>
          </>
        )}
        {status.state === 'detecting' && (
          <p className="fb-text">
            <span className="fb-spinner" aria-hidden="true" />
            正在检测当前页面…
          </p>
        )}
        {status.state === 'ready' && (
          <>
            <p className="fb-text fb-text-success">✓ 已检测到网申表单({siteLabel === undefined || siteLabel === '' ? '通用表单' : siteLabel})</p>
            <button type="button" className="fb-btn fb-btn-primary" onClick={onStartFill}>
              开始填写
            </button>
          </>
        )}
        {status.state === 'filling' && (
          <>
            <p className="fb-text">
              正在填写 {status.filledCount}/{total}:{status.activeFieldLabel}
            </p>
            <div
              className="fb-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={status.filledCount}
            >
              <div
                className="fb-progress-bar"
                style={{ width: `${(status.filledCount / total) * 100}%` }}
              />
            </div>
          </>
        )}
        {status.state === 'done' && (
          <>
            <p className="fb-text fb-text-success">
              ✓ 填写完成 {status.filledCount}/{total}。请人工核对后自行提交,工具不会代为提交。
            </p>
            {status.missingPageFields !== undefined && status.missingPageFields.length > 0 && (
              <p className="fb-text fb-text-danger fb-missing">
                未匹配 {status.missingPageFields.length} 项:{status.missingPageFields.slice(0, 4).join('、')}
                {status.missingPageFields.length > 4 ? ' 等' : ''}。可回主窗口查看填写报告并关联。
              </p>
            )}
            <button type="button" className="fb-btn fb-btn-secondary" onClick={onReset}>
              清空重填
            </button>
          </>
        )}
      </div>
    </section>
  )
}
