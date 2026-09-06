import { classify as ruleClassify, isCategory, CATEGORY_META } from "./riskmap.mjs";
import { loadClassifyCache, saveClassifyCache } from "../config.mjs";

/**
 * classify.mjs —— 分类引擎,三级:
 *   1) 静态规则库 riskmap(确定,零成本)
 *   2) 本地分类缓存 classify-cache(用户之前确认过的,跳过 LLM)
 *   3) LLM 兜底:特征包 -> LLM 判断类别 -> 人工确认 -> 回写缓存
 *
 * 红线(E)强规则:任何 config/storage/memory/database/.openviking/.qclaw 特征,
 * 即使 LLM 判错,也不自动执行(由 safety.mjs 最终兜底)。
 */

/** 把目录特征包组装成给 LLM 的提示文本 */
function buildLlmPrompt(feature) {
  const subs = (feature.subdirs || []).join("、") || "(空)";
  return `你是一个 Windows 磁盘清理参谋。下面是一个占用 ${feature.sizeMB ?? "?"} MB 的目录,请判断它属于哪一类。

目录名: ${feature.name}
完整路径: ${feature.path}
一级子目录: ${subs}

类别定义:
A 无忧缓存 —— Cache/GPUCache/Code Cache/Temp/log/updater 等,可再生,可删或 junction 搬
B 官方可改址 —— 软件自己支持改存储位置(Docker/npm/pnpm/浏览器profile等)
C 可junction搬 —— 软件不支持改址但数据纯可再生(视频剪辑/聊天/Notion/游戏客户端等)
D 冷废弃软件 —— 很久没用的大体积软件
E 配置/记忆(红线) —— Config/Storage/IndexedDB/MEMORY/数据库/.openviking/.qclaw 等,绝不能动

只返回一个 JSON,不要其他文字:
{"category":"A|B|C|D|E","confidence":"high|medium|low","reason":"一句话依据","recommendedAction":"建议动作"}`;
}

/**
 * LLM 兜底判断。通过 ctx.llm? 调用 DSH 自带通道。
 * 若 DSH 通道不可用,返回 { category:null, needUser:true },让前端请求人工确认。
 */
async function llmClassify(ctx, feature) {
  try {
    const prompt = buildLlmPrompt(feature);
    if (!ctx.llm || typeof ctx.llm.call !== "function") {
      throw new Error("DSH LLM 通道不可用");
    }
    const resp = await ctx.llm.call(prompt);
    const text = typeof resp === "string" ? resp : resp?.content ?? JSON.stringify(resp);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("LLM 返回无 JSON");
    const parsed = JSON.parse(match[0]);
    const cat = String(parsed.category || "").trim().toUpperCase();
    if (!isCategory(cat)) throw new Error(`LLM 返回非法类别: ${cat}`);
    return {
      category: cat,
      confidence: parsed.confidence || "medium",
      reason: parsed.reason || "LLM 判断",
      recommendedAction: parsed.recommendedAction || "",
      source: "llm",
    };
  } catch (e) {
    return { category: null, confidence: "low", reason: `LLM 失败: ${e.message}`, source: "llm-failed", needUser: true };
  }
}

/**
 * 主分类入口。
 * @param {object} entry 扫描条目 { name, path, sizeMB, subdirs, lastAccess }
 * @param {object} opts  { config, ctx, targetDrive }
 * @returns {object} 最终分类,含 category/source/confidence/reason/needUser
 */
export async function classifyEntry(entry, opts) {
  const { config, ctx } = opts;
  const cache = loadClassifyCache();

  // 1) 静态规则库
  const rule = ruleClassify(entry);
  if (rule.category) {
    // 规则判为 E 或其他,且用户曾确认过则直接采纳 confirm;否则用规则
    if (rule.confidence === "high") {
      return { ...rule, source: "rule" };
    }
  }

  // 2) 本地分类缓存(基于目录名特征签名)
  const sig = featureSignature(entry);
  const cached = cache[entry.name] || cache[sig];
  if (cached && isCategory(cached.category)) {
    return { category: cached.category, reason: cached.reason || "本地缓存", confidence: cached.confidence || "medium", source: "cache" };
  }

  // 3) LLM 兜底
  const feature = { name: entry.name, path: entry.path, sizeMB: entry.sizeMB, subdirs: entry.subdirs };
  const llm = await llmClassify(ctx, feature);
  if (llm.category) {
    // 强红线:LLM 判错但特征命中红线 -> 回退 E
    if (looksLikeRedline(feature)) {
      return { category: "E", reason: "特征命中红线,LLM 判断被回退为 E", confidence: "high", source: "redline-override", llm: llm.category };
    }
    return { ...llm, needUser: true, source: "llm" };
  }

  // LLM 失败 -> 需要人工
  return { category: null, confidence: "low", reason: llm.reason || "无法自动分类,请人工指定", source: "unclassified", needUser: true };
}

/** 强红线:特征命中 config/storage/memory/database/.点目录 等 */
function looksLikeRedline(feature) {
  const n = feature.name.toLowerCase();
  if (n.startsWith(".")) return true; // .openviking/.qclaw/.config 等点目录一律红线
  return /memory|sqlite|database|indexeddb|\.openviking|\.qclaw|storage/.test(n);
}

/** 目录分类签名:名称 + 是否有 cache/config/storage 大字样 */
function featureSignature(entry) {
  const n = entry.name.toLowerCase();
  return `${n}|${/cache|temp|log|updater/i.test(n) ? "c" : "-"}|${/config|setting|prefer/i.test(n) ? "s" : "-"}|${/storage|indexeddb|memory|database/.test(n) ? "d" : "-"}`;
}

/** 用户确认后回写本地缓存 */
export function recordUserDecision(entry, category, reason = "") {
  if (!isCategory(category)) return;
  const cache = loadClassifyCache();
  const sig = featureSignature(entry);
  cache[entry.name] = { category, reason, confidence: "high", confirmedAt: new Date().toISOString() };
  cache[sig] = { category, reason, confidence: "high", confirmedAt: new Date().toISOString() };
  saveClassifyCache(cache);
}

export { CATEGORY_META };
