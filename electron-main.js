const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let backendProcess = null;

function startBackend() {
  console.log('Starting backend process...');
  
  let cmd;
  let args;
  let cwd;

  if (app.isPackaged) {
    const binaryName = process.platform === 'win32' ? 'main.exe' : 'main';
    cmd = path.join(process.resourcesPath, 'main', binaryName);
    args = [];
    cwd = path.dirname(cmd);
  } else {
    cmd = process.platform === 'win32' ? 'python' : 'python3';
    args = ['main.py'];
    cwd = __dirname;
  }

  console.log(`Spawning backend: ${cmd} ${args.join(' ')} (cwd: ${cwd})`);

  backendProcess = spawn(cmd, args, {
    cwd: cwd,
    stdio: 'pipe'
  });

  backendProcess.stdout.on('data', (data) => {
    console.log(`[Backend] stdout: ${data}`);
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`[Backend] stderr: ${data}`);
  });

  backendProcess.on('error', (err) => {
    console.error('Failed to start backend:', err);
    let message = "Could not start the backend.\n\n";
    if (app.isPackaged) {
      message += `Expected packaged binary at: ${cmd}\n\n`;
    } else {
      message += "Please make sure Python is installed and in your PATH, and you have run 'pip install -r requirements.txt'.\n\n";
    }
    message += "Details: " + err.message;
    dialog.showErrorBox("Backend Startup Failed", message);
  });

  backendProcess.on('close', (code) => {
    console.log(`Backend process exited with code ${code}`);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "AOS — AI Operating System IDE",
    icon: path.join(__dirname, 'help_icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false // allow loading local scripts and styles cleanly
    }
  });

  // Load local index.html entry point
  win.loadFile('index.html');
  
  // Apply a custom User-Agent containing 'Electron' to allow detection in frontend
  win.webContents.setUserAgent(win.webContents.getUserAgent() + " Electron");
}

app.whenReady().then(() => {
  // Start the python backend and open window
  startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Gracefully terminate python backend
  if (backendProcess) {
    backendProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
});
