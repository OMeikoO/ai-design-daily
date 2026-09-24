// 浮生 · 数据层
// 事件池 / 天赋 / 时代事件 / 结局模板 / 段落旁白兜底
// 事件结构见设计文档 §5.1。kind 决定触发引擎优先级。

export const STAGES = [
  { code:'S1', name:'婴幼', ageRange:[0,3],  decisionRatio:0.12 },
  { code:'S2', name:'学龄前', ageRange:[4,6], decisionRatio:0.22 },
  { code:'S3', name:'小学',   ageRange:[7,12],decisionRatio:0.36 },
  { code:'S4', name:'初中',   ageRange:[13,15],decisionRatio:0.50 },
  { code:'S5', name:'高中',   ageRange:[16,18],decisionRatio:0.70 },
  { code:'S6', name:'大学',   ageRange:[19,22],decisionRatio:0.65 },
  { code:'S7', name:'立业',   ageRange:[23,30],decisionRatio:0.60 },
  { code:'S8', name:'成家立业',ageRange:[31,45],decisionRatio:0.75 },
  { code:'S9', name:'收尾',   ageRange:[46,60],decisionRatio:0.40 },
  { code:'S10',name:'暮年',   ageRange:[61,75],decisionRatio:0.25 },
];

export const MAX_AGE_WEEKS = 75 * 52 + 4; // 3904

// ---------- 天赋 ----------
export const TALENTS = [
  { id:'zaoHui',     name:'早慧',     desc:'智力+2，但心境上限-1',           effects:{intel:+2,mood:-1}, caps:{mood:9} },
  { id:'linJia',     name:'邻家小孩', desc:'颜值+1，家境+1',                 effects:{charm:+1,family:+1} },
  { id:'tiRuo',      name:'体弱多病', desc:'体质-2，但疾病事件获得额外旁白', effects:{health:-2} },
  { id:'chengCun',   name:'城中村',   desc:'家境-2，但 18 岁后家境每 5 年+1', effects:{family:-2}, flag:'shantytown' },
  { id:'zaoChan',    name:'早产儿',   desc:'体质上限锁 7，触发“奇迹康复”线索', effects:{health:0}, caps:{health:7}, flag:'preterm' },
  { id:'shuXiang',   name:'书香门第', desc:'智力+1，家境+1，18 岁触发“是否继承家业”', effects:{intel:+1,family:+1}, flag:'scholar' },
  { id:'leGuan',     name:'天生的乐天', desc:'心境+2，负面事件概率略降',       effects:{mood:+2} },
  { id:'muNe',       name:'内向寡言', desc:'颜值-1，但心境更稳（上限+1）',     effects:{charm:-1}, caps:{mood:11} },
  { id:'jianRen',    name:'韧骨头',   desc:'体质+2，暮年健康衰减减半',         effects:{health:+2}, flag:'tough' },
  { id:'minGan',     name:'敏感',     desc:'智力+1，但心境-2，更易触发回忆',    effects:{intel:+1,mood:-2}, flag:'sensitive' },
];

// ---------- 时代背景事件 ----------
// triggerYear = 出生年 + 年龄 命中的真实历史节点（仅作背景音，多不给选择）
export const ERA_EVENTS = [
  { id:'era_1978',  triggerYear:1978, narration:'广播里反复播报恢复高考的消息。父亲盯着收音机，半天没说话。' },
  { id:'era_1983',  triggerYear:1983, narration:'厂里发了第一台彩色电视。整条街的小孩都挤到你们家看《西游记》。' },
  { id:'era_1992',  triggerYear:1992, narration:'父亲说，单位有人“下海”了。饭桌上没人接话。' },
  { id:'era_1999',  triggerYear:1999, narration:'街角开了第一家网吧，五块钱一小时。' },
  { id:'era_2001',  triggerYear:2001, narration:'电视里一遍遍放申奥成功的画面。母亲在缝一条红裙子。' },
  { id:'era_2003',  triggerYear:2003, narration:'校门口有人卖板蓝根，卖空了。空气里都是消毒水的味道。' },
  { id:'era_2008',  triggerYear:2008, narration:'满大街都在说“股票”。父亲下班回来，脸色不太好。' },
  { id:'era_2020',  triggerYear:2020, narration:'你第一次戴上了口罩。街上空空荡荡，像被人按了静音。' },
  { id:'era_2022',  triggerYear:2022, narration:'宿舍又封了。泡面吃到最后，你闻见那味儿就想吐。' },
];

