import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * scanner.mjs —— C 盘扫描引擎(Windows / PowerShell 后端)。
 * 只读,不删不搬。产出扫描条目:[{ name, path, sizeMB, subdirs, lastAccess, zone }]。
 *
 * zone 标明条目来自哪个扫描区,供分类器决定语义优先级:
 *   appdata   —— AppData 用户缓存/数据区(Local/Roaming)
 *   program   —— Program Files 里的软件(大类,多为软件本体,判 E 保护 + 冷废弃提示)
 *   user      —— 用户 profile 顶层(Downloads/Documents/Desktop 等个人文件,只提醒不自动删)
 */

/** 用 PowerShell 批量递归统计体积(比 Node 快),返回 { path -> sizeMB } 一次性拿回 */
function batchSizes(paths) {
  const results = {};
  if (!paths.length) return results;
  try {
    const ps = `
$ErrorActionPreference='SilentlyContinue'
$paths = @(${paths.map((p) => `"${p.replace(/"/g, '""')}"`).join(",")})
$items = @()
foreach ($p in $paths) {
  if (Test-Path -LiteralPath $p) {
    $s = (Get-ChildItem -LiteralPath $p -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    $items += [pscustomobject]@{ p=$p; mb=[math]::Round($s/1MB,1) }
  }
}
$items | ConvertTo-Json -Compress`;
    const raw = execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], {
      maxBuffer: 512 * 1024 * 1024,
      timeout: 600000,
    }).toString();
    const parsed = JSON.parse(raw || "[]");
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of arr) if (item && item.p) results[item.p] = item.mb;
  } catch {
    /* 某个目录扫描失败,跳过;由调用方逐目录 fallback */
  }
  return results;
}

/** 读取一个目录的一级子目录名(用于特征) */
function listSubdirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .slice(0, 50);
  } catch {
    return [];
  }
}

/** 读取最后访问时间(近似取目录下最新文件 mtime,网络/cache 不一定可靠,仅作 D 类参考) */
function lastAccess(dir) {
  try {
    let max = 0;
    const files = readdirSync(dir, { withFileTypes: true }).slice(0, 200);
    for (const d of files) {
      const p = join(dir, d.name);
      try {
        const st = statSync(p);
        const t = st.mtimeMs;
        if (t > max) max = t;
        if (d.isDirectory() && max === 0) {
          const sub = lastAccess(p);
          if (sub > max) max = sub;
        }
      } catch {
        /* ignore */
      }
    }
    return max;
  } catch {
    return Date.now();
  }
}

/** 扩展 scanRoots 为 [{ root, zone }] 形式:兼容字符串数组 */
function normalizeRoots(scanRoots) {
  return (scanRoots || []).map((r) =>
    typeof r === "string"
      ? { root: r, zone: zoneForPath(r) }
      : { root: r.root, zone: r.zone || "appdata" },
  );
}

/** 按路径推断 zone(兼容旧的字符串形式) */
function zoneForPath(p) {
  if (/[Pp]rogram [Ff]iles/.test(p)) return "program";
  if (/[Aa]pp[Dd]ata/.test(p)) return "appdata";
  if (/[Uu]sers/.test(p)) return "user";
  return "appdata";
}

/**
 * 顶层扫描:对每个 scanRoot,列出其一级子目录,量体积,建条目(带 zone)。
 * 返回 [{ name, path, sizeMB, subdirs, lastAccess, zone }] 按体积降序。
 */
export async function scan(config, onProgress = () => {}) {
  const output = [];
  const roots = normalizeRoots(config.scanRoots || []);
  for (const { root, zone } of roots) {
    onProgress(`扫描 ${root} ...`);
    let names = [];
    try {
      names = readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      continue;
    }
    if (!names.length) continue;

    const fullPaths = names.map((n) => join(root, n));
    const sizeMap = batchSizes(fullPaths);

    for (const n of names) {
      // user 区跳过 AppData(已由 appdata 根单独扫,避免重复)
      if (zone === "user" && /^[Aa]pp[Dd]ata$/.test(n)) continue;
      const p = join(root, n);
      const sizeMB = sizeMap[p] ?? null;
      output.push({
        name: n,
        path: p,
        sizeMB,
        subdirs: listSubdirs(p),
        lastAccess: lastAccess(p),
        zone,
      });
      onProgress(`  ${n}: ${sizeMB ?? "?"} MB`);
    }
  }
  output.sort((a, b) => (b.sizeMB ?? 0) - (a.sizeMB ?? 0));
  return output;
}

export { lastAccess };
