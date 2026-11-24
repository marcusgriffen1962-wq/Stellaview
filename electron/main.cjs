'use strict';

const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const path = require('node:path');
const { createSnapshot } = require('./system.cjs');
const { startStaticServer } = require('./server.cjs');

const isDev = process.env.STELLAVIEW_DEV === '1';

// A dashboard does not need GPU acceleration, and software rendering keeps the
// window reliable on headless/virtual displays as well as normal desktops.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu-sandbox');

let mainWindow = null;
let localServer = null;

function getDisplayInfo() {
  try {
    const display = screen.getPrimaryDisplay();
    return {
      width: display.bounds.width,
      height: display.bounds.height,
      scaleFactor: display.scaleFactor || 1,
    };
  } catch {
    return { width: 0, height: 0, scaleFactor: 1 };
  }
}

async function createWindow() {
  const display = screen.getPrimaryDisplay();
  const iconPath = path.join(app.getAppPath(), 'build', 'icon.png');

  mainWindow = new BrowserWindow({
    width: Math.min(1560, display.workAreaSize.width - 80),
    height: Math.min(960, display.workAreaSize.height - 80),
    minWidth: 1080,
    minHeight: 700,
    frame: false,
    show: false,
    backgroundColor: '#080b1f',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    if (mainWindow) mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    await mainWindow.loadURL('http://127.0.0.1:3000');
  } else {
    const outputDirectory = path.join(app.getAppPath(), 'out');
    localServer = await startStaticServer(outputDirectory);
    await mainWindow.loadURL(localServer.url);
  }
}

function registerIpcHandlers() {
  ipcMain.handle('system:snapshot', () => createSnapshot(getDisplayInfo()));

  ipcMain.on('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unrestore();
    else mainWindow.maximize();
  });

  ipcMain.on('window:close', () => {
    if (mainWindow) mainWindow.close();
  });
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (localServer && localServer.server) localServer.server.close();
  if (process.platform !== 'darwin') app.quit();
});
