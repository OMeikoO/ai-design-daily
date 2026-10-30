---
name: "mature-ip-design"
description: "Designs mature, professional-grade IP mascots (geometric, symbolic, sophisticated - NOT cute/cartoon). Invoke when user asks for 成熟风/商务/专业/高级感 IP形象, B2B or government mascot design, or non-cartoon brand character. 触发：成熟风IP、商务IP、高级感吉祥物."
---

# 成熟风 IP 形象设计（Mature IP Design）

为品牌、政务、B2B、科技企业设计**成熟克制、专业高级**的 IP 形象。与可爱卡通风互补：当用户明确要「不要卡通」「更成熟」「商务感」「高级感」「稳重」时使用本 skill；当用户要「可爱」「萌」「Q版」时改用可爱风 skill。

---

## 1. 核心理念：成熟 ≠ 复杂

成熟风的本质是**克制**，不是元素堆砌。判断一个 IP 是否「成熟」的五个标尺：

| 维度 | 卡通风（对照） | 成熟风（本 skill） |
|---|---|---|
| 比例 | 两头身、大头小身 | 接近真实比例或抽象几何，头身比 1:1 以上 |
| 线条 | 全圆润、无棱角 | 直线与圆角并存，有结构感的转折 |
| 色彩 | 高饱和、多色 | 低饱和（<70%）、主色 ≤3、大量留白/深空底 |
| 表情 | 夸张喜怒 | 无表情或极简表情（抽象脸、单点眼），情绪靠姿态传达 |
| 语义 | 拟人卖萌 | 符号化、有隐喻（盾=安全、棱镜=数据、灯塔=指引） |

**一句话**：卡通风让人想摸，成熟风让人想信。

---

## 2. 六个成熟风格方向（生成前必先与用户对齐方向）

### M1 几何符号体（Geometric Symbol）
- **特征**：由 2-3 种基础几何形（圆/方/三角/棱镜）构成，高度抽象，去掉生物细节
- **适合**：科技企业、数据平台、金融
- **关键词**：`geometric abstract mascot, constructed from prisms and circles, minimal symbolic form, architectural silhouette`

### M2 剪影写实体（Silhouette Realism）
- **特征**：动物或人物的极简剪影 + 单色或双色，靠轮廓张力取胜
- **适合**：政务、城市品牌、文旅
- **关键词**：`minimal silhouette mascot, single solid color figure, elegant contour, negative space design`

### M3 线条主义（Monoline Linear）
- **特征**：均匀粗细的单线条勾勒，无填充或局部填充，克制精致
- **适合**：咨询、律所、专业服务
- **关键词**：`monoline mascot illustration, uniform stroke weight, refined line art, partial fill`

### M4 立体渐变体（Volumetric Gradient）
- **特征**：保留几何骨架，用柔和渐变营造体积感（成熟风中唯一允许渐变的方向）
- **适合**：互联网大厂、AI 产品、发布会的未来感
- **关键词**：`volumetric geometric mascot, soft gradient shading, futuristic minimal, 3D-ish flat render`

### M5 图腾徽章体（Emblem Totem）
- **特征**：对称构图、徽章式框线、纹章气质，天然带权威感
- **适合**：政府机构、国企、安全认证
- **关键词**：`emblem mascot design, symmetrical totem, heraldic badge frame, institutional dignity`

### M6 国潮雅致体（Neo-Oriental）
- **特征**：传统纹样（云纹/回纹/山水）做几何化提炼，低饱和东方色
- **适合**：文化机构、地方政务、非遗项目
- **关键词**：`neo-oriental mascot, geometricized traditional pattern, muted oriental palette, cultural refinement`

> **流程纪律**：先给用户看 2-3 个方向（每方向 1 张），锁定方向后再出同方向变体。禁止跳过方向确认直接批量生成。

---

## 3. 工作流（五步法）

### Step 1 · 需求摄入（Brief Intake）
必问四项（缺一项则追问）：
1. **行业与调性**：政企/科技/金融/文旅？庄重还是现代？
2. **色彩锚点**：有无品牌 VI 主色或参考渐变？（要求用户给色值或截图）
3. **载体**：主 Logo / 大屏 / 官网 / 发布会 KV？决定细节密度
4. **气质光谱**：在「权威 ←→ 亲和」之间指一个位置（决定表情与姿态的自由度）

### Step 2 · 方向探索（Direction Sprint）
- 按 §2 出 2-3 个方向，每方向 1 张，统一深空底、统一构图（左形右空）
- 生成对比图（并排 + 方向标签），交用户选择

