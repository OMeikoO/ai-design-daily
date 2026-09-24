// 浮生 · AI 内容层
// 设计目标：不只触发固定文案模板。当无合适固定事件、或进入回望/结局时，
// 由 AI 依据“玩家意图（当前状态画像）”动态生成旁白/选项/结局。
//
// 架构：AIProvider 接口 + RuleProvider（规则兜底）+ LLMProvider（可插拔大模型）。
// 引擎通过 ai.current() 取当前 provider；未配置或失败时自动回退 RuleProvider。

import { EVENTS, AMBIENT, TRANSITIONS, STAGES, ENDING_TEMPLATES, GRADES } from './data.js';

// ---------------- 意图分析：把玩家当前状态压缩成“叙事意图” ----------------
// 这是“更智能化”的核心：不靠模板命中，而是先读懂“玩家这一刻是什么处境”。
export function analyzeIntent(state){
  const stage = state.currentStage;
  const a = state.attrs;
  const flags = state.flags;
  const ageY = state.ageWeeks/52;

  const tags = [];
  const moods = [];

  // 年龄节奏意图
  if (stage==='S1'||stage==='S2') tags.push('childhood_passive');        // 被动感知
  if (stage==='S4'||stage==='S5') tags.push('coming_of_age');            // 成长阵痛
  if (stage==='S7'||stage==='S8') tags.push('midlife_weight');           // 中年重压
  if (stage==='S10') tags.push('looking_back');                         // 回望

  // 情绪意图
  if (a.mood<=3){ tags.push('low_spirit'); moods.push('提不起劲','沉默','想躲开'); }
  else if (a.mood>=8){ tags.push('buoyant'); moods.push('轻快','想笑'); }
  else moods.push('平静','寻常');

  // 属性画像意图
  if (a.intel>=8) tags.push('bookish');
  if (a.charm>=7) tags.push('liked');
  if (a.health<=3) tags.push('frail');
  if (a.family>=8) tags.push('well_off');
  if (a.family<=2) tags.push('struggling');

  // 关键 flag 意图
  if (flags.includes('mortgage')) tags.push('debt_pressure');
  if (flags.includes('laid_off_35')||flags.includes('paycut_35')) tags.push('job_shaken');
  if (flags.includes('had_child')) tags.push('parenthood');
  if (flags.includes('heartbroken')) tags.push('heartache');
  if (flags.includes('widowed')) tags.push('loss');
  if (flags.includes('beidrift')||flags.includes('stay_big_city')) tags.push('drifting');

  return { stage, ageY, tags, moods, attrs:{...a}, flags:[...flags] };
}

// 把状态序列化为给 LLM 的“人物小传”（压缩上下文，控成本）
function stateToBrief(state){
  const a = state.attrs;
  const ageY = Math.floor(state.ageWeeks/52);
  const stageName = (STAGES.find(s=>s.code===state.currentStage)||{}).name||'';
  const keyFlags = state.flags.slice(-12).join('、') || '无';
  return [
    `年龄 ${ageY} 岁（${stageName}），生于 ${state.birthYear} 年`,
    `颜值${a.charm} 智力${a.intel} 体质${a.health} 家境${a.family} 心境${a.mood}`,
    `近况标志：${keyFlags}`,
  ].join('；');
}

// ---------------- Provider 接口 ----------------
class AIProvider{
  get name(){ return 'base'; }
  async ambient(state){ throw new Error('not impl'); }      // 兜底旁白节点
  async dynamicNode(state){ throw new Error('not impl'); }  // 当无固定事件时生成节点
  async transition(state){ throw new Error('not impl'); }    // 衔接上一选择的过渡旁白
  async retrospective(state){ throw new Error('not impl'); }
  async endingNarrative(state){ throw new Error('not impl'); }
}

