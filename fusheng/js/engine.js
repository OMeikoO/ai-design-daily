// 浮生 · 引擎层 v2 · 选择强联动版
// 核心改造：选择可带 nextEvent，直接推入"待触发队列"，实现上下文强关联
// 旁白去重：记录每阶段已用旁白，强制不重复
// 打破时间限制：移除75岁硬上限，改为健康耗尽或老年随机自然死亡

import { EVENTS, STAGES, TALENTS, ERA_EVENTS, MAX_AGE_WEEKS, DEATH_EVENTS } from './data.js';
import { current as currentAI, analyzeIntent, RuleProvider } from './ai.js';

const SAVE_KEY = 'fusheng_save_v2';

// ---------------- 工具：requirement 表达式求值 ----------------
function evalReq(req, attrs, flags){
  if (!req) return true;
  for (const k in req){
    const v = req[k];
    if (k==='flags'){
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
  const y = Math.floor(ageWeeks/52);
  for (const s of STAGES){ if (y>=s.ageRange[0] && y<=s.ageRange[1]) return s.code; }
  return y > STAGES[STAGES.length-1].ageRange[1] ? 'S10' : 'S1';
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
    _triggered: [],
    _eraFired: [],
    _familyBonusYear: -1,
    lastChoiceText: null,
    pendingEvents: [],          // 待触发队列：选择→后果强联动的核心
    _usedAmbient: {},          // 每阶段已用旁白索引，强制去重
    _usedTransitions: {},      // 每阶段已用过渡旁白索引
    recentChoices: [],         // 最近5次选择文本，供新事件引用上下文
    _deathRoll: 0,             // 老年死亡累积概率
  };
  for (const tid of talentIds){
    const t = TALENTS.find(x=>x.id===tid); if (!t) continue;
    applyEffects(state, t.effects||{});
    if (t.flag) state.flags.push(t.flag);
  }
  state.currentStage = stageOf(state.ageWeeks);
  return state;
}

export function applyEffects(state, effects){
  const caps = {};
  for (const tid of state.talents){
    const t = TALENTS.find(x=>x.id===tid);
    if (t && t.caps) Object.assign(caps, t.caps);
  }
  for (const k in effects){
    if (!(k in state.attrs)) continue;
    let v = state.attrs[k] + effects[k];
    if (caps[k]!=null) v = Math.min(v, caps[k]);
    v = Math.max(0, Math.min(12, v));
    state.attrs[k] = v;
  }
}

// ---------------- 触发引擎 v2 ----------------
export function pickNext(state){
  const ageY = state.ageWeeks/52;
  state.currentStage = stageOf(state.ageWeeks);

  // 城中村逆袭线
  if (state.talents.includes('chengCun')){
    if (ageY>=18 && state._familyBonusYear<0){ state._familyBonusYear = 18; state.attrs.family = Math.min(12, state.attrs.family+1); }
    else if (state._familyBonusYear>0 && ageY>=state._familyBonusYear+5){
      state._familyBonusYear += 5; state.attrs.family = Math.min(12, state.attrs.family+1);
    }
  }

  // 0. 死亡检查：65岁后每年累积死亡概率（打破75岁硬上限）
  if (ageY>=65){
    state._deathRoll += 1;
    // 每年+3%概率，health低额外+5%，心境低额外+3%
    const deathChance = state._deathRoll * 0.03 + (state.attrs.health<=3?0.05:0) + (state.attrs.mood<=3?0.03:0);
    if (Math.random() < deathChance){
      return makeDeathNode(state);
    }
  }
  // 健康归零直接死亡
  if (state.attrs.health<=0 && ageY>0){
    return makeDeathNode(state);
  }

  // 1. 待触发队列优先（选择→后果强联动）：取队列第一个
  if (state.pendingEvents && state.pendingEvents.length){
    const evId = state.pendingEvents.shift();
    const ev = EVENTS.find(e=>e.id===evId);
    if (ev){
      // 仍需校验 requirement（如属性不够则跳过）
      if (!isExcluded(ev, state) && evalReq(ev.requirement, state.attrs, state.flags)){
        return resolveNode(state, ev);
      }
    }
  }

  // 2. 主分支 / 属性阈值 / 年龄段 / 时代 / AI 兜底
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
  const main = candidates.filter(e=>e.kind==='mainBranch');
  if (main.length){ const ev = pickWeighted(main); return resolveNode(state, ev); }

  const thr = candidates.filter(e=>e.kind==='threshold');
  if (thr.length){ const ev = pickWeighted(thr); return resolveNode(state, ev); }

  const stage = candidates.filter(e=>e.kind==='stage');
  if (stage.length && Math.random()<0.7){ const ev = pickWeighted(stage); return resolveNode(state, ev); }

  const calYear = state.birthYear + Math.floor(ageY);
  const era = ERA_EVENTS.find(e=>e.triggerYear===calYear && !state._eraFired.includes(e.id));
  if (era){ state._eraFired.push(era.id); return { id:era.id, stage:state.currentStage, narration:era.narration, choices:[], timeAdvanceWeeks:2, kind:'era', source:'era' }; }

  return null;
}

// 构造死亡节点
function makeDeathNode(state){
  const y = Math.floor(state.ageWeeks/52);
  const pool = DEATH_EVENTS[y>=75?'old':(y>=60?'senior':'mid')];
  const narration = pool[Math.floor(Math.random()*pool.length)];
  return {
    id:'_death', stage:state.currentStage, narration, choices:[], timeAdvanceWeeks:0,
    kind:'death', source:'rule', isDeath:true,
  };
}

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
  const adv = clampWeeks(choice.timeAdvanceWeeks || 0);
  applyEffects(state, choice.effects||{});
  if (choice.setFlags) for (const f of choice.setFlags) if (!state.flags.includes(f)) state.flags.push(f);
  // 选择→后果强联动：若选择带 nextEvent，推入待触发队列，下一节点立即承接
  if (choice.nextEvent){
    const ids = Array.isArray(choice.nextEvent) ? choice.nextEvent : [choice.nextEvent];
    for (const id of ids) state.pendingEvents.push(id);
  }
  pushHistory(state, node, choice);
  state._moodSum += state.attrs.mood; state._moodCount += 1;
  state.ageWeeks += adv;
  state.lastChoiceText = choice.text;
  // 记录最近5次选择，供新事件引用上下文
  state.recentChoices.push(choice.text);
  if (state.recentChoices.length > 5) state.recentChoices.shift();
  return choice;
}

export function applyAmbientAdvance(state, node, weeks){
  pushHistory(state, node, null);
  state._moodSum += state.attrs.mood; state._moodCount += 1;
  state.ageWeeks += clampAmbientWeeks(weeks||2);
}

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
function clampAmbientWeeks(n){ n=parseInt(n,10); if(isNaN(n)||n<0)return 2; if(n>60)return 60; return n; }

// ---------------- 回望 / 结局 ----------------
export async function buildEnding(state){
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
export function getIntent(state){ return analyzeIntent(state); }

function withMoodAvg(state){
  return { ...state, moodAvg: state._moodSum / Math.max(1,state._moodCount) };
}

// ---------------- 存档 ----------------
export function save(state){ localStorage.setItem(SAVE_KEY, JSON.stringify(state)); return true; }
export function load(){ try{ return JSON.parse(localStorage.getItem(SAVE_KEY)||'null'); }catch{ return null; } }
export function clearSave(){ localStorage.removeItem(SAVE_KEY); }
export function hasSave(){ return !!localStorage.getItem(SAVE_KEY); }

export { stageOf, stageName, MAX_AGE_WEEKS };
