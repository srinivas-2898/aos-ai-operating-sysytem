const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const http = require('http');

let backendProcess = null;
let mainWindow = null;
let isAppQuitting = false;

// Register IPC handler to open native folder picker
ipcMain.handle('dialog:openDirectory', async (event, defaultPath) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: defaultPath || undefined,
    title: 'Select Folder to Open in AOS IDE'
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

function checkBackendRunning() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:8000/docs', (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 307);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function startBackend() {
  const alreadyRunning = await checkBackendRunning();
  if (alreadyRunning) {
    console.log('[Backend] Existing backend already running on port 8000. Reusing instance.');
    return;
  }

  console.log('Starting backend process...');
  
  let cmd;
  let args;
  let cwd;

  if (app.isPackaged) {
    const binaryName = process.platform === 'win32' ? 'main.exe' : 'main';
    cmd = path.join(process.resourcesPath, 'main', binaryName);
    args = [];
    cwd = path.join(process.resourcesPath, 'main');
  } else {
    cmd = process.platform === 'win32' ? 'python' : 'python3';
    args = ['main.py'];
    cwd = __dirname;
  }

  console.log(`Spawning backend: ${cmd} ${args.join(' ')} (cwd: ${cwd})`);

  try {
    backendProcess = spawn(cmd, args, {
      cwd: cwd,
      stdio: 'pipe',
      env: { ...process.env, PATH: process.env.PATH }
    });

    backendProcess.stdout.on('data', (data) => {
      console.log(`[Backend] stdout: ${data}`);
    });

    backendProcess.stderr.on('data', (data) => {
      console.error(`[Backend] stderr: ${data}`);
    });

    backendProcess.on('error', (err) => {
      console.error('Failed to start backend:', err);
      if (isAppQuitting) return;
      let message = "Could not start the backend.\n\n";
      if (app.isPackaged) {
        message += `Expected packaged binary at: ${cmd}\n\n`;
      } else {
        message += "Please make sure Python is installed and in your PATH, and you have run 'pip install -r requirements.txt'.\n\n";
      }
      message += "Details: " + err.message;
      dialog.showErrorBox("Backend Startup Failed", message);
    });

    backendProcess.on('close', async (code) => {
      console.log(`Backend process exited with code ${code}`);
      if (isAppQuitting) return;

      // Check if another backend process is already serving port 8000
      const isAlive = await checkBackendRunning();
      if (isAlive) {
        console.log('[Backend] Port 8000 is still serving requests. No error box needed.');
        return;
      }

      if (code !== 0 && code !== null) {
        dialog.showErrorBox(
          "Backend Crashed",
          `The backend process exited with code ${code}.\n\nPlease check that port 8000 is available and all Python dependencies are installed.`
        );
      }
    });
  } catch (err) {
    console.error('Spawn exception:', err);
  }
}

/**
 * Wait for the backend HTTP server to be ready before loading the UI.
 * Polls http://127.0.0.1:8000/docs every 500ms, up to maxAttempts times.
 */
function waitForBackend(maxAttempts = 30) {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get('http://127.0.0.1:8000/docs', (res) => {
        if (res.statusCode === 200 || res.statusCode === 307) {
          resolve(true);
        } else if (attempts < maxAttempts) {
          setTimeout(check, 500);
        } else {
          resolve(false);
        }
      });
      req.on('error', () => {
        if (attempts < maxAttempts) {
          setTimeout(check, 500);
        } else {
          resolve(false);
        }
      });
      req.setTimeout(2000, () => {
        req.destroy();
        if (attempts < maxAttempts) {
          setTimeout(check, 500);
        } else {
          resolve(false);
        }
      });
    };
    check();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "AOS — AI Operating System",
    icon: path.join(__dirname, 'aos_logo.png'),
    show: false,
    backgroundColor: '#f4f7fb',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });

  // Show a loading message while backend starts
  mainWindow.loadURL(`data:text/html;charset=utf-8,
    <html>
    <head>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet">
      <style>
        body {
          margin: 0; display: flex; align-items: center; justify-content: center;
          height: 100vh; background: #f4f7fb; font-family: 'Plus Jakarta Sans', sans-serif;
          flex-direction: column; gap: 16px;
        }
        .spinner {
          width: 40px; height: 40px; border: 4px solid #e5e7eb;
          border-top-color: #2563eb; border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        h2 { color: #111827; font-size: 20px; font-weight: 700; }
        p { color: #6b7280; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="spinner"></div>
      <h2>Starting AOS...</h2>
      <p>Launching backend services, please wait</p>
    </body>
    </html>
  `);
  mainWindow.show();

  mainWindow.webContents.setUserAgent(mainWindow.webContents.getUserAgent() + " Electron");

  console.log('Waiting for backend to become ready...');
  const backendReady = await waitForBackend(30);
  
  if (backendReady) {
    console.log('Backend is ready! Loading application...');
    mainWindow.loadFile('ide.html');
  } else {
    console.warn('Backend did not respond in time. Loading app anyway...');
    mainWindow.loadFile('ide.html');
  }
}

function killBackendProcess() {
  isAppQuitting = true;
  if (backendProcess) {
    try {
      if (process.platform === 'win32') {
        exec(`taskkill /pid ${backendProcess.pid} /T /F`, () => {});
      } else {
        backendProcess.kill('SIGTERM');
      }
    } catch(e) {}
    backendProcess = null;
  }
}

app.whenReady().then(async () => {
  await startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  killBackendProcess();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  killBackendProcess();
});

