import { execFileSync } from "node:child_process";

/**
 * active.mjs —— 判断目录对应的软件「是否正在使用/常用」。
 *
 * 用于修复:冷废弃(D)误判 —— 已装软件(如 Docker/Typora)的程序安装目录
 * 只在安装当天写一次 mtime,之后每天运行也不会再改动该目录,导致
 * "lastAccess 超 180 天"被误判为"废弃"。这里用"进程是否在跑 + 常用白名单"
 * 作为更可靠的"是否还在用"信号,命中则不判冷废弃。
 */

/**
 * 常用/常驻服务白名单:这些软件的目录名命中即视为"仍在用",永不判冷废弃。
 * 即使扫描那一刻恰好没有前台进程(如开机自启、后台服务),也不误报。
 */
export const ALWAYS_ACTIVE = [
  "docker", "com.docker", "wsl", "vmcompute", "lxss",
  "dotnet", "nodejs",
  "clash", "netease",
];

/** 快照当前所有运行进程的 ProcessName(小写、去重)。一次扫描只需调一次。 */
export function snapshotProcessNames() {
  try {
    const raw = execFileSync("powershell", ["-NoProfile", "-Command",
      "Get-Process -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName | Sort-Object -Unique"], {
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 8 * 1024 * 1024,
    }).toString();
    return raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.toLowerCase());
  } catch {
    return [];
  }
}

/**
 * 目录对应软件是否仍在用。
 * @param {string} name     目录名(可能带空格,如 "Docker"/"TRAE SOLO CN")
 * @param {string[]} procNames 运行中进程名快照(小写)
 * @returns {boolean} true=仍在用(不判废弃)/ false=可视为未用
 */
export function isActive(name, procNames) {
  const n = normalize(name);
  if (!n) return false;

  // 1) 常用白名单:命中即视为在用
  for (const a of ALWAYS_ACTIVE) {
    if (n.includes(normalize(a))) return true;
  }

  // 2) 进程匹配:任一运行进程名包含目录名(归一化后),视为在用。
  //    注:进程名是"运行实例"的最直接证据,例如 Docker 运行时会有
  //    docker / com.docker.backend / dockerdesktop 等进程。
  for (const p of procNames) {
    const pn = normalize(p);
    if (pn.includes(n)) return true;
  }

  return false;
}

/** 归一化:小写,去除非字母数字(用于宽松匹配) */
function normalize(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