### Step 3 · 基因锁定（DNA Lock）
用户选定后，立即固化「形象 DNA 清单」，后续所有变体不得违反：
- 造型结构（几何构成/比例/关键特征）
- 色彩系统（主色 hex + 占比 + 点缀色，全部实测）
- 姿态语义（默认动作及其含义）
- 风格语言（描边有无/渐变有无/纹理有无）

**DNA 锁定后，变体只允许改：姿态、场景、辅助符号；禁止改：结构、比例、色值、风格。**

### Step 4 · 变体生成与校准（Variant & Calibrate）
- 按锁定 DNA 生成动作/场景变体
- 色彩校准：如生成结果主色偏移品牌色，做 HSV 色相平移校准（保护性掩膜保护非目标色相，如保护黄色符号不动玫红身体）
- 每张必须过 Step 5 验证才算交付

### Step 5 · 客观验证管线（Validation Pipeline）
用 Python (OpenCV) 客观验证，**不依赖肉眼**：

```python
# 1. 主色实测（k-means 聚类取主色 blob，输出 hex）
# 2. 对比度验证（WCAG：主色 vs 背景底色，图形级 ≥3:1，文字级 ≥4.5:1）
# 3. 水印检测（medianBlur(35) 带通滤波：dev∈(10,130) 为笔画残留）
# 4. 32px 可读性（缩至 32px 后轮廓仍可辨识）
```

验证全过 → 落盘交付；任一不过 → 重新生成或修复。

---

## 4. 提示词模板（核心）

### 4.1 通用骨架
```
Mature professional IP mascot design, {风格方向关键词},
{造型描述：几何构成/比例/关键特征},
{色彩约束：main color #HEX, accent #HEX, on solid {背景色} background},
{风格纪律：no cartoon proportions, no oversized head, no cute chibi style,
 flat/clean execution, no outline OR monoline as specified},
{姿态与语义}, character on left side of frame, large negative space on right,
premium brand identity quality, {载体适配：suitable for logo/dashboard/keynote}
```

### 4.2 反卡通负面词（每个提示词必带）
```
no chibi, no oversized head, no cute kawaii style, no blushing cheeks,
no exaggerated expression, no toy-like proportions, no childish elements
```

### 4.3 政务特化附加词
```
institutional dignity, restrained and trustworthy, formal government
aesthetic, ceremonial steadiness
```

### 4.4 科技特化附加词
```
data-driven aesthetic, precise engineering feel, futuristic but grounded
```

---

## 5. 色彩纪律（成熟风专属）

1. **主色 ≤3**：一个主导色（60%+）、一个结构色、至多一个强调色
2. **饱和度上限**：主色饱和度建议 ≤75%（HSV 的 S ≤190），高饱和是卡通感最大来源
3. **深空底优先**：成熟风默认深色底（深蓝/深灰/墨色），庄重且通用
4. **品牌校准**：若客户有 VI 色，生成后必须做色相校准至目标 hex（±10 色相内为合格）
5. **对比度底线**：形象主体 vs 背景 ≥3:1（图形级）；若形象含文字功能则 ≥4.5:1

---

## 6. 反模式清单（成熟风 NEVER）

- ❌ 大头小身的 Q 版比例
- ❌ 高饱和撞色（如亮黄+亮红+亮蓝同图）
- ❌ 夸张表情（大笑、惊讶、腮红）
- ❌ 拟人卖萌动作（比心、扭捏、跳跃）
- ❌ 元素堆砌（同时有徽章+翅膀+光环+彩带）
- ❌ 未锁方向就批量出图
- ❌ 交付前跳过客观验证

---

## 7. 与可爱风 skill 的协作

| 场景 | 用哪个 |
|---|---|
| 政务主 Logo、正式发布会、对外文件 | 本 skill（成熟风） |
| Agent 入口、互动彩蛋、传播物料 | 可爱风 skill |
| 双模式需求 | 同一语义内核，两套皮肤（先锁语义再分皮肤） |

---

## 8. 交付物标准

每次正式交付包含：
1. **定稿主形象** 1920×1920 PNG（无水印，已校准品牌色）
2. **资产裁切**：头部特写 / 核心符号区（按构图自动裁切）
3. **设计说明**：DNA 清单 + 实测色值 + 对比度数据（可并入 HTML 规范文档）
4. **过程存档**：方向探索稿归档不删除，标注「已弃用」
