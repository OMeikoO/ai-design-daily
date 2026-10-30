---
name: "cute-ip-design"
description: "Designs cute, minimal, chibi-style commercial IP mascots (kawaii, rounded, flat vector). Invoke when user asks for 可爱风/萌系/Q版 IP形象, brand mascot with approachable temperament, or friendly entry-point character for apps/dashboards. 触发：可爱风IP、Q版吉祥物、萌系形象."
---

# 可爱风 IP 形象设计（Cute IP Design）

设计**极简可爱、亲和商用**的 IP 吉祥物——两头身、圆润、纯扁平，适合做产品入口、Agent 吉祥物、传播物料。当用户要「可爱」「萌」「Q版」「亲和」时用本 skill；要「成熟」「商务」「高级感」时改用 mature-ip-design skill。

---

## 1. 核心理念：可爱 = 可近

可爱风的商业价值不是「萌」，是**降低用户与系统的心理距离**。判断标准：

| 维度 | 要求 |
|---|---|
| 比例 | 两头身（头:身 ≈ 1:1），大头小身是亲和力第一来源 |
| 线条 | 全曲率、无棱角、无尖角转折 |
| 色彩 | 高饱和暖色主色 + 深色底，主色 3-5 个 |
| 表情 | 极简（点眼 + 弧线笑），情绪靠「屏幕/面罩」承载 |
| 手部 | 圆手套/单圆球，**永远不画手指**（小尺寸可读 + 圆润语感一致） |

**一句话**：卡通风让人想摸，成熟风让人想信——本 skill 负责「想摸」。

---

## 2. 六个可爱风格方向（生成前先与用户对齐）

### C1 屏幕机器人（Screen Bot）★ 项目验证过
- **特征**：圆角矩形屏幕脸（表情画在屏内=可编程）、胶囊身体、双侧圆耳凸
- **适合**：数据大屏、Agent 平台、AI 产品
- **优势**：屏幕脸 = 表情系统天然接口，Agent 状态只重绘屏幕、身体永不变
- **关键词**：`chibi robot mascot, rounded rectangle screen face, dot eyes and arc smile, capsule body, round ear bumps`

### C2 动物头冠体（Animal Crown）
- **特征**：真实动物（猫头鹰/狮子/狐狸）做极简几何化，保留 1 个识别特征（耳/冠/尾）
- **适合**：教育、政务亲和线、城市文旅
- **关键词**：`minimal geometric animal mascot, one identifying feature, owl/lion/fox simplified`

### C3 云团精灵体（Cloud Sprite）
- **特征**：云/水滴/星光等自然物拟态，圆润无固定生物结构
- **适合**：天气/环保/民生服务类
- **关键词**：`cloud sprite mascot, soft rounded blob form, nature element anthropomorphized`

### C4 食物拟人体（Food Character）
- **特征**：饭团/橙子/包子等食物 + 极简表情
- **适合**：餐饮、生鲜、本地生活
- **关键词**：`food mascot character, rice ball/orange with simple face, kawaii minimal`

### C5 积木生物体（Block Creature）
- **特征**：几何积木拼合的小生物，比 C1 更抽象
- **适合**：儿童科技、创客教育
- **关键词**：`block creature mascot, assembled geometric shapes, playful construction`

### C6 星球导航体（Orbit Guide）
- **特征**：星球/卫星/天线球，带轨道环元素
- **适合**：导航、地图、航天科普
- **关键词**：`planet guide mascot, orbital ring element, satellite friend`

> **流程纪律**：先出 2-3 个方向各 1 张，用户锁定方向后再出变体。禁止跳过确认直接批量生成。

---

## 3. 工作流（五步法）

### Step 1 · 需求摄入
必问四项：
1. **行业与场景**：大屏入口？App 吉祥物？周边？
2. **色彩锚点**：品牌 VI 主色/参考渐变（要色值或截图）
3. **气质光谱**：在「活泼 ←→ 稳重」间指位置
4. **符号需求**：是否要承载语义符号（闪电=快、盾=安全）

### Step 2 · 方向探索
按 §2 出 2-3 方向 × 1 张，统一深色底、左形右空构图、并排对比图交用户选。

### Step 3 · 基因锁定（DNA Lock）
选定后立即固化 DNA 清单：
- 造型结构（比例/关键特征/手部形态）
- 色彩系统（主色 hex 实测 + 占比 + 点缀色）
- 默认姿态及其语义
- 风格语言（无描边/无渐变/纯扁平）

