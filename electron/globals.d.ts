/*
 * 渲染进程侧的全局声明(供 tsc 检查 electron/*.cjs 使用)。
 *
 * fillScript.cjs 里的函数体是「序列化后注入到浏览器页面执行」的,
 * preload.cjs / preload-bridge.cjs 本身就跑在渲染进程里,
 * 三者都会访问下面这些由 contextBridge 暴露到 window 上的对象。
 */
interface CampusFillBridge {
  /** 逐字段填写进度回报(preload 转发为 cf:fill-progress) */
  report: (stepJson: string) => void
}

interface Window {
  campusFillBridge?: CampusFillBridge
}