// ---------------- 规则 Provider（基线，永远可用） ----------------
class RuleProvider extends AIProvider{
  get name(){ return 'rule'; }
  constructor(){ super(); this._usedAmbient = {}; this._usedTransitions = {}; }
  _pickAmbient(stage){
    const pool = AMBIENT[stage]||AMBIENT.S10;
    // 旁白彻底去重：记录每阶段已用索引，强制不重复，池耗尽 80% 才重置
    if (!this._usedAmbient[stage]) this._usedAmbient[stage] = [];
    if (this._usedAmbient[stage].length >= Math.ceil(pool.length * 0.8)){
      this._usedAmbient[stage] = this._usedAmbient[stage].slice(-Math.floor(pool.length*0.2));
    }
    let idx;
    const tried = new Set();
    do {
      idx = Math.floor(Math.random()*pool.length);
      tried.add(idx);
    } while (this._usedAmbient[stage].includes(idx) && tried.size < pool.length);
    this._usedAmbient[stage].push(idx);
    return pool[idx];
  }
  async ambient(state){
    // 按阶段大步快进（3:1 pacing），避免反复兜底导致重复
    const stage = state.currentStage;
    let weeks = 2;
    if (stage==='S1') weeks = 24 + Math.floor(Math.random()*16);      // 24-40 周
    else if (stage==='S2') weeks = 16 + Math.floor(Math.random()*10); // 16-26 周
    else if (stage==='S3') weeks = 10 + Math.floor(Math.random()*8);  // 10-18 周
    else if (stage==='S4'||stage==='S5'||stage==='S6') weeks = 4 + Math.floor(Math.random()*5);
    else if (stage==='S7'||stage==='S8'||stage==='S9') weeks = 6 + Math.floor(Math.random()*7);
    else if (stage==='S10') weeks = 8 + Math.floor(Math.random()*9);
    return { narration: this._pickAmbient(stage), choices: [], timeAdvanceWeeks: weeks, source:'rule' };
  }
  async dynamicNode(state){
    // 规则模式：中后期无固定事件时，纯旁白 + 阶段快进过渡。
    // 选择交给固定事件（每阶段10+个）与启用 AI 时的 LLM 生成，避免装饰性微选择把节奏拖垮。
    const intent = analyzeIntent(state);
    const lines = [];
    if (intent.tags.includes('low_spirit')) lines.push(intent.moods[0]?`最近总${intent.moods[0]}。`:'最近总提不起劲。');
    if (intent.tags.includes('debt_pressure')) lines.push('手机又弹了条还款提醒。你按掉没看。');
    if (intent.tags.includes('parenthood') && intent.stage.startsWith('S8')) lines.push('孩子作业还没写完，你盯着看了会儿。');
    if (intent.tags.includes('drifting')) lines.push('地铁又晚点了。人群沉默地挪动。');
    if (intent.tags.includes('frail')) lines.push('今天膝盖又有点疼。');
    if (intent.tags.includes('looking_back')) lines.push('阳光晒得人发困。你想起了很远的事。');
    const narration = lines.length ? lines.join('') : this._pickAmbient(state.currentStage);
    const stage = state.currentStage;
    let w = 2;
    if (stage==='S4'||stage==='S5'||stage==='S6') w = 4 + Math.floor(Math.random()*5);
    else if (stage==='S7'||stage==='S8'||stage==='S9') w = 6 + Math.floor(Math.random()*7);
    else if (stage==='S10') w = 8 + Math.floor(Math.random()*9);
    return { narration, choices: [], timeAdvanceWeeks: w, source:'rule', intent };
  }
  async transition(state){
    // 衔接上一选择 → 引出下一场景。规则模式从 TRANSITIONS 池取一段，彻底去重。
    const stage = state.currentStage;
    const pool = TRANSITIONS[stage]||TRANSITIONS.S10;
    if (!this._usedTransitions[stage]) this._usedTransitions[stage] = [];
    if (this._usedTransitions[stage].length >= Math.ceil(pool.length * 0.8)){
      this._usedTransitions[stage] = this._usedTransitions[stage].slice(-Math.floor(pool.length*0.2));
    }
    let idx;
    const tried = new Set();
    do {
      idx = Math.floor(Math.random()*pool.length);
      tried.add(idx);
    } while (this._usedTransitions[stage].includes(idx) && tried.size < pool.length);
    this._usedTransitions[stage].push(idx);
    return { transition: pool[idx], source:'rule' };
  }
  async retrospective(state){
    // 复用 data.js 的回望逻辑（flag 驱动），规则兜底
    const ev = EVENTS.find(e=>e.id==='s10_lookback');
    if (ev && ev.narration) return { narration: ev.narration(state), source:'rule' };
    return { narration:'你想起很多个下午，阳光斜斜地照进来。', source:'rule' };
  }
  async endingNarrative(state){
    for (const t of ENDING_TEMPLATES){
      if (t.condition(state)){
        const score = scoreState(state);
        const grade = matchGrade(score);
        return { narrative: t.text(state), grade, score, source:'rule' };
      }
    }
    return { narrative:'寻常人寻常一生。', grade:GRADES[1], score:scoreState(state), source:'rule' };
  }
}

