const { app, BrowserWindow, ipcMain, Notification, globalShortcut, dialog, Tray, Menu } = require('electron')
const { autoUpdater } = require("electron-updater")
const path = require('path')
const fs = require('fs')
const os = require('os')
const isDevelopment = process.env.NODE_ENV !== 'production'
if (isDevelopment) {
    global.__static = path.join(__dirname, './static').replace(/\\/g, '\\\\');
}
const configPath = path.join(__static, '.sharetome')
const pkg = require('./package.json')
console.log('>>>>>static', __static)

let mainWindow = null;
let webContents = null;
let defaultConfig = pkg.appDefaults
defaultConfig.version = pkg.version

let config = Object.assign({}, defaultConfig);
let tray = null;
let loadConfigError = false;

getConfig();
initApp();

function initApp() {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    if (makeSingleInstance()) {
        app.exit()
    } else {
        app.setName(defaultConfig.appName)

        // disable hardware acceleration on windows
        if (process.platform.indexOf('win') === 0) {
            app.disableHardwareAcceleration()
        }

        app.on('ready', function () {
            createWindow()
            if (isDevelopment) {
                openDevTool()
            } else {
                globalShortcut.register('Ctrl+Shift+I', () => {
                    openDevTool()
                })
            }
        })

        app.on('activate', () => {
            createMainWindow()
        })

        app.on('window-all-closed', () => {
            app.exit()
        })

    }
}

function createWindow() {
    if (mainWindow) return
    mainWindow = new BrowserWindow({
        useContentSize: true,
        width: config.width,
        height: config.height,
        minHeight: config.width,
        minWidth: config.height,
        title: app.getName(),
        webPreferences: {
            // preload: path.resolve(path.join(__dirname, 'preload.js')),
            nodeIntegration: false
        }
    });

    mainWindow.on('close', (event) => {
        event.preventDefault();
        mainWindow.hide();
    });

    mainWindow.on('show', () => {
        tray.setHighlightMode('always')
    })

    mainWindow.on('hide', () => {
        tray.setHighlightMode('never')
    })

    webContents = mainWindow.webContents;
    mainWindow.loadURL(config.entryURL)

    autoUpdater.checkForUpdates();
    showTray();

    registerIpcMainEvent();
    registerWebcontentEvent()
    registerAutoUpdateEvent();
}

function registerIpcMainEvent() {
    ipcMain.on('clickUpdater', (event) => {
        const option = {
            type: "info",
            title: "更新提示",
            message: `版本说明:\n1.本次更新内容\n2.本次更新内容`,
            buttons: ['确认更新', '取消']
        }
        dialog.showMessageBox(option, (index) => {
            if (index == 0) {
                autoUpdater.checkForUpdates();
            }
        })
    })
}

function registerWebcontentEvent() {
    webContents.on("new-window", (event, url, frameName, disposition, options) => {
        options.show = true
        event.preventDefault()
        console.log('>>>>>open a new window')

        let newWin = new BrowserWindow({
            show: false,
            width: 960,
            height: 750,
            webPreferences: {
                // preload: path.resolve(path.join(__dirname, 'preload.js')),
                nodeIntegration: false
            }
        })

        newWin.once('ready-to-show', () => newWin.show())

        newWin.on('closed', (e) => {
            newWin.destroy();
        })

        newWin.webContents.on('will-prevent-unload', (event) => {
            const choice = dialog.showMessageBox(newWin, {
                type: 'question',
                buttons: ['离开', '取消'],
                title: '离开此网站?',
                message: '系统可能不会保留您所做的更改。',
                defaultId: 0,
                cancelId: 1
            })
            const leave = (choice === 0)
            if (leave) {
                event.preventDefault()
            }
        })

        newWin.loadURL(url)
        event.newGuest = newWin
    })

    webContents.on('will-navigate', (event, url) => {
        // force redirect root path '/' to entry page
        let m = entryURL.match(/^https:\/\/.*?\//)
        if (m && m[0] === url) {
            event.preventDefault()
            mainWindow.loadURL(config.entryURL)
        }
    })

    webContents.on('did-fail-load', (event, errorCode, errorMessage) => {
        console.log('>>>>>The browser window load fail', errorCode, errorMessage)
        //Todo
    })

    webContents.on('did-finish-load', () => {
        console.log('>>>>>The browser window load finish')
        mainWindow.show()

        if (loadConfigError) {
            webContents.send('query-client-config-error-reply', false)
        }
    })

    webContents.on('crashed', (event) => {
        console.log('>>>>>The browser window has just crashed', event)
    })
}

function showTray() {
    if (tray) return;
    tray = new Tray(path.join(__static, 'images/tray.png'))

    contextMenu = Menu.buildFromTemplate([{
        label: '退出',
        click: function () {
            app.exit();
        }
    }])

    tray.setToolTip(config.appName)

    tray.on('click', () => {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
    })

    tray.on('right-click', () => {
        tray.popUpContextMenu(contextMenu)
    })
}

function makeSingleInstance() {
    return app.makeSingleInstance((arg, work) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore()
            }
            mainWindow.show()
            mainWindow.focus()
        }
    })
}

function getConfig() {
    try {
        fs.accessSync(configPath, fs.constants.R_OK)
        let data = fs.readFileSync(configPath, 'utf-8')
        config = Object.assign({}, defaultConfig, JSON.parse(data))
    } catch (e) {
        loadConfigError = true;
        console.log('>>>>>load config error', e);
    }
}

function openDevTool() {
    var focusWin = BrowserWindow.getFocusedWindow();
    if (focusWin) {
        focusWin.webContents.toggleDevTools();
    }
}

function notification(text, callback) {
    let notification = {
        title: text
    }

    let noti = new Notification(notification)
    noti.show();
    noti.on('click', (event) =>{
        callback && callback();
    })
}

/**------------------------------自动更新 start-------------------------------- */
function registerAutoUpdateEvent() {
    let message = {
        error: '检查更新出错',
        checking: '正在检查更新……',
        updateAva(info){
            return `检测到新版本，点击立刻下载！`;
        },
        updateNotAva(info){
            return `当前是最新版本${info.version}！`;
        },
        downloaded(info){
            return `${info.version}版本下载完成`
        }
    };

    autoUpdater.autoDownload = false;
    autoUpdater.setFeedURL(config.autoUpdaterUrl);
    autoUpdater.on('error', function (error) {
        // notification(message.error)
        console.log(`>>>>>${message.error}`, error)
    });
    autoUpdater.on('checking-for-update', function () {
        // notification(message.checking)
        console.log(`>>>>>${message.checking}`)
    });
    autoUpdater.on('update-available', function (info) {
        notification(message.updateAva(info), (event) => {
            autoUpdater.downloadUpdate();
        })
    });
    autoUpdater.on('update-not-available', function (info) {
        // notification(message.updateNotAva)
        console.log(`>>>>>${message.updateNotAva}`)
    });

    // 更新下载进度事件
    autoUpdater.on('download-progress', function (progressObj) {
        mainWindow.setProgressBar(progressObj.percent || 0)
    })
    autoUpdater.on('update-downloaded', function (info) {
        notification(message.downloaded(info))
        const option = {
            type: "info",
            title: "更新提示",
            message: `即将退出当前应用，是否立即更新?`,
            buttons: ['确认', '取消']
        }
        dialog.showMessageBox(option, (index) => {
            if (index == 0) {
                autoUpdater.quitAndInstall();
            }
        })
    });
}
/**------------------------------自动更新 end-------------------------------- */