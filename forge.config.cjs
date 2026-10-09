// Electron Forge 打包配置:仅 package(免安装目录),maker 留待发布阶段
module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'CampusFill',
    // 正式发布前补充图标(icon.ico);试用版用 Electron 默认图标
  },
  rebuildConfig: {},
  makers: [],
}