// ---------- 事件池 ----------
// kind: 'mainBranch'(主分支强制) | 'threshold'(属性阈值) | 'stage'(年龄段) | 'relation'(关系)
// effects: 对五维的 +/-；setFlags 设置标志；nextNode 跳转下一事件 id（可选）
export const EVENTS = [

  // ===== S1 婴幼 0-3 =====
  { id:'s1_birth', stage:'S1', ageRange:[0,0], kind:'mainBranch', weight:1000, once:true,
    narration:(s)=>`你出生在 ${s.birthYear} 年正月的${s.attrs.family>=7?'大':'北方小'}城。窗外下着雪。妈妈还没奶水，你哭了一整夜。`,
    choices:[] },
  { id:'s1_2m', stage:'S1', ageRange:[0,0], kind:'ambient', weight:5,
    narration:'爸爸请了三天假，第三天被叫回厂里。他亲了亲你的额头。', choices:[] },
  { id:'s1_walk', stage:'S1', ageRange:[1,2], kind:'threshold', weight:20, once:true, requirement:{health:'>=4'},
    narration:'你扶着沙发沿走了几步，扑进妈妈怀里。屋里腾起一阵笑声。',
    choices:[{ text:'笑出声', effects:{mood:+1}, timeAdvanceWeeks:3 },{ text:'哭了', effects:{mood:-1}, timeAdvanceWeeks:3 }] },
  { id:'s1_quarrel', stage:'S1', ageRange:[2,3], kind:'threshold', weight:25, once:true, requirement:{mood:'<=6'},
    narration:'夜里听见摔碗声。你把被子拉过头顶。',
    choices:[{ text:'闷头睡', effects:{mood:-1}, timeAdvanceWeeks:6, setFlags:['home_tense'] },
             { text:'爬起来看', effects:{mood:-2}, timeAdvanceWeeks:6, setFlags:['home_tense','witnessed_quarrel'] }] },

  // ===== S2 学龄前 4-6 =====
  { id:'s2_factory', stage:'S2', ageRange:[4,6], kind:'threshold', weight:30, once:true, requirement:{family:'<=5'},
    narration:'厂子黄了。爸爸开始整天坐在阳台抽烟，烟头攒了一罐子。',
    choices:[{ text:'拿走他的烟', effects:{mood:+1,family:+1}, timeAdvanceWeeks:8, narration:'爸爸愣了一下，把烟掐了。后来他再没在你面前抽过。', setFlags:['dad_quit_smoke'] },
             { text:'默默看他', effects:{mood:-1}, timeAdvanceWeeks:8, setFlags:['dad_smoking'] },
             { text:'出门找邻居小孩玩', effects:{charm:+1}, timeAdvanceWeeks:8, setFlags:['early_friend_circle'] }] },
  { id:'s2_kinder', stage:'S2', ageRange:[4,5], kind:'stage', weight:25, once:true,
    narration:'妈妈牵着你去幼儿园。你在门口死活不肯松手。',
    choices:[{ text:'哭着进去', effects:{mood:-1}, timeAdvanceWeeks:6 },
             { text:'被一个小朋友拉走', effects:{charm:+1,mood:+1}, timeAdvanceWeeks:6, setFlags:['first_friend'] },
             { text:'死活不去，回家', effects:{intel:+1,mood:0}, timeAdvanceWeeks:6, setFlags:['no_kinder'] }] },
  { id:'s2_lie', stage:'S2', ageRange:[5,6], kind:'stage', weight:20, once:true,
    narration:'你把碗摔碎了，跟妈妈说是猫干的。妈妈看了你半天。',
    choices:[{ text:'坚持是猫', effects:{mood:-1}, timeAdvanceWeeks:4, setFlags:['liar_early'] },
             { text:'承认', effects:{intel:+1,mood:+1}, timeAdvanceWeeks:4 }] },

  // ===== S3 小学 7-12 =====
  { id:'s3_cafe', stage:'S3', ageRange:[8,11], kind:'stage', weight:30, once:true,
    narration:'街角开了网吧，五块钱一小时。同桌的小明说带你去。',
    choices:[{ text:'去', effects:{intel:-1,mood:+2}, timeAdvanceWeeks:6, setFlags:['early_internet'] },
             { text:'不去', effects:{intel:+1}, timeAdvanceWeeks:6 },
             { text:'告诉老师', effects:{mood:-2,charm:-1}, timeAdvanceWeeks:6, setFlags:['tattle_tale'] }] },
  { id:'s3_class', stage:'S3', ageRange:[7,9], kind:'stage', weight:25, once:true, requirement:{family:'>=4'},
    narration:'妈妈问你报不报兴趣班。墙上贴着书法、钢琴、奥数三张招生简章。',
    choices:[{ text:'书法', effects:{intel:+1,mood:0}, timeAdvanceWeeks:24, setFlags:['hobby_calli'] },
             { text:'钢琴', effects:{charm:+1,mood:-1}, timeAdvanceWeeks:24, setFlags:['hobby_piano'] },
             { text:'奥数', effects:{intel:+2,mood:-2}, timeAdvanceWeeks:24, setFlags:['hobby_math'] },
             { text:'什么都不报', effects:{mood:+2}, timeAdvanceWeeks:24, setFlags:['free_childhood'] }] },
  { id:'s3_bully', stage:'S3', ageRange:[9,11], kind:'threshold', weight:25, once:true, requirement:{charm:'<=4'},
    narration:'有人把你的书包扔进水沟。你站在那儿，没敢吱声。',
    choices:[{ text:'忍了', effects:{mood:-2}, timeAdvanceWeeks:4, setFlags:['bullied'] },
             { text:'推回去', effects:{charm:+1,mood:-1,health:-1}, timeAdvanceWeeks:4 },
             { text:'告诉父母', effects:{mood:0}, timeAdvanceWeeks:4, setFlags:['told_parents'] }] },
  { id:'s3_popular', stage:'S3', ageRange:[9,11], kind:'threshold', weight:25, once:true, requirement:{charm:'>=6'},
    narration:'课间操时一圈人围着你转。班长塞给你一颗糖。',
    choices:[{ text:'分给同学', effects:{charm:+1,mood:+1}, timeAdvanceWeeks:4 },
             { text:'自己吃', effects:{mood:+1}, timeAdvanceWeeks:4 }] },
  { id:'s3_xiaoshengchu', stage:'S3', ageRange:[12,12], kind:'stage', weight:40, once:true,
    narration:'小升初。父母为择校吵了一架。',
    choices:[{ text:'去重点（托关系）', effects:{intel:+1,family:-1,mood:-1}, timeAdvanceWeeks:12, setFlags:['key_middle'], requirement:{family:'>=5'} },
             { text:'就近读普通校', effects:{mood:+1}, timeAdvanceWeeks:12 },
             { text:'回老家读', effects:{mood:-1}, timeAdvanceWeeks:12, setFlags:['left_behind'] }] },

  // ===== S4 初中 13-15 =====
  { id:'s4_crush', stage:'S4', ageRange:[14,15], kind:'threshold', weight:30, once:true, requirement:{charm:'>=5'},
    narration:'她在你前排，马尾一甩一甩。整节课你都在数她甩了几次。',
    choices:[{ text:'递纸条', effects:{mood:+2,charm:0}, timeAdvanceWeeks:6, setFlags:['first_crush'] },
             { text:'默默喜欢', effects:{mood:+1,intel:-1}, timeAdvanceWeeks:6 },
             { text:'假装不在意', effects:{mood:-1}, timeAdvanceWeeks:6 }] },
  { id:'s4_game', stage:'S4', ageRange:[13,15], kind:'threshold', weight:28, once:true, requirement:{intel:'<=6'},
    narration:'你在网吧通宵了一整夜。天亮出来，眼睛刺痛。',
    choices:[{ text:'继续沉迷', effects:{intel:-2,health:-1,mood:+2}, timeAdvanceWeeks:20, setFlags:['game_addict'] },
             { text:'被父亲抓回家', effects:{mood:-2,intel:-1}, timeAdvanceWeeks:8, setFlags:['caught_gaming'] }] },
  { id:'s4_rebel', stage:'S4', ageRange:[14,15], kind:'stage', weight:22, once:true,
    narration:'母亲翻你的抽屉。你当着她的面把日记撕了。',
    choices:[{ text:'摔门出去', effects:{mood:-2}, timeAdvanceWeeks:4, setFlags:['rebel'] },
             { text:'坐下来谈', effects:{intel:+1,mood:-1}, timeAdvanceWeeks:4 }] },
  { id:'s4_track', stage:'S4', ageRange:[15,15], kind:'stage', weight:30, once:true,
    narration:'文理分科表发下来了。你盯着“文科 / 理科”两个格看了很久。',
    choices:[{ text:'选理科', effects:{intel:+1}, timeAdvanceWeeks:12, setFlags:['track_science'] },
             { text:'选文科', effects:{intel:0,charm:+1}, timeAdvanceWeeks:12, setFlags:['track_arts'] }] },

  // ===== S5 高中 16-18 =====
  { id:'s5_pressure', stage:'S5', ageRange:[16,17], kind:'stage', weight:25, once:true,
    narration:'高三的倒计时牌每天翻一页。同桌开始掉头发。',
    choices:[{ text:'拼了命地学', effects:{intel:+2,health:-1,mood:-1}, timeAdvanceWeeks:24, setFlags:['grind'] },
             { text:'按部就班', effects:{intel:+1,mood:0}, timeAdvanceWeeks:24 },
             { text:'有点想放弃了', effects:{intel:-1,mood:-2}, timeAdvanceWeeks:24, setFlags:['senior_slump'] }] },
  // 主分支点 1：高考
  { id:'s5_gaokao', stage:'S5', ageRange:[18,18], kind:'mainBranch', weight:9999, once:true,
    narration:'六月的蝉叫得人心烦。准考证攥出汗，监考老师走过你身边停了一下。',
    choices:[
      { text:'认真答完每一题', effects:{mood:-1}, timeAdvanceWeeks:2, setFlags:['gaokao_normal'], nextNode:'s5_result_normal' },
      { text:'最后一道大题赌一把，写满', requirement:{intel:'>=6'}, effects:{mood:-2}, timeAdvanceWeeks:2, setFlags:['gaokao_gamble'], nextNode:'s5_result_gamble' },
      { text:'交白卷，回家', effects:{mood:+2,family:-2}, timeAdvanceWeeks:2, setFlags:['gaokao_dropout'], nextNode:'s5_result_dropout' },
    ] },
  { id:'s5_result_normal', stage:'S5', ageRange:[18,18], kind:'mainBranch', weight:0,
    narration:(s)=> s.attrs.intel>=7 ? '录取通知书来的时候，是个 211。父亲破天荒喝了酒。' : '录取通知书来的时候，是个普通二本。母亲把它压在了玻璃板下。',
    choices:[] },
  { id:'s5_result_gamble', stage:'S5', ageRange:[18,18], kind:'mainBranch', weight:0,
    narration:(s)=> s.attrs.intel>=8 ? '你赌对了。录取的是 985。后来很多年你都没再那么赌过。' : '赌输了。分数卡在一本线边上，最后去了个普通一本。',
    choices:[] },
  { id:'s5_result_dropout', stage:'S5', ageRange:[18,18], kind:'mainBranch', weight:0,
    narration:'你没再回学校。父亲半个月没跟你说话。',
    choices:[{ text:'南下打工', effects:{health:-1,mood:-1,family:-1}, timeAdvanceWeeks:24, setFlags:['south_migrant'] }] },

  // ===== S6 大学 19-22 =====
  { id:'s6_major', stage:'S6', ageRange:[19,19], kind:'stage', weight:25, once:true, excludeIf:{flags:['gaokao_dropout']},
    narration:'报到那天，你站在专业介绍栏前。有人劝你转计算机。',
    choices:[{ text:'学计算机', effects:{intel:+2,mood:0}, timeAdvanceWeeks:24, setFlags:['cs_major'] },
             { text:'学金融', effects:{intel:+1,family:+0}, timeAdvanceWeeks:24, setFlags:['fin_major'] },
             { text:'学中文', effects:{charm:+1,mood:+1}, timeAdvanceWeeks:24, setFlags:['lit_major'] }] },
  { id:'s6_club', stage:'S6', ageRange:[20,21], kind:'stage', weight:20, once:true, excludeIf:{flags:['gaokao_dropout']},
    narration:'社团招新摆了一条街。吉他社的学长冲你招手。',
    choices:[{ text:'加入吉他社', effects:{charm:+2,mood:+1}, timeAdvanceWeeks:12, setFlags:['guitar'] },
             { text:'加辩论队', effects:{intel:+1,charm:+1}, timeAdvanceWeeks:12, setFlags:['debate'] },
             { text:'都不加', effects:{mood:0,intel:+1}, timeAdvanceWeeks:12 }] },
  { id:'s6_love', stage:'S6', ageRange:[20,22], kind:'threshold', weight:25, once:true, requirement:{charm:'>=6'}, excludeIf:{flags:['gaokao_dropout','first_crush']},
    narration:'图书馆的灯总是亮到很晚。TA 把笔记推到你面前，说“借你”。',
    choices:[{ text:'在一起', effects:{mood:+3,charm:0}, timeAdvanceWeeks:20, setFlags:['college_love'] },
             { text:'装作没懂', effects:{mood:-1,intel:+1}, timeAdvanceWeeks:4 }] },
  { id:'s6_breakup', stage:'S6', ageRange:[22,22], kind:'threshold', weight:20, once:true, requirement:{}, excludeIf:{flags:['college_love','_none']},
    narration:'毕业季。你们在车站分了手，谁也没回头。',
    choices:[{ text:'流泪上车', effects:{mood:-3}, timeAdvanceWeeks:8, setFlags:['heartbroken'] },
             { text:'祝 TA 好', effects:{mood:-1,charm:+1}, timeAdvanceWeeks:8 }] },
  { id:'s6_grad', stage:'S6', ageRange:[22,22], kind:'stage', weight:30, once:true, excludeIf:{flags:['gaokao_dropout']},
    narration:'毕业典礼那天风很大。校长说“前程似锦”，你只觉得茫然。',
    choices:[{ text:'考研', effects:{intel:+2,mood:-1}, timeAdvanceWeeks:52, setFlags:['grad_school'] },
             { text:'直接就业', effects:{family:+0}, timeAdvanceWeeks:12, setFlags:['work_first'] },
             { text:'出国', requirement:{family:'>=7'}, effects:{intel:+2,family:-2}, timeAdvanceWeeks:52, setFlags:['study_abroad'] }] },

  // ===== S7 立业 23-30 =====
  { id:'s7_firstjob', stage:'S7', ageRange:[23,24], kind:'stage', weight:25, once:true, excludeIf:{flags:['gaokao_dropout','grad_school','study_abroad']},
    narration:'第一份工作的工牌是蓝色的。人事让你签名，你手有点抖。',
    choices:[{ text:'认真做事', effects:{intel:+1,mood:0}, timeAdvanceWeeks:24, setFlags:['diligent'] },
             { text:'摸鱼度日', effects:{mood:+1,intel:-1}, timeAdvanceWeeks:24, setFlags:['slacker'] }] },
  { id:'s7_rent', stage:'S7', ageRange:[24,26], kind:'stage', weight:22, once:true, excludeIf:{flags:['left_behind','south_migrant']},
    narration:'房租涨了三百。你在地铁里算了一遍又一遍。',
    choices:[{ text:'咬牙留下', effects:{mood:-1,family:-1}, timeAdvanceWeeks:24, setFlags:['beidrift'] },
             { text:'搬去合租', effects:{charm:+1,mood:0}, timeAdvanceWeeks:24 },
             { text:'回老家', effects:{mood:+1,family:+1}, timeAdvanceWeeks:24, setFlags:['back_home'] }] },
  // 主分支点 2：三十而立
  { id:'s7_thirty', stage:'S7', ageRange:[30,30], kind:'mainBranch', weight:9999, once:true,
    narration:(s)=> `三十岁生日那天，没人记得。你对着蛋糕上的蜡烛发了会儿呆。${s.flags.includes('beidrift')?'窗外是北方的雾霾。':''}`,
    choices:[
      { text:'留在大城市', effects:{mood:-1,family:-1}, timeAdvanceWeeks:4, setFlags:['stay_big_city'] },
      { text:'回老家考公', effects:{mood:+1,family:+1}, timeAdvanceWeeks:4, setFlags:['civil_servant'] },
      { text:'出国闯闯', requirement:{intel:'>=6'}, effects:{family:-2,mood:0}, timeAdvanceWeeks:4, setFlags:['go_abroad'] },
      { text:'创业', requirement:{family:'>=6',intel:'>=7'}, effects:{family:-2,mood:-1}, timeAdvanceWeeks:4, setFlags:['startup'] },
    ] },

  // ===== S8 成家立业 31-45 =====
  { id:'s8_marry', stage:'S8', ageRange:[28,32], kind:'threshold', weight:30, once:true, requirement:{charm:'>=5'},
    narration:'相亲第七个，你说就 TA 吧。领证那天，民政局人很多，没人看你们。',
    choices:[{ text:'办场婚礼', effects:{family:-2,mood:+2}, timeAdvanceWeeks:24, setFlags:['married'] },
             { text:'旅行结婚', effects:{mood:+1,family:0}, timeAdvanceWeeks:8, setFlags:['married'] }] },
  { id:'s8_house', stage:'S8', ageRange:[30,35], kind:'stage', weight:25, once:true, excludeIf:{flags:['back_home','civil_servant','_none']},
    narration:'售楼处的沙盘亮着灯。销售说“这户型就剩两套”。首付是两边父母凑的。',
    choices:[{ text:'咬牙买', effects:{family:-3,mood:-1}, timeAdvanceWeeks:24, setFlags:['mortgage'] },
             { text:'再等等', effects:{mood:0}, timeAdvanceWeeks:24, setFlags:['no_house'] }] },
  { id:'s8_child', stage:'S8', ageRange:[30,34], kind:'threshold', weight:25, once:true, requirement:{}, excludeIf:{flags:['_none']},
    narration:'孩子出生那天，你在产房外坐了一夜。护士出来说“母女平安”。',
    choices:[{ text:'好好养', effects:{family:-1,mood:+2}, timeAdvanceWeeks:24, setFlags:['had_child'] },
             { text:'交给老人带', effects:{mood:0,family:0}, timeAdvanceWeeks:24, setFlags:['had_child','grandparent_raise'] }] },
  { id:'s8_35crisis', stage:'S8', ageRange:[35,35], kind:'mainBranch', weight:9999, once:true, excludeIf:{flags:['civil_servant']},
    narration:'HR 找你谈话时，你正在改一份 PPT。她说了三句，你只听清“交接”。',
    choices:[
      { text:'拿赔偿走人', effects:{family:-1,mood:-2}, timeAdvanceWeeks:8, setFlags:['laid_off_35'] },
      { text:'降薪留下来', effects:{mood:-2,family:0}, timeAdvanceWeeks:8, setFlags:['paycut_35'] },
      { text:'自己单干', requirement:{intel:'>=6'}, effects:{family:-1,mood:-1}, timeAdvanceWeeks:8, setFlags:['solo_biz'] },
    ] },
  // 主分支点 3：中年抉择 45
  { id:'s8_fortyfive', stage:'S8', ageRange:[45,45], kind:'mainBranch', weight:9999, once:true,
    narration:(s)=>`四十五了。体检报告单上多了几个箭头。${s.flags.includes('had_child')?'孩子在青春期，关着门不理你。':''}`,
    choices:[
      { text:'跳槽搏一把', effects:{mood:-1,family:-1}, timeAdvanceWeeks:4, setFlags:['mid_leap'] },
      { text:'守成度日', effects:{mood:0,family:0}, timeAdvanceWeeks:4, setFlags:['mid_steady'] },
      { text:'提前退休照顾父母', effects:{mood:+1,family:-1}, timeAdvanceWeeks:4, setFlags:['early_retire_care'] },
    ] },

  // ===== S9 收尾 46-60 =====
  { id:'s9_physical', stage:'S9', ageRange:[48,52], kind:'stage', weight:25, once:true,
    narration:'体检报告：脂肪肝，血压偏高。医生让你少油少盐。',
    choices:[{ text:'开始跑步', requirement:{health:'>=4'}, effects:{health:+1,mood:+1}, timeAdvanceWeeks:24, setFlags:['morning_run'] },
             { text:'该吃吃该喝喝', effects:{health:-1,mood:+1}, timeAdvanceWeeks:24 }] },
  { id:'s9_childgaokao', stage:'S9', ageRange:[48,52], kind:'threshold', weight:25, once:true, requirement:{}, excludeIf:{flags:['_nochild']},
    narration:'孩子高考那天，你在考场外站了一上午。太阳很毒。',
    choices:[{ text:'默默等', effects:{mood:-1}, timeAdvanceWeeks:4, setFlags:['child_gaokao'] },
             { text:'回家做饭', effects:{mood:0}, timeAdvanceWeeks:4, setFlags:['child_gaokao'] }] },
  { id:'s9_parentill', stage:'S9', ageRange:[50,58], kind:'stage', weight:30, once:true,
    narration:'父亲住院了。走廊的灯白得刺眼，你守了三夜。',
    choices:[{ text:'陪到最后一刻', effects:{mood:-2,family:+1}, timeAdvanceWeeks:12, setFlags:['parent_passing'] },
             { text:'请护工，自己上班', effects:{mood:-1,family:-1}, timeAdvanceWeeks:12, setFlags:['parent_passing'] }] },
  { id:'s9_retire', stage:'S9', ageRange:[58,60], kind:'stage', weight:30, once:true,
    narration:'退休证是个小红本。领导说了句“辛苦了”，你拎着纸箱走出呆了二十年的楼。',
    choices:[{ text:'养花钓鱼', effects:{mood:+2,health:+0}, timeAdvanceWeeks:24, setFlags:['quiet_retire'] },
             { text:'带孙子', effects:{mood:+1,family:+1}, timeAdvanceWeeks:24, setFlags:['raise_grandchild'] },
             { text:'报老年大学', effects:{intel:+1,mood:+1}, timeAdvanceWeeks:24, setFlags:['senior_college'] }] },

  // ===== S10 暮年 61-75 ===== 回望机制读 flags
  { id:'s10_lookback', stage:'S10', ageRange:[63,66], kind:'mainBranch', weight:9999, once:true,
    narration:(s)=> {
      const lines = [];
      if (s.flags.includes('gaokao_gamble')) lines.push('你还记得十八岁那年赌了一把，把最后一道大题写满了。后来很多年，你都没再那么赌过。');
      else if (s.flags.includes('gaokao_normal')) lines.push('你还记得十八岁那个下午，窗外知了叫得厉害。你一道一道答完，没敢回头。');
      else if (s.flags.includes('gaokao_dropout')) lines.push('你还记得没去考的那年。卷子发下来那天，你在南下火车上睡了一路。');
      if (s.flags.includes('beidrift')||s.flags.includes('stay_big_city')) lines.push('你想起北漂那几年，地铁里挤得透不过气。');
      if (s.flags.includes('heartbroken')) lines.push('想起车站那次分手。后来你也再没那样喜欢过谁。');
      if (!lines.length) lines.push('你想起很多个下午，阳光斜斜地照进来。好像什么都发生了，又好像什么都没。');
      return lines.join(' ');
    }, choices:[] },
  { id:'s10_old_ill', stage:'S10', ageRange:[68,72], kind:'threshold', weight:25, once:true, requirement:{health:'<=4'},
    narration:'腿脚越来越沉。上三楼要歇两歇。',
    choices:[{ text:'坚持遛弯', effects:{health:0,mood:+1}, timeAdvanceWeeks:12 },
             { text:'坐轮椅让人推', effects:{mood:-1}, timeAdvanceWeeks:12, setFlags:['wheelchair'] }] },
  { id:'s10_spouse', stage:'S10', ageRange:[70,74], kind:'stage', weight:25, once:true,
    narration:'老伴走得那天，窗台上的君子兰开了第三茬。你没哭。',
    choices:[{ text:'把花搬进屋', effects:{mood:+1}, timeAdvanceWeeks:8, setFlags:['widowed'] },
             { text:'坐在阳台一整天', effects:{mood:-2}, timeAdvanceWeeks:8, setFlags:['widowed'] }] },
];

