// 独立复现:加载 dist/index.html → #/apply → 用主引擎同款通道执行 demoFillScript,打印真实结果/异常
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const fillScript = require('../electron/fillScript.cjs')

app.whenReady().then(async () => {
  try {
    // 极简主进程没有简历存储,注册最小 handler 让 React Provider 正常就绪
    const storePath = path.join(__dirname, '..', '.dev-data', 'resumes.json')
    const store = fs.existsSync(storePath)
      ? JSON.parse(fs.readFileSync(storePath, 'utf8'))
      : { resumes: [], currentId: null }
    ipcMain.handle('cf:get-resumes', () => store)
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
      },
    })
    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
    await win.webContents.executeJavaScript("location.hash = '#/apply'")
    await new Promise(r => setTimeout(r, 1500))

    const resume = (store.resumes || [])[0]
    console.log('resume =', resume && resume.name)
    const script = fillScript.demoFillScript(resume.profile)

    // 与主引擎完全同款:WebFrameMain.executeJavaScript
    try {
      const out = await win.webContents.mainFrame.executeJavaScript(script)
      console.log('RESULT =', JSON.stringify(out))
    } catch (err) {
      console.log('THREW =', err && err.message)
      console.log(String(err && err.stack).slice(0, 1000))
    }
    // 再用 webContents 级别对照
    try {
      const out2 = await win.webContents.executeJavaScript(script)
      console.log('RESULT-WC =', JSON.stringify(out2))
    } catch (err) {
      console.log('THREW-WC =', err && err.message)
    }
  } catch (err) {
    console.log('OUTER-THREW =', err && err.message)
  }
  app.quit()
})
