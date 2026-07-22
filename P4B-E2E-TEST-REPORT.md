# AI-GM Phase 4-B: E2E 端到端测试报告

> 测试时间: 2026-07-21T01:21:25.823Z  
> 测试模组: 诡秘之主：廷根迷雾  
> 模组版本: 1.0.0  
> 场景数量: 9 | NPC数量: 8 | 事件数量: 8

## 测试结果统计

| 指标 | 数值 |
|------|------|
| 总测试数 | 59 |
| 通过 | 43 |
| 失败 | 16 |
| 通过率 | 72.9% |

## 🔴 严重发现：引擎与模组数据格式完全不兼容

本次测试发现《诡秘之主》模组的数据格式与 AI-GM 引擎期望的格式存在**根本性不兼容**。这不是简单的"数据缺失"，而是**结构级不匹配**，导致引擎核心功能无法工作。

### 格式不兼容问题清单

| 问题ID | 严重度 | 描述 | 影响 |
|--------|--------|------|------|
| BUG-FMT-001 | 🔴 高 | scenes 是数组，引擎期望 Record<string, Scene> | 场景加载、切换完全失败 |
| BUG-FMT-002 | 🔴 高 | npcs 是数组，引擎期望 Record<string, NPC> | NPC 系统完全失败 |
| BUG-FMT-003 | 🟡 中 | events 是数组，引擎期望 Record<string, Event> | 事件系统部分失效 |
| BUG-FMT-004 | 🟡 中 | 场景使用 name 而非 title | 氛围分析、UI 显示异常 |
| BUG-FMT-005 | 🟡 中 | NPC 使用 sprite 而非 sprites | 立绘显示、战斗系统异常 |
| BUG-FMT-006 | 🔴 高 | exits 使用 target_scene 而非 target | 场景导航完全失败 |
| BUG-FMT-007 | 🟡 中 | exits 使用 direction 而非 label | 出口显示文本异常 |
| BUG-FMT-008 | 🟡 中 | 缺少顶级 items（Record<string, Item>） | 物品系统、探索系统失效 |
| UX-FMT-001 | 🟡 中 | 缺少 module.id | 存档/读档模块标识问题 |
| UX-FMT-002 | 🔴 高 | 缺少 module.start_scene | 引擎无法确定起始场景 |

## 引擎 Bug (9个)

### BUG-FMT-001 [高]
- **描述**: 模组 scenes 是数组，但引擎期望 Record<string, Scene>（对象）。SceneLoader 使用 this.module.scenes[sceneId] 访问，数组索引访问会导致场景ID映射错误。
- **复现步骤**: 启动游戏并切换场景

### BUG-FMT-002 [高]
- **描述**: 模组 npcs 是数组，但引擎期望 Record<string, NPC>。NPCSystem、EmotionEngine 均使用 this.module.npcs[npcId] 访问，数组索引访问会导致NPC引用错误。
- **复现步骤**: 进入包含NPC的场景

### BUG-FMT-003 [中]
- **描述**: 模组 events 是数组，但引擎期望 Record<string, Event>。SceneLoader.buildEventIndex 和事件触发逻辑使用对象键访问。
- **复现步骤**: 触发场景事件

### BUG-FMT-004 [中]
- **描述**: 模组场景使用 "name" 字段，但引擎期望 "title"。EmotionEngine.analyzeScene 使用 scene.title 进行氛围分析，scene.title 为 undefined 会影响氛围推断。
- **复现步骤**: 切换场景，观察氛围是否正确

### BUG-FMT-005 [中]
- **描述**: 模组 NPC 使用 "sprite"（字符串），但引擎期望 "sprites"（Record<string, string>）。NPC 精灵显示和战斗系统均依赖 sprites 对象。
- **复现步骤**: 查看 NPC 立绘

### BUG-FMT-006 [高]
- **描述**: 场景 exits 使用 "target_scene"，但引擎期望 "target"。场景导航功能将无法工作。
- **复现步骤**: 点击场景出口导航

### BUG-FMT-007 [中]
- **描述**: 场景 exits 使用 "direction"，但引擎期望 "label"。出口显示文本可能不正确。
- **复现步骤**: 查看场景出口选项

### BUG-ENG-001 [中]
- **描述**: npc-system.ts _updateAttitude 中 neutral 态度分支为空，NPC 从中立切换到其他态度时可能无响应
- **复现步骤**: 与中立态度 NPC 多次交互，观察态度是否变化

