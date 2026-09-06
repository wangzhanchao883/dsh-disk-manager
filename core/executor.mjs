import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";

/**
 * executor.mjs —— 执行引擎。
 * 动作:
 *   delete  删缓存(仅 A)
 *   junction 把目录物理搬到目标盘,C 盘原位建 junction(仅 A/C)
 *   redirect 引导用户走官方设置改址(B),或直接设环境变量
 *
 * 所有操作都用 -LiteralPath / 关闭软件前提;每步返回 before/after 供 undo。
 * 注意:junction 需要目标盘的父目录存在、且源目录可用(软件已关闭)。
 */

function ps(Script) {
  return execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", Script], {
    maxBuffer: 256 * 1024 * 1024,
    timeout: 600000,
    encoding: "utf8",
  }).toString();
}

function dirSizeMB(p) {
  try {
    const s = ps(`$ErrorActionPreference='SilentlyContinue'; [math]::Round(((Get-ChildItem -LiteralPath '${p.replace(/'/g, "''")}' -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum)/1MB,1)`);
    const n = Number(s.trim());
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

/** 删除类操作:仅信任调用方已将 category 过滤为 A */
async function deleteDir(action, config) {
  const p = action.path;
  if (!p || !existsSync(p)) return { ok: false, message: "路径不存在" };
  const before = dirSizeMB(p);
  try {
    rmSync(p, { recursive: true, force: true });
    return { ok: true, message: `已删除 ${p}`, before, after: 0 };
  } catch (e) {
    return { ok: false, message: `删除失败(可能被占用): ${e.message}`, before };
  }
}

/**
 * junction 搬家:物理 Move-Item 到 target,再在源位置建 junction。
 * target 由调用方按 "D:\\AppCache\\<软件>" 拼好传入(action.target)。
 */
async function junctionMove(action, config) {
  const src = action.path;
  const dst = action.target; // 完整目标,如 D:\AppCache\Notion\Partitions
  if (!src || !dst || !existsSync(src)) return { ok: false, message: "源路径不存在或未给目标" };
  if (!/^[A-Za-z]:\\/.test(dst)) return { ok: false, message: "目标盘格式无效" };
  const before = dirSizeMB(src);
  try {
    const script = `
$ErrorActionPreference='Stop'
$src='${src.replace(/'/g, "''")}'
$dst='${dst.replace(/'/g, "''")}'
New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force | Out-Null
if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Recurse -Force }
Move-Item -LiteralPath $src -Destination $dst -Force
New-Item -ItemType Junction -Path $src -Target $dst -Force | Out-Null
(Get-Item -LiteralPath $src -Force).LinkType
`;
    const link = ps(script).trim();
    if (link !== "Junction") {
      return { ok: false, message: `junction 建立失败(link=${link})`, before };
    }
    return { ok: true, message: `已搬到 ${dst} 并建立 junction`, before, after: 0, target: dst };
  } catch (e) {
    return { ok: false, message: `junction 搬移失败: ${e.message}`, before };
  }
}

/** B 类:引导改址。这里不直接改软件,返回指引文案;同时可对支持环境变量的设好变量 */
async function redirectGuide(action, config) {
  const name = action.name || action.path;
  const drive = config.targetDrive || "D";
  let hint = `请打开 ${name} 的设置,把数据/缓存位置改到 ${drive}: 盘,然后重启该软件。`;
  if (/npm|node/i.test(name)) hint = `在终端执行: npm config set cache "${drive}:\\npm-cache"`;
  else if (/pnpm/i.test(name)) hint = `在终端执行: pnpm config set store-dir "${drive}:\\pnpm-store"`;
  else if (/pip/i.test(name)) hint = `设置环境变量 PIP_CACHE_DIR="${drive}:\\pip-cache",或 pip config set global.cache-dir`;
  else if (/docker|wsl/i.test(name)) hint = `Docker Desktop → Settings → Resources → Advanced → Disk image location 改为 ${drive}:\\docker\\DockerDesktopWSL,Apply & Restart。`;
  return { ok: true, message: `引导改址(未自动改)`, hint, before: dirSizeMB(action.path), after: null };
}

/** 冷废弃软件(D):只提示,不执行任何删除/搬迁 */
async function abandonHint(action) {
  return { ok: true, message: `提示:你可能很久没用了。要不要卸载?`, hint: action.path };
}

const BASE = "D:\\AppCache";

/** 对一条 action 分派到具体执行器 */
export async function dispatch(action, config) {
  const map = {
    delete: deleteDir,
    junction: junctionMove,
    redirect: redirectGuide,
    abandon: abandonHint,
  };
  const fn = map[action.action];
  if (!fn) return { ok: false, message: `未知动作 ${action.action}` };
  return fn(action, config);
}

export { dirSizeMB, BASE };