// ---------- 段落兜底旁白池（按阶段） ----------
export const AMBIENT = {
  S1:[
    '墙上的钟滴答，妈妈抱着你来回走。',
    '你抓着妈妈的手指，攥得很紧。',
    '窗外有麻雀叫。阳光照在摇篮边上。',
  ],
  S2:[
    '你在院子里追一只黄猫，追了一下午。',
    '电视里在放动画，你看了半集就睡着了。',
  ],
  S3:[
    '放学路上，你踩着地上的影子走。',
    '蝉叫了一整天，作业本被风吹翻了好几页。',
  ],
  S4:[
    '晚自习的灯管嗡嗡响。你盯着窗外发呆。',
    '你在本子边缘画了一只小恐龙。',
  ],
  S5:[
    '试卷摞起来比字典还厚。墨水的味道你闻了一整年。',
    '食堂的饭很难吃，你还是吃了三年。',
  ],
  S6:[
    '宿舍的灯十一点准时熄。你打着手电看小说。',
    '操场上有人在弹吉他，断断续续的。',
  ],
  S7:[
    '地铁里的人都不说话。你也学会了不说话。',
    '加班到凌晨，路灯把影子拉得很长。',
  ],
  S8:[
    '孩子的作业本摊了一桌。你辅导到第九遍时，声音提高了。',
    '账单、房贷、物业费，摞成一摞。',
  ],
  S9:[
    '体检报告单你看了三遍，每个箭头都查了百度。',
    '同事的退休欢送会上，你说了句“保重”，没再说别的。',
  ],
  S10:[
    '电视开着，你没看。窗台上的君子兰开了第三茬。',
    '老花镜找不到了，你摸索了半天。',
    '阳光晒得人发困。你想起了很远的事。',
  ],
};

