const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let serverProcess = null;

function startServer() {
  // Load and start the express server in the Electron main process.
  // This is more reliable when packaging because it avoids spawning a separate Node binary.
  try {
    require(path.join(__dirname, 'server.js'));
    console.log('Server module required successfully');
  } catch (err) {
    console.error('Failed to start server:', err);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load the local server URL
  win.loadURL('http://localhost:3000');
}

app.whenReady().then(() => {
  startServer();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  // Server will be terminated when the process exits. If server.js
  // exported a server instance we could close it explicitly here.
});