'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  getSnapshot: () => ipcRenderer.invoke('system:snapshot'),
  getAgents: () => ipcRenderer.invoke('agents:snapshot'),
  getLayout: () => ipcRenderer.invoke('layout:snapshot'),
  getAwakeState: () => ipcRenderer.invoke('power:get'),
  setAwake: (enabled) => ipcRenderer.invoke('power:set', Boolean(enabled)),
  windowControls: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
});