// ---------------- LLM Provider（可插拔大模型，失败回退规则） ----------------
class LLMProvider extends AIProvider{
  constructor(config){ super(); this.config = config; this.rule = new RuleProvider(); }
  get name(){ return 'llm'; }
  _available(){ return !!(this.config.enabled && this.config.endpoint && this.config.model); }

  async _chat(system, user, schemaHint){
    if (!this._available()) throw new Error('ai-not-configured');
    const body = {
      model: this.config.model,
      messages:[
        { role:'system', content: system },
        { role:'user', content: user },
      ],
      temperature: 0.85,
      max_tokens: 600,
    };
    // 通用 OpenAI 兼容 /chat/completions
    const res = await fetch(this.config.endpoint, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        ...(this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('ai-http-'+res.status);
    const data = await res.json();
    const txt = data?.choices?.[0]?.message?.content || '';
    if (!txt) throw new Error('ai-empty');
    return txt.trim();
  }

  // 系统提示词：约束 AI 遵守《浮生》文案规范（克制白描、不玩梗、≤60字）
  _systemPrompt(){
    return [
      '你是文字人生游戏《浮生》的叙事引擎。用克制、白描、感官化的旁白还原普通人一生。',
      '规则：1) 单段旁白不超过60字；2) 不许用网络梗、不抒情、不评判、不剧透未来；',
      '3) 第一人称内视角（童年可写“你”）；4) 选项不超过4个、每项≤12字、每个选项须改台词或属性或埋远期后果，禁止伪选择；',
      '5) 时代细节优先（粮票、下海、考公、房贷、口罩等）替代梗；6) 平凡温暖与困顿并存，不刻意悲苦。',
      '必须返回严格JSON，不要任何多余文字。',
    ].join('');
  }

  async ambient(state){
    if (!this._available()) return this.rule.ambient(state);
    try{
      const intent = analyzeIntent(state);
      const txt = await this._chat(this._systemPrompt(),
        `玩家此刻：${stateToBrief(state)}。意图标签：${intent.tags.join('、')||'无'}。\n`+
        `生成一段此刻的旁白（纯白描，不给选项）。只返回JSON：{"narration":"..."}。`);
      const o = JSON.parse(stripFence(txt));
      if (!o.narration) throw new Error('bad-json');
      return { narration:o.narration, choices:[], timeAdvanceWeeks:2, source:'llm', intent };
    }catch(e){ return this.rule.ambient(state); }
  }

  async dynamicNode(state){
    if (!this._available()) return this.rule.dynamicNode(state);
    try{
      const intent = analyzeIntent(state);
      const user =
        `玩家此刻：${stateToBrief(state)}。\n意图：${intent.tags.join('、')||'寻常'}。\n`+
        `生成一个剧情节点：一段旁白 + 2~3个选项。每个选项含 effects（仅限 charm/intel/health/family/mood 的 +/-1 数值）与 timeAdvanceWeeks(0~12 整数)。\n`+
        `只返回JSON：{"narration":"...","choices":[{"text":"...","effects":{},"timeAdvanceWeeks":N}]}。`;
      const txt = await this._chat(this._systemPrompt(), user);
      const o = JSON.parse(stripFence(txt));
      const choices = (o.choices||[]).map(c=>({ text:String(c.text).slice(0,12), effects:cleanEffects(c.effects), timeAdvanceWeeks:clampWeeks(c.timeAdvanceWeeks) }));
      return { narration:String(o.narration||'').slice(0,120), choices, timeAdvanceWeeks: choices.length?0:2, source:'llm', intent };
    }catch(e){ return this.rule.dynamicNode(state); }
  }

  async retrospective(state){
    if (!this._available()) return this.rule.retrospective(state);
    try{
      const user =
        `玩家已至暮年。一生关键选择：${state.flags.slice(-16).join('、')||'无'}。\n`+
        `写一段第一人称回忆，回引他做过的具体选择（读 flags 推断），克制、不煽情，≤80字。\n`+
        `只返回JSON：{"narration":"..."}。`;
      const txt = await this._chat(this._systemPrompt(), user);
      const o = JSON.parse(stripFence(txt));
      if (!o.narration) throw new Error('bad-json');
      return { narration:o.narration, source:'llm' };
    }catch(e){ return this.rule.retrospective(state); }
  }
  async transition(state){
    if (!this._available()) return this.rule.transition(state);
    try{
      const intent = analyzeIntent(state);
      const user =
        `玩家刚才做了一个选择："${state.lastChoiceText||'（无）'}"。现在 ${Math.floor(state.ageWeeks/52)} 岁（${(STAGES.find(s=>s.code===state.currentStage)||{}).name||''}）。\n`+
        `意图：${intent.tags.join('、')||'寻常'}。\n`+
        `写一句承接这个选择、引出接下来场景的过渡旁白（≤30字，第二人称"你"，克制白描，不剧透未来）。\n`+
        `只返回JSON：{"transition":"..."}。`;
      const txt = await this._chat(this._systemPrompt(), user);
      const o = JSON.parse(stripFence(txt));
      if (!o.transition) throw new Error('bad-json');
      return { transition:String(o.transition).slice(0,50), source:'llm' };
    }catch(e){ return this.rule.transition(state); }
  }

  async endingNarrative(state){
    if (!this._available()) return this.rule.endingNarrative(state);
    try{
      const score = scoreState(state);
      const grade = matchGrade(score);
      const user =
        `玩家一生结束。画像：${stateToBrief(state)}。享年${Math.floor(state.ageWeeks/52)}。\n`+
        `关键选择（按序）：${state.flags.slice(-24).join('、')||'无'}。\n`+
        `写一段200~400字的一生回望散文，引用他做过的3~5个具体选择。克制、不抒情、中性收束。叙事为主。\n`+
        `只返回JSON：{"narrative":"..."}。`;
      const txt = await this._chat(this._systemPrompt(), user);
      const o = JSON.parse(stripFence(txt));
      if (!o.narrative) throw new Error('bad-json');
      return { narrative:o.narrative, grade, score, source:'llm' };
    }catch(e){ return this.rule.endingNarrative(state); }
  }
}

// ---------------- 工具 ----------------
function stripFence(s){ // 去掉 ```json 包裹
  let t = s.trim();
  if (t.startsWith('```')) t = t.replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  return t;
}
function clampWeeks(n){ n = parseInt(n,10); if (isNaN(n)||n<0) return 2; if (n>12) return 12; return n; }
function cleanEffects(e){
  const out={}; if (!e||typeof e!=='object') return out;
  for (const k of ['charm','intel','health','family','mood']){
    if (typeof e[k]==='number') out[k] = Math.max(-3, Math.min(3, e[k]|0));
  }
  return out;
}
export function scoreState(state){
  const a=state.attrs; const peak=a.charm+a.intel+a.health+a.family+a.mood;
  const moodAvg = state._moodSum!=null && state._moodCount ? state._moodSum/state._moodCount : a.mood;
  return Math.round(peak*4 + moodAvg*4);
}
export function matchGrade(score){ return [...GRADES].reverse().find(g=>score>=g.min)||GRADES[0]; }

// ---------------- 单例：当前 provider + 配置持久化 ----------------
const STORAGE_KEY = 'fusheng_ai_config_v1';
let _config = loadConfig();
let _llm = new LLMProvider(_config);

export function getAIConfig(){ return {..._config}; }
export function setAIConfig(cfg){
  _config = { ..._config, ...cfg };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_config));
  _llm = new LLMProvider(_config);
}
function loadConfig(){
  try{ const r = JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); return { endpoint:r.endpoint||'', apiKey:r.apiKey||'', model:r.model||'', enabled:!!r.enabled }; }
  catch{ return { endpoint:'', apiKey:'', model:'', enabled:false }; }
}

// 统一入口：引擎只调用 ai.current()，永远不抛（失败回退规则）
const ruleProvider = new RuleProvider();
export function current(){
  if (_config.enabled && _config.endpoint && _config.model) return _llm;
  return ruleProvider;
}
export function isAIActive(){ return _config.enabled && !!_config.endpoint && !!_config.model; }

export { RuleProvider, LLMProvider };