// ---------- 结局 ----------
// grade 数值评级 6 档；narrative 根据 flags 组合的叙事结局
export const GRADES = [
  { id:'g1', name:'潦草', min:0,  desc:'一生仓促，许多事来不及。' },
  { id:'g2', name:'寻常', min:18, desc:'平平稳稳，没什么大事。' },
  { id:'g3', name:'安稳', min:26, desc:'有苦有甜，终归有个着落。' },
  { id:'g4', name:'体面', min:34, desc:'该有的都有，体面收场。' },
  { id:'g5', name:'丰盈', min:42, desc:'一生饱满，少有遗憾。' },
  { id:'g6', name:'未尽', min:50, desc:'纵有万千，仍有未尽之愿。' },
];

// 叙事结局模板：condition 命中即用，按顺序匹配第一个
export const ENDING_TEMPLATES = [
  { id:'e_warm', condition:(s)=>s.moodAvg>=6.5,
    text:(s)=>`你这辈子没挣下什么大钱，但 ${s.flags.includes('had_child')?'孩子逢年过节都回':'也总算有枝可依'}。临了那天阳光很好，你睡过去了。算得上温暖平凡的一生。` },
  { id:'e_lonely', condition:(s)=>s.flags.includes('widowed') && s.moodAvg<5,
    text:()=>'你坐在阳台看了一下午的天。屋子里很静，静得能听见钟走。最后谁也没在身边。算孤独终老。' },
  { id:'e_steady', condition:(s)=>s.flags.includes('civil_servant')||s.flags.includes('mid_steady'),
    text:()=>'体制内熬到退休，工资不高，胜在稳。你常说“比上不足比下有余”。一辈子就这么过去了，体面。' },
  { id:'e_drift', condition:(s)=>s.flags.includes('beidrift')||s.flags.includes('stay_big_city'),
    text:(s)=>`北漂半生，${s.flags.includes('mortgage')?'房贷还清那年你大病一场':'最后也没扎下根'}。你说不清是赢了还是输了。或许都算不上。` },
  { id:'e_unfinished', condition:(s)=>s.flags.includes('startup')||s.flags.includes('mid_leap')||s.flags.includes('solo_biz'),
    text:()=>'折腾了大半辈子，公司黄过又开过。账上的钱来来去去。你常想，要是当年稳一点会怎样。未尽之愿。' },
  { id:'e_quiet', condition:(s)=>s.flags.includes('quiet_retire')||s.flags.includes('back_home'),
    text:()=>'回了老家，种种花钓钓鱼。日子慢得像水。你说这就够了。安稳一生。' },
  { id:'e_plain', condition:()=>true,
    text:()=>'没什么大起大落，也没什么特别值得讲的故事。寻常人寻常一生，也就这样了。' },
];
