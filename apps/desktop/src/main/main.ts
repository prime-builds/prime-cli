import path from "path";
import fs from "fs";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { Engine, EngineIpcServer } from "../../../../packages/engine/src";
import { Logger } from "../../../../packages/engine/src/logger";
import { ElectronIpcTransport } from "./ipc";

let mainWindow: BrowserWindow | null = null;
let engine: Engine | null = null;

const logLevel = (process.env.PRIME_LOG_LEVEL ?? "info") as "debug" | "info" | "warn" | "error";
const logger = new Logger(logLevel);

async function createEngine(): Promise<Engine> {
  const userData = app.getPath("userData");
  const dbPath = path.join(userData, "prime-cli.db");
  const artifactsDir = path.join(userData, "artifacts");
  const instance = new Engine({ dbPath, artifactsDir, logLevel }, { logger });
  await instance.start();
  return instance;
}

async function createWindow(): Promise<void> {
  const preloadPath = path.join(__dirname, "preload.js");
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#0f1115",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    const indexPath = path.join(__dirname, "..", "renderer", "index.html");
    await mainWindow.loadFile(indexPath);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function setupIpc(instance: Engine): Promise<void> {
  const transport = new ElectronIpcTransport(logger);
  const server = new EngineIpcServer(instance, transport, logger);
  transport.attach();
  server.attach();

  ipcMain.handle("prime:dialog:openFolder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle("prime:dialog:openFiles", async (_event, filters?: Array<{ name: string; extensions: string[] }>) => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters
    });
    if (result.canceled) {
      return [] as string[];
    }
    return result.filePaths;
  });

  ipcMain.handle("prime:file:read", async (_event, filePath: string) => {
    return fs.readFileSync(filePath, "utf8");
  });
}

async function bootstrap(): Promise<void> {
  await app.whenReady();
  engine = await createEngine();
  await setupIpc(engine);
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  if (engine) {
    await engine.stop();
    engine = null;
  }
});

void bootstrap();
