import express, { Request, Response } from 'express';
import cors from 'cors';
import { writeFile, readFile, mkdir, rm } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import util from 'util';
import os from 'os';
import { LANGUAGES } from './config/languages';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const execPromise = util.promisify(exec);
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Compilation cache
const compilationCache = new Map<string, { wasm: string; wasmExec?: string; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour
const MAX_CACHE_SIZE = 100;

// Request queue
const requestQueue: Array<() => Promise<void>> = [];
let activeCompilations = 0;
const MAX_CONCURRENT_COMPILATIONS = 4;

// Container pool
const containerPool: Record<string, string[]> = {};
for (const lang of Object.keys(LANGUAGES)) {
  containerPool[lang] = [];
}

let poolInitializing = false;
let poolReady = false;
let poolInitPromise: Promise<void> | null = null;

async function initPool() {
  if (poolReady) return;
  if (poolInitializing && poolInitPromise) return poolInitPromise;
  
  poolInitializing = true;
  poolInitPromise = (async () => {
    try {
      console.log("� Checking Docker connection...");
      await execPromise("docker version");
    } catch (err) {
      console.error("❌ CRITICAL: Docker is not running or not accessible!");
      console.error("Please start Docker Desktop and restart the backend.");
      poolInitializing = false;
      poolReady = false;
      return;
    }

    console.log(" Warming up container pool...");
    const promises = [];
    for (const config of Object.values(LANGUAGES)) {
      const lang = config.id;
      const poolSize = config.poolSize;
      for (let i = 0; i < poolSize; i++) {
        const containerName = `wasm-pool-${lang}-${i}`;
        const checkPromise = execPromise(`docker ps -a --filter "name=${containerName}" --format "{{.Names}}"`)
          .then(async ({ stdout }) => {
            if (stdout.trim() === containerName) {
              const { stdout: stateOut } = await execPromise(`docker inspect -f "{{.State.Running}}" ${containerName}`);
              if (stateOut.trim() === 'true') {
                containerPool[lang].push(containerName);
                console.log(`♻️  Reusing: ${containerName}`);
              } else {
                await execPromise(`docker start ${containerName}`);
                containerPool[lang].push(containerName);
                console.log(`🔄 Restarted: ${containerName}`);
              }
            } else {
              await execPromise(`docker run -d --name ${containerName} ${config.dockerImage} tail -f /dev/null`);
              containerPool[lang].push(containerName);
              console.log(`✅ Created: ${containerName}`);
            }
          })
          .catch((err) => console.error(`❌ Failed to warm ${containerName}:`, err.message));
        promises.push(checkPromise);
      }
    }
    await Promise.all(promises);
    poolReady = true;
    poolInitializing = false;
    console.log("🚀 Container pool ready!");
  })();
  return poolInitPromise;
}

// Periodic health check
setInterval(async () => {
  console.log("🔧 Running periodic pool health check...");
  for (const [lang, containers] of Object.entries(containerPool)) {
    for (const containerName of containers) {
      try {
        await execPromise(`docker restart ${containerName}`);
        console.log(`🔄 Restarted ${containerName}`);
      } catch (err) {
        console.error(`❌ Failed to restart ${containerName}:`, err);
      }
    }
  }
}, 6 * 60 * 60 * 1000);

function getCacheKey(language: string, code: string): string {
  return crypto.createHash('sha256').update(`${language}:${code}`).digest('hex');
}

function cleanCache() {
  const now = Date.now();
  const entries = Array.from(compilationCache.entries());
  for (const [key, value] of entries) {
    if (now - value.timestamp > CACHE_TTL) compilationCache.delete(key);
  }
  if (compilationCache.size > MAX_CACHE_SIZE) {
    const sorted = entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = sorted.slice(0, compilationCache.size - MAX_CACHE_SIZE);
    toRemove.forEach(([key]) => compilationCache.delete(key));
  }
}

async function executeWithQueue<T>(fn: () => Promise<T>): Promise<T> {
  if (activeCompilations < MAX_CONCURRENT_COMPILATIONS) {
    activeCompilations++;
    try { return await fn(); }
    finally {
      activeCompilations--;
      const next = requestQueue.shift();
      if (next) next();
    }
  }
  return new Promise((resolve, reject) => {
    requestQueue.push(async () => {
      activeCompilations++;
      try { resolve(await fn()); }
      catch (error) { reject(error); }
      finally {
        activeCompilations--;
        const next = requestQueue.shift();
        if (next) next();
      }
    });
  });
}

async function getContainer(language: string): Promise<string> {
  const pool = containerPool[language];
  if (pool.length > 0) return pool.shift()!;
  const containerName = `wasm-temp-${language}-${Date.now()}`;
  const config = LANGUAGES[language];
  await execPromise(`docker run -d --name ${containerName} ${config.dockerImage} tail -f /dev/null`);
  console.log(`⚡ Created temp: ${containerName}`);
  return containerName;
}

async function releaseContainer(language: string, containerName: string) {
  const pool = containerPool[language];
  const poolSize = LANGUAGES[language]?.poolSize || 2;
  if (pool.length < poolSize && containerName.includes("pool")) {
    pool.push(containerName);
  } else {
    try { await execPromise(`docker rm -f ${containerName}`); } catch (e) {}
  }
}

app.post('/api/compile', async (req: Request, res: Response) => {
  if (!poolReady) await initPool();
  
  const startTime = Date.now();
  const { language, code } = req.body;

  if (!language || !code) {
    return res.status(400).json({ error: "Missing language or code" });
  }

  if (!LANGUAGES[language]) {
    return res.status(400).json({ error: "Unsupported language" });
  }

  const cacheKey = getCacheKey(language, code);
  const cached = compilationCache.get(cacheKey);
  if (cached) {
    console.log(`[${language}] ⚡ Cache hit!`);
    return res.json({ success: true, wasm: cached.wasm, wasmExec: cached.wasmExec, cached: true });
  }

  try {
    const result = await executeWithQueue(async () => {
      const config = LANGUAGES[language];
      const id = uuidv4();
      const tmpDir = path.join(os.tmpdir(), "wasm-compilers-express", id);
      let containerName = "";

      try {
        await mkdir(tmpDir, { recursive: true });
        await writeFile(path.join(tmpDir, config.filename), code);
        const absoluteTmpDir = path.resolve(tmpDir);
        
        containerName = await getContainer(language);
        console.log(`[${language}] Compiling with ${containerName}...`);
        
        await execPromise(`docker exec ${containerName} sh -c "cd /src && rm -f *"`).catch(() => {});
        await execPromise(`docker cp "${absoluteTmpDir}/." ${containerName}:/src/`);
        
        const { stdout, stderr } = await execPromise(`docker exec -w /src ${containerName} ${config.compileCmd}`, {
          maxBuffer: 10 * 1024 * 1024
        });
        
        await execPromise(`docker cp ${containerName}:/src/output.wasm "${absoluteTmpDir}/output.wasm"`);
        if (language === "go") {
          await execPromise(`docker cp ${containerName}:/src/wasm_exec.js "${absoluteTmpDir}/wasm_exec.js"`);
        }
        
        const wasmBuffer = await readFile(path.join(tmpDir, "output.wasm"));
        const wasmBase64 = wasmBuffer.toString('base64');
        
        let wasmExecContent = "";
        if (language === "go") {
          wasmExecContent = await readFile(path.join(tmpDir, "wasm_exec.js"), 'utf-8');
        }
        
        cleanCache();
        compilationCache.set(cacheKey, { wasm: wasmBase64, wasmExec: wasmExecContent, timestamp: Date.now() });
        
        await rm(tmpDir, { recursive: true, force: true });
        execPromise(`docker exec ${containerName} rm -rf /src/*`).catch(() => {});
        await releaseContainer(language, containerName);

        console.log(`[${language}] ✅ Success in ${Date.now() - startTime}ms`);
        return { success: true, wasm: wasmBase64, wasmExec: wasmExecContent };

      } catch (error: any) {
        if (containerName) await releaseContainer(language, containerName);
        try { await rm(tmpDir, { recursive: true, force: true }); } catch {}
        
        let cleanError = error.stderr || error.message || "Compilation failed";
        if (language === "cpp") {
          const match = cleanError.match(/(main\.cpp:[\s\S]*)/);
          if (match) cleanError = match[1];
          cleanError = cleanError.replace(/emcc: error:[\s\S]*/g, '').trim();
        } else if (language === "rust") {
          cleanError = cleanError.replace(/Command failed:.*?bash -c "[^"]+"/g, '');
          const lines = cleanError.split('\n');
          cleanError = lines.filter((l: string) => l.startsWith('error:') || l.startsWith('-->') || l.startsWith('|') || l.match(/^\d+\s*\|/)).join('\n').trim();
        } else {
          cleanError = cleanError.replace(/Command failed:.*?sh -c "[^"]+"/g, '').trim();
        }
        
        throw new Error(cleanError || "Compilation failed");
      }
    });

    res.json(result);
  } catch (err: any) {
    console.error("[Compile Error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(` WASM Compiler Backend running on port ${PORT}`);
  initPool();
});
