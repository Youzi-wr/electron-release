const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron')
const { autoUpdater } = require("electron-updater")

let mainWindow;
function createWindow() {
    mainWindow = new BrowserWindow({
        height: 500,
        useContentSize: true,
        width: 850,
        minHeight: 400,
        minWidth: 500,
        webPreferences: {
            // webSecurity: true
        }
    });

    mainWindow.setMenu(null)
    mainWindow.loadURL(`file://${__dirname}/page/login.html`)
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    //尝试更新
    updateHandle();
}

app.on('ready', function () {
    globalShortcut.register('Ctrl+Shift+I', () => {
        var focusWin = BrowserWindow.getFocusedWindow();
        if (focusWin) {
            focusWin.webContents.toggleDevTools();
        }
    })
    createWindow();
})

// 检测更新，在你想要检查更新的时候执行，renderer事件触发后的操作自行编写
function updateHandle() {
    let message = {
        error: '检查更新出错',
        checking: '正在检查更新……',
        updateAva: '检测到新版本，正在下载……',
        updateNotAva: '现在使用的就是最新版本，不用更新',
    };

    autoUpdater.setFeedURL(`http://localhost:8090/test-release/`);
    autoUpdater.on('error', function (error) {
        sendUpdateMessage(message.error)
    });
    autoUpdater.on('checking-for-update', function () {
        sendUpdateMessage(message.checking)
    });
    autoUpdater.on('update-available', function (info) {
        sendUpdateMessage(message.updateAva)
    });
    autoUpdater.on('update-not-available', function (info) {
        sendUpdateMessage(message.updateNotAva)
    });

    // 更新下载进度事件
    autoUpdater.on('download-progress', function (progressObj) {
        mainWindow.webContents.send('downloadProgress', progressObj)
    })
    autoUpdater.on('update-downloaded', function (event, releaseNotes, releaseName, releaseDate, updateUrl, quitAndUpdate) {

        ipcMain.on('isUpdateNow', (e, arg) => {
            console.log(arguments);
            console.log("开始更新");
            //some code here to handle event
            autoUpdater.quitAndInstall();
        });

        mainWindow.webContents.send('isUpdateNow')
    });

    ipcMain.on("checkForUpdate", () => {
        //执行自动更新检查
        autoUpdater.checkForUpdates();
    })
}

// 通过main进程发送事件给renderer进程，提示更新信息
function sendUpdateMessage(text) {
    mainWindow.webContents.send('message', text)
}