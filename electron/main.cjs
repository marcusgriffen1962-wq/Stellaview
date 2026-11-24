'use strict';

const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const path = require('node:path');
const { createSnapshot } = require('./system.cjs');
const { startStaticServer } = require('./server.cjs');

const isDev = process.env.STELLAVIEW_DEV === '1';
const isMac = process.platform === 'darwin';

// A dashboard does not need GPU acceleration. On Linux, software rendering and
// a relaxed GPU sandbox keep the window reliable on virtual displays too.
if (process.platform === 'linux') {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu-sandbox');
}

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
  const iconFile = isMac ? 'icon.icns' : process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const iconPath = path.join(app.getAppPath(), 'build', iconFile);

  const windowOptions = {
    width: Math.min(1560, display.workAreaSize.width - 80),
    height: Math.min(960, display.workAreaSize.height - 80),
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: '#080b1f',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  };

  mainWindow = new BrowserWindow({
    ...windowOptions,
    ...(isMac
      ? {
          frame: true,
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 16, y: 16 },
        }
      : { frame: false }),
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