**锁定后变体只许改：姿态、场景、辅助符号；禁改：结构、比例、色值、风格。**

### Step 4 · 变体生成与校准
- 生成动作/场景变体时，提示词重复完整 DNA 描述（生成模型没有记忆，每张都要完整描述）
- 主色偏移时做 HSV 色相平移校准（保护性掩膜保护非目标色相，如保护黄色闪电不动玫红身体）
- 动作语义必须过「服务语义检验」：这个动作在表达什么服务？答不出就不做

### Step 5 · 客观验证管线（不依赖肉眼）
```python
# 1. 主色实测：k-means 聚类 + 最大连通域 → 输出 hex，与锁定色比对（±10 色相合格）
# 2. 对比度：主色 vs 背景 WCAG ≥3:1（图形级）；含文字功能 ≥4.5:1
# 3. 水印检测：medianBlur(35) 带通 dev∈(10,130) 定位笔画残留
# 4. 32px 可读性：缩至 32px 轮廓仍可辨识
```

水印去除（如生图 API 自带水印）：
- 纯背景区水印：同列上方背景块贴补 + smoothstep 羽化（核心区 alpha=1.0 全覆盖，羽化外移 14px）
- 跨角色区水印：调色板反演 + 类别场重建（k-means 调色板 → 余量通道分类 → 类别图去噪 → one-hot 平滑重建）
- 修复后必须复验：带通残留 0px、角色区域梯度正常

---

## 4. 提示词模板

### 4.1 通用骨架
```
IP mascot design: cute minimalist chibi mascot,
{造型：two-head-tall proportion, {关键特征描述}},
{色彩：body color #HEX, {点缀色} accents, solid {背景色} background},
{面部：two round dot eyes and one single curved arc line smile},
{手部：simple round mitten hands without fingers},
{姿态与语义},
strictly flat vector illustration style, no outline, no gradient, no shading,
character on left side of frame, large empty negative space on right side
```

### 4.2 关键纪律词（必带）
```
no fingers, no outline, no gradient, no shading, no texture
```

### 4.3 姿态语义参考
- 举手点赞/挥手 = 主动响应、亲和招呼
- 挥手 = 问候、欢迎页
- 抱元素 = 递送/守护（数据球、文件、盾）
- 疾跑 = 执行中、加载状态
- **慎用**：敬礼等仪礼动作（有军礼/警察礼联想歧义风险，政务场景禁用）

---

## 5. 色彩纪律

1. **主色 3-5 个**：主导色 + 底色 + 屏/面罩色 + 点缀色（+可选符号色）
2. **暖色主色**：亲和力要求主色为暖色系（珊瑚/玫红/橙黄族）
3. **深空底**：默认深蓝/深灰底（庄重托底 + 高对比 + 大屏友好）
4. **符号专用色**：语义符号（闪电等）可用独立高亮色，只给符号用
5. **品牌校准**：客户有 VI 色时，生成后校准至目标 hex
6. **对比度**：主色 vs 底 ≥3:1，面部细节 vs 屏色 ≥3:1

---

## 6. 反模式清单（NEVER）

- ❌ 画手指（圆手套是纪律）
- ❌ 描边/渐变/阴影/纹理
- ❌ 复杂表情（眉、睫毛、腮红按需慎用，默认点眼+弧线笑）
- ❌ 改变锁定 DNA 出变体
- ❌ 未过服务语义检验就加动作
- ❌ 交付前跳过客观验证
- ❌ 政务场景用仪礼动作

---

## 7. 与成熟风 skill 的协作

| 场景 | 用哪个 |
|---|---|
| 产品入口、Agent 吉祥物、互动、传播 | 本 skill（可爱风） |
| 主 Logo 正式版、发布会、对外文件 | mature-ip-design |
| 双模式需求 | 同一语义内核，两套皮肤（先锁语义再分皮肤） |

---

## 8. 交付物标准

1. **定稿主形象** 1920×1920（无水印、已校准、PNG）
2. **资产裁切**：头部特写 / 面部特写（按构图自动裁切）
3. **设计说明**：DNA 清单 + 实测色值 + 对比度数据 + 可选 HTML 规范文档
4. **过程存档**：方向探索稿归档标注「已弃用」
