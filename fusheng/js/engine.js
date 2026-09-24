// 浮生 · 引擎层
// 事件触发优先级链（设计 §5.2）：主分支 → 属性阈值 → 年龄段 → 时代 → 关系 → AI 兜底
// + 状态管理 / Flags / 存档 / 时间快进硬校验（≤12 周）

import { EVENTS, STAGES, TALENTS, ERA_EVENTS, MAX_AGE_WEEKS } from './data.js';
import { current as currentAI, analyzeIntent, RuleProvider } from './ai.js';

const SAVE_KEY = 'fusheng_save_v1';

// ---------------- 工具：requirement 表达式求值 ----------------
// 支持 ">=5" "<=3" ">4" "<6" "==7" "!=0"
function evalReq(req, attrs, flags){
  if (!req) return true;
  for (const k in req){
    const v = req[k];
    if (k==='flags'){
      // 任意一个 flag 存在即满足（用于 excludeIf 时反向）
      const arr = Array.isArray(v)?v:[v];
      if (!arr.some(f=>flags.includes(f))) return false;
      continue;
    }
    if (!(k in attrs)) continue;
    const op = String(v).match(/^([<>=!]=?)(-?\d+)$/);
    if (!op) continue;
    const val = +op[2], opf = op[1];
    const cur = attrs[k];
    if (opf==='>=' && !(cur>=val)) return false;
    if (opf==='<=' && !(cur<=val)) return false;
    if (opf==='>'  && !(cur>val))  return false;
    if (opf==='<'  && !(cur<val))  return false;
    if (opf==='==' && !(cur===val)) return false;
    if (opf==='!=' && !(cur!==val)) return false;
  }
  return true;
}

// excludeIf：满足任一排除条件则跳过
function isExcluded(ev, state){
  if (!ev.excludeIf) return false;
  for (const k in ev.excludeIf){
    if (k==='flags'){
      const arr = Array.isArray(ev.excludeIf.flags)?ev.excludeIf.flags:[ev.excludeIf.flags];
      if (arr.some(f=>state.flags.includes(f))) return true;
    }
  }
  return false;
}

function stageOf(ageWeeks){
  // 用整数岁匹配 ageRange，避免 3岁29周(=3.558)落入 S1[0,3]/S2[4,6] 整数空隙被误判为 S10
  const y = Math.floor(ageWeeks/52);
  for (const s of STAGES){ if (y>=s.ageRange[0] && y<=s.ageRange[1]) return s.code; }
  return ageWeeks/52 > STAGES[STAGES.length-1].ageRange[1] ? 'S10' : 'S1';
}
function stageName(code){ return (STAGES.find(s=>s.code===code)||{}).name||''; }

// ---------------- 状态 ----------------
export function newRun(birthYear, attrs, talentIds){
  const state = {
    birthYear,
    ageWeeks: 0,
    attrs: { charm:1, intel:1, health:1, family:1, mood:5, ...attrs },
    flags: [],
    talents: talentIds,
    history: [],
    currentStage: 'S1',
    _moodSum: 5, _moodCount: 1,
    _triggered: [],          // 已触发的 once 事件 id
    _eraFired: [],           // 已触发的时代事件 id
    _familyBonusYear: -1,    // 城中村 18 岁起每 5 年家境+1 跟踪
  };
  // 应用天赋
  for (const tid of talentIds){
    const t = TALENTS.find(x=>x.id===tid); if (!t) continue;
    applyEffects(state, t.effects||{});
    if (t.flag) state.flags.push(t.flag);
  }
  state.currentStage = stageOf(state.ageWeeks);
  return state;
}

// 应用属性变化，并按上限 clamp；记录心境均值
export function applyEffects(state, effects){
  const caps = {};
  // 从天赋读取 caps
  for (const tid of state.talents){
    const t = TALENTS.find(x=>x.id===tid);
    if (t && t.caps) Object.assign(caps, t.caps);
  }
  for (const k in effects){
    if (!(k in state.attrs)) continue;
    let v = state.attrs[k] + effects[k];
    if (caps[k]!=null) v = Math.min(v, caps[k]);
    v = Math.max(0, Math.min(12, v));            // 硬上下限 0~12（天赋可超 10）
    state.attrs[k] = v;
  }
}

