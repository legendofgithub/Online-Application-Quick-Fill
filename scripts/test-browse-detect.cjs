// 隔离复现:WebContentsView 加载 fixture → matchAdapter + GENERIC_PROBE,打印每一步结果
const { app, BrowserWindow, WebContentsView } = require('electron')
const path = require('path')
const { matchAdapter } = require('../electron/adapters.cjs')

const FIXTURE = 'file:///' + path.resolve(__dirname, '..', 'test-forms', 'sample-campus-form.html').replace(/\\/g, '/')

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    })
    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, '..', 'electron', 'preload-bridge.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    win.contentView.addChildView(view)
    view.setBounds({ x: 0, y: 48, width: 1000, height: 700 })
    await view.webContents.loadURL(FIXTURE)
    await new Promise(r => setTimeout(r, 2000))

    const url = view.webContents.getURL()
    console.log('URL =', url)
    const adapter = matchAdapter(url)
    console.log('adapter =', adapter && adapter.name)
    if (adapter) {
      try {
        const r = await view.webContents.mainFrame.executeJavaScript(adapter.probe)
        console.log('probe-main =', JSON.stringify(r))
      } catch (e) {
        console.log('probe-main THREW:', e && e.message)
      }
      try {
        const frames = [view.webContents.mainFrame, ...view.webContents.mainFrame.frames]
        console.log('frames =', frames.length)
      } catch (e) {
        console.log('frames enum THREW:', e && e.message)
      }
    }
  } catch (err) {
    console.log('OUTER-THREW =', err && err.message)
  }
  app.quit()
})