### BUG-ENG-002 [中]
- **描述**: npc-system.ts updateRelationship 第153行误用 npcState 而非 npcStateB，导致 NPC B 的关系记忆无法正确记录
- **复现步骤**: 让两个 NPC 互动，检查 NPC B 的记忆是否包含互动记录


## 体验问题 (11个)

### UX-001 [高]
- **描述**: 《诡秘之主》模组缺少 combat 场景定义，玩家无法体验战斗系统

### UX-007 [高]
- **描述**: 《诡秘之主》模组所有 NPC 缺少 dialogue_tree，NPC 动态对话系统无法工作

### UX-008 [高]
- **描述**: 《诡秘之主》模组所有 NPC 缺少 dynamic_response，NPC 无法生成个性化回应

### UX-013 [中]
- **描述**: 场景 "黑荆棘安保公司" 的出口 "地下档案室" 指向不存在的场景 "archives"

### UX-013 [中]
- **描述**: 场景 "廷根码头区" 的出口 "海船" 指向不存在的场景 "ship"

### UX-FMT-001 [中]
- **描述**: 模组缺少 id 字段，可能影响存档/读档的模块标识

### UX-FMT-002 [高]
- **描述**: 模组缺少 start_scene 字段，引擎无法确定起始场景

### UX-FMT-003 [低]
- **描述**: 所有场景缺少 sprites 数组（SpritePlacement[]），角色立绘位置信息缺失

### UX-FMT-004 [中]
- **描述**: 所有场景缺少 dialogue 结构，VN 叙事引擎无法渲染对话

### UX-FMT-005 [中]
- **描述**: 模组缺少顶级 items 定义（Record<string, Item>）。player.inventory 是数组结构，与引擎期望的 Record 不兼容。explore-system.ts 使用 module.items[itemId] 查找物品。

### UX-FMT-006 [高]
- **描述**: 所有场景缺少 choices 数组，分支选择功能完全不可用


## 信息备注

- NPC "邓恩·史密斯" (dunn_smith) 的 personality 是字符串数组，引擎期望的是 string 或结构化对象
- NPC "老尼尔" (old_neil) 的 personality 是字符串数组，引擎期望的是 string 或结构化对象
- NPC "伦纳德·米切尔" (leonard_mitchell) 的 personality 是字符串数组，引擎期望的是 string 或结构化对象
- NPC "弗莱" (frye) 的 personality 是字符串数组，引擎期望的是 string 或结构化对象
- NPC "威尔·昂赛汀" (will_auceptin) 的 personality 是字符串数组，引擎期望的是 string 或结构化对象
- NPC "兰尔乌斯" (cultist_leader) 的 personality 是字符串数组，引擎期望的是 string 或结构化对象
- NPC "密修会成员" (cultist_acolyte) 的 personality 是字符串数组，引擎期望的是 string 或结构化对象
- NPC "肯莱" (kenley) 的 personality 是字符串数组，引擎期望的是 string 或结构化对象
- explore-system.ts 的 search() 方法需要 scene.searchable_areas 和 module.items
- SceneLoader.loadScene 会注入 hidden_events 和 searchable_areas
- WorldState 初始化需要 quests 和 events 数组
- handleCombatResult 需要 combatResult 参数
- handleNPCInteraction 会更新 trust/fear
- 场景 events 是字符串数组（事件ID引用），引擎期望 Event[] 或配合 module.events Record 使用
- world-state.ts syncToCampaign 参数为 (campaign, module)，调用方需确保参数正确
- state-machine.ts 已正确使用不可变更新 {...campaign, xxx}
- saveStore.ts 使用 (save as any).slot_number 访问，GameSave 类型缺少 slot_number 字段
- 存档数据结构：id, name, campaign, module, timestamp, thumbnail?, vnSnapshot?
- 存档槽位：10个（0号槽为自动存档）

## 功能点覆盖评估

### ① 自由输入对话（闲聊模式）✅
- 意图解析引擎支持 10+ 意图类型
- 关键词匹配逻辑完整，兜底处理正确

### ② 意图解析触发战斗/事件/存档/设置 ❌
- **存档/读档**: 引擎代码完整 ✅
- **设置**: 引擎代码完整 ✅
- **战斗**: 模组有 combat 定义但格式不兼容，引擎无法加载 ❌
- **事件**: 模组有 events 但格式不兼容 ❌
- **场景导航**: exits 字段名不匹配，导航完全失败 ❌