// ---------------- 触发引擎 ----------------
export function pickNext(state){
  const ageY = state.ageWeeks/52;
  state.currentStage = stageOf(state.ageWeeks);

  // 城中村逆袭线：18 岁起每 5 年家境+1
  if (state.talents.includes('chengCun')){
    if (ageY>=18 && state._familyBonusYear<0){ state._familyBonusYear = 18; state.attrs.family = Math.min(12, state.attrs.family+1); }
    else if (state._familyBonusYear>0 && ageY>=state._familyBonusYear+5){
      state._familyBonusYear += 5; state.attrs.family = Math.min(12, state.attrs.family+1);
    }
  }

  // 1. 主分支 / nextNode 跳转优先
  // 2. 属性阈值事件
  // 3. 年龄段事件
  // 4. 时代事件
  // 5. AI 兜底（动态节点）
  const candidates = [];
  for (const ev of EVENTS){
    if (ev.weight<=0) continue;
    if (ev.stage!==state.currentStage) continue;
    const [a0,a1] = ev.ageRange;
    if (ageY<a0 || ageY>a1+0.99) continue;
    if (ev.once && state._triggered.includes(ev.id)) continue;
    if (isExcluded(ev, state)) continue;
    if (!evalReq(ev.requirement, state.attrs, state.flags)) continue;
    candidates.push(ev);
  }
  // 主分支强制
  const main = candidates.filter(e=>e.kind==='mainBranch');
  if (main.length){ const ev = pickWeighted(main); return resolveNode(state, ev); }

  // 属性阈值
  const thr = candidates.filter(e=>e.kind==='threshold');
  if (thr.length){ const ev = pickWeighted(thr); return resolveNode(state, ev); }

  // 年龄段
  const stage = candidates.filter(e=>e.kind==='stage');
  if (stage.length && Math.random()<0.7){ const ev = pickWeighted(stage); return resolveNode(state, ev); }

  // 时代事件（出生年+年龄命中真实年份）
  const calYear = state.birthYear + Math.floor(ageY);
  const era = ERA_EVENTS.find(e=>e.triggerYear===calYear && !state._eraFired.includes(e.id));
  if (era){ state._eraFired.push(era.id); return { id:era.id, stage:state.currentStage, narration:era.narration, choices:[], timeAdvanceWeeks:2, kind:'era', source:'era' }; }

  // 关系事件（父母线简化：30 岁后随机一次父母唠叨）
  if (ageY>=30 && !state._triggered.includes('rel_parent') && Math.random()<0.25){
    state._triggered.push('rel_parent');
    return { id:'rel_parent', stage:state.currentStage, narration:'母亲打电话来，问你吃没吃饭。说了十分钟，又说没事。', choices:[{ text:'嗯嗯啊啊', effects:{mood:+0}, timeAdvanceWeeks:2 }], timeAdvanceWeeks:2, kind:'relation', source:'rule' };
  }

  // AI 兜底：动态节点（可走 LLM 或规则）
  return null; // 交由 main 调用 ai.current().dynamicNode(state) 生成
}

// nextNode 跳转：返回指定事件（result 节点）
export function jumpTo(state, nodeId){
  const ev = EVENTS.find(e=>e.id===nodeId);
  if (!ev) return null;
  return resolveNode(state, ev);
}

function resolveNode(state, ev){
  if (ev.once) state._triggered.push(ev.id);
  const narration = typeof ev.narration==='function' ? ev.narration(state) : ev.narration;
  return {
    id: ev.id, stage: ev.stage, narration, kind: ev.kind,
    choices: (ev.choices||[]).map(c=>({
      ...c,
      locked: c.requirement ? !evalReq(c.requirement, state.attrs, state.flags) : false,
      narration: typeof c.narration==='function' ? c.narration(state) : c.narration,
    })),
    timeAdvanceWeeks: ev.timeAdvanceWeeks || 0,
    source:'rule',
  };
}

function pickWeighted(arr){
  const total = arr.reduce((s,e)=>s+(e.weight||1),0);
  let r = Math.random()*total;
  for (const e of arr){ r -= (e.weight||1); if (r<=0) return e; }
  return arr[arr.length-1];
}

// ---------------- 执行一次选择 ----------------
export function applyChoice(state, node, choiceIndex){
  const choice = node.choices?.[choiceIndex];
  if (!choice || choice.locked) return null;
  // 时间快进硬校验（设计 §11.5）
  const adv = clampWeeks(choice.timeAdvanceWeeks || 0);
  applyEffects(state, choice.effects||{});
  if (choice.setFlags) for (const f of choice.setFlags) if (!state.flags.includes(f)) state.flags.push(f);
  // 记录节点日志（用于回望/时间轴）
  pushHistory(state, node, choice);
  // 心境均值统计
  state._moodSum += state.attrs.mood; state._moodCount += 1;
  state.ageWeeks += adv;
  return choice;
}
// 纯旁白节点推进：前期大步快进不受 12 周硬限（clampAmbientWeeks 上限 60）
export function applyAmbientAdvance(state, node, weeks){
  pushHistory(state, node, null);
  state._moodSum += state.attrs.mood; state._moodCount += 1;
  state.ageWeeks += clampAmbientWeeks(weeks||2);
}
function clampAmbientWeeks(n){ n=parseInt(n,10); if(isNaN(n)||n<0)return 2; if(n>60)return 60; return n; }

function pushHistory(state, node, choice){
  state.history.push({
    nodeId: node.id,
    ageWeeks: state.ageWeeks,
    narration: node.narration,
    choiceText: choice ? choice.text : null,
    flagsSet: choice?.setFlags||[],
    source: node.source||'rule',
  });
}

function clampWeeks(n){ n=parseInt(n,10); if(isNaN(n)||n<0)return 2; if(n>12)return 12; return n; }

// ---------------- 回望 / 结局 ----------------
export async function buildEnding(state){
  // 叙事结局优先交给 AI（若启用）
  const ai = currentAI();
  let r;
  try{ r = await ai.endingNarrative(withMoodAvg(state)); }
  catch{ r = await new RuleProvider().endingNarrative(withMoodAvg(state)); }
  return r;
}
export async function buildRetrospective(state){
  const ai = currentAI();
  try{ return await ai.retrospective(withMoodAvg(state)); }
  catch{ return { narration:'你想起很多个下午，阳光斜斜地照进来。', source:'rule' }; }
}
// AI 意图（暴露给 UI 调试 / 未来扩展）
export function getIntent(state){ return analyzeIntent(state); }

function withMoodAvg(state){
  // 给结局模板一个 moodAvg 字段
  return { ...state, moodAvg: state._moodSum / Math.max(1,state._moodCount) };
}

// ---------------- 存档 ----------------
export function save(state){ localStorage.setItem(SAVE_KEY, JSON.stringify(state)); return true; }
export function load(){ try{ return JSON.parse(localStorage.getItem(SAVE_KEY)||'null'); }catch{ return null; } }
export function clearSave(){ localStorage.removeItem(SAVE_KEY); }
export function hasSave(){ return !!localStorage.getItem(SAVE_KEY); }

export { stageOf, stageName, MAX_AGE_WEEKS };
