// 内嵌浏览(WebContentsView)专用 preload:只暴露填写进度桥。
// 该 webContents 会加载任意外部招聘网站,除进度回报外不暴露任何能力,
// 防止外部页面读取简历数据或操控窗口。
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('campusFillBridge', {
  report: stepJson => ipcRenderer.send('cf:fill-progress', stepJson),
})