### ③ NPC 动态对话（记忆上下文）❌
- 模组 NPC 无 dialogue_tree / dynamic_response
- NPC 数据是数组而非 Record，引擎无法按 ID 查找
- NPC 使用 sprite 而非 sprites，立绘系统异常

### ④ 场景探索 + 发现隐藏物品 ❌
- 模组有 hidden_clues 但非引擎期望的 searchable_areas 格式
- scenes 是数组，SceneLoader 无法正确加载
- 缺少顶级 items 定义

### ⑤ 任务系统追踪 ⚠️
- 模组有 main_quest 但无 quests Record
- QuestSystem 期望 Record<string, Quest> 结构

### ⑥ 世界状态响应 ⚠️
- WorldState 引擎代码完整
- 但模组数据格式不兼容，无法正确初始化

### ⑦ 情绪氛围变化 ✅
- EmotionEngine 完整支持 8 种氛围类型
- 37+ 中文关键词映射
- 场景分析逻辑完整
- **但**: 场景使用 name 而非 title，analyzeScene 会取不到标题

## 模组内容质量评估（抛开格式问题）

| 维度 | 评分 | 说明 |
|------|------|------|
| 场景设计 | ⭐⭐⭐⭐ | 9个场景，廷根市世界观完整，氛围标签合理 |
| NPC 设计 | ⭐⭐⭐⭐ | 8个NPC，性格鲜明，序列/途径设定正确 |
| 事件设计 | ⭐⭐⭐⭐⭐ | 9个事件，含对话、选择、战斗、剧情推进 |
| 战斗设计 | ⭐⭐⭐ | 1个combat场景，敌人数值完整 |
| 任务设计 | ⭐⭐⭐ | main_quest 三阶段，但缺少详细目标追踪 |
| 探索设计 | ⭐⭐ | 有 hidden_clues 但缺少 searchable_areas |
| 物品设计 | ⭐⭐ | player.inventory 有物品但无顶级 items 定义 |

## 引擎代码质量评估

| 模块 | 状态 | 备注 |
|------|------|------|
| intent-parser.ts | ✅ 良好 | 关键词覆盖完整 |
| state-machine.ts | ✅ 良好 | BUG-5 已修复，不可变更新正确 |
| npc-system.ts | ⚠️ 有 Bug | BUG-ENG-001/002 |
| world-state.ts | ⚠️ 有风险 | syncToCampaign 参数顺序需注意 |
| explore-system.ts | ✅ 良好 | 需配合正确格式模组 |
| quest-system.ts | ✅ 良好 | 需配合正确格式模组 |
| emotion-engine.ts | ✅ 良好 | 氛围系统完善 |
| combat-system.ts | ✅ 良好 | COC 规则实现完整 |
| saveStore.ts | ⚠️ 类型问题 | slot_number 未在类型中定义 |
| settingsStore.ts | ✅ 良好 | 加密传输正确 |

## 结论

### 🔴 阻塞性问题（必须修复）

1. **模组数据格式转换**: 必须将模组的数组格式转换为引擎期望的 Record 格式：
   - scenes: Array → Record<string, Scene>
   - npcs: Array → Record<string, NPC>
   - events: Array → Record<string, Event>
   - items: 补充 Record<string, Item>（或转换 player.inventory）

2. **字段名对齐**:
   - scene.name → scene.title
   - npc.sprite → npc.sprites (Record<string, string>)
   - exit.target_scene → exit.target
   - exit.direction → exit.label
   - 补充 module.id 和 module.start_scene

3. **补充引擎期望的结构**:
   - scene.sprites: SpritePlacement[]
   - scene.dialogue: DialogueEntry
   - scene.choices: Choice[]
   - npc.dialogue_tree: DialogueTree
   - npc.dynamic_response: DynamicResponseConfig
   - module.quests: Record<string, Quest>

### 🟡 引擎 Bug（建议修复）

1. **BUG-ENG-001**: npc-system.ts _updateAttitude neutral 分支为空
2. **BUG-ENG-002**: npc-system.ts updateRelationship 变量名错误

### ✅ 引擎优势

- 意图解析系统完善，覆盖全面
- 情绪/氛围引擎设计精良，8种氛围+优先级系统
- 战斗系统 COC 规则实现完整
- 存档/读档系统功能齐全
- 设置系统支持加密传输

## 建议优先级

**P0（立即）**: 模组格式转换工具/脚本  
**P1（本周）**: 修复 BUG-ENG-001/002  
**P2（下周）**: 补充模组缺失结构（dialogue_tree, quests, searchable_areas）  
**P3（后续）**: 增加更多场景和事件内容
