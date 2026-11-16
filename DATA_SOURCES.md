# 升级数据说明

当前数据版本：`0.1.2-preview`。基础表首次整理时标注的核对日期为 2026-07-21，并不代表此后每条数据都已经复核。
旧版未记录上游数据的具体提交版本，因而不能精确重现当时的上游快照；以后更新应固定并保存上游提交号。

## 文件职责

- `data/upgrades.json`：来自 [ClashKingInc/clashy.go 的 `static_data.json`](https://github.com/ClashKingInc/clashy.go/blob/main/static/static_data.json) 的项目快照，经前一版计算器压缩和中文化。它是第三方数据，不是官方 API。
- `data/unlock-hall-overrides.json`：此前计算器使用的大本营解锁级别修正，尚待逐项复核。
- `data/corrections.json`：有明确差异记录的逐级校正；状态字段区分已证实和推定。
- `data/th19-preview.json`：19 本上线前第三方预告表中有明确费用、时间的部分等级。尚未用游戏内画面验证；与基础快照分开保存，便于审阅和替换。
- `data/upgrades.js`：由以上四个源文件生成，供网页直接加载；不要手工编辑。

## 已知案例

2026-11-16 的 19 本预告数据：此次仅补入 [ClashRecord 11 月 14 日预告表](https://www.clashrecord.com/blog/town-hall-19-max-levels)中列出完整时间和费用的 19 本大本营、新防御、部分既有建筑、陷阱、城墙和新法术等级；该来源自身说明是上线前信息，数值可能在上线时变化，**不是游戏内确认**。表中未注明的资源种类沿用本项目同一建筑的旧等级设定，也须核对。项目中的两个新防御和新法术暂保留英文名称，中文名称待核对。此表还缺少大量英雄、兵种、小队、建筑及其他项目，不能作为完整 19 本数据库。[Supercell 11 月活动预告](https://supercell.com/en/games/clashofclans/blog/news/clash-of-titans-is-hot-off-the-press/)确认 19 本计划在 11 月中旬推出；[Google Play 游戏活动页](https://play.google.com/store/apps/eventdetails/4830485274408587056)介绍了两种新防御，但两者均不提供以上逐级时间和费用。

同一更新还涉及旧等级的费用与时间变更；[Clash Ninja 的更新对照表](https://www.clash.ninja/guides/when-is-the-next-update)列出多项降低，例如大本营 16→17 从 10 天变为 9 天 12 小时。旧基础表和已保存方案仍沿用原值，**不能假设旧等级已同步本次调整**；历史截图校正同样可能过期。后续应以游戏内画面或可溯源的发布后数据逐项更新。

战争机器 5→6：用户游戏内截图显示，黄金令牌减时 20% 时升级时间是 14 小时 20 分钟，费用是 1,200,000 建筑大师圣水。旧数据给出的基础时间为 36 小时，与截图不符。当前使用 18 小时作为基础时间暂定值，因为折后 14 小时 24 分钟按游戏显示精度向下取整可得到 14 小时 20 分钟；**无加成基础值仍须单独验证**。费用沿用旧数据中的基础费用 1,500,000，20% 折后与截图一致。

2026 年 8 月 [官方公告](https://supercell.com/en/games/clashofclans/blog/release-notes/august-update-3/)增加了 Diggy 11–15 级，以及建筑工人小屋、巨石碑的超级充能新等级。当前快照中的 Diggy 最高仅 10 级；新增内容的完整时间、费用和解锁要求尚未核实，因此没有编造数值填入第一版。

大本营 16→17：源文件原已记录目标 17 级、基础升级时间 10 天、费用 16,000,000 金币，解锁条件为 16 本。2026-09-23 对照 [GiBiArena 的逐级表](https://www.gibiarena.com/en/clash-of-clans/upgrades/town-hall)复核，这一条与其标注的 2026-09-01 游戏文件数据一致。但两者都沿用 ClashKing 数据，属于**同源版本对照，不是独立验证或官方逐级数值保证**。[Supercell 的 17 本更新公告](https://supercell.com/en/games/clashofclans/blog/game-updates/the-town-hall-17-update-is-here-2/)确认了 17 本及其新增内容，但没有提供可用于逐项复核的完整时间/费用表。17 本阶段其他项目仍需逐项核对。界面现可选择“TH17”阶段，查看大本营 16→17 及该阶段标记的其他升级。

地狱火炮 1→5：2026-09-27 用户提供的逐级参考表截图列出：1 级费用和时间均为 N/A；1→2 为 10,000,000 金币 / 6 天，2→3 为 12,000,000 / 7 天，3→4 为 14,000,000 / 8 天，4→5 为 18,000,000 / 10 天，所列等级均要求 17 本。1 级作为 17 本武器初始状态，不单独计时或收费。[Clash Ninja 的更新资料](https://www.clash.ninja/blog/town-hall-18-is-here)列出相同的升级费用与时间；[Supercell 的 17 本更新公告](https://supercell.com/en/games/clashofclans/blog/game-updates/the-town-hall-17-update-is-here-2/)确认武器与大本营合并，但未逐级列出数值。另有第三方表将多个等级统一写为 16,000,000 金币，与用户参考表冲突，因此此处以用户指定的参考表为准；游戏内当前实际显示仍优先。此项目数据状态记为 `user_reference_screenshot`，不是官方 API 验证。

## 更新流程

1. 检查 [Supercell 更新公告](https://supercell.com/en/games/clashofclans/blog/) 与游戏内显示，列出可能受影响的项目和等级。
2. 对比新旧第三方快照，审阅每条差异，并在 `data/corrections.json` 或新版 `data/upgrades.json` 里记录来源和状态。
3. 运行 `npm run build:data` 和 `npm test`，再人工检查逐级表与常用方案。
4. 将 `meta.version` 升级，并更新页面的说明与 PWA 缓存版本。尚未核对的新项目继续标为待核对。

## 额外加速的模拟范围

[Supercell 2025 年夯木节公告](https://supercell.com/en/games/clashofclans/zh-hans/blog/news/%E5%A4%AF%E6%9C%A8-%E8%8A%82-%E5%BC%BA%E5%8A%BF%E5%BC%80%E5%90%AF-%E5%8D%81%E4%B8%80%E6%9C%88-%E8%B5%9B%E5%AD%A3/)明确写明升级时间与费用减半，超级充能和精工防御除外。计算器据此只对家乡的适用、非即时升级按 50% 减时减费。建筑大师基地不套用夯木节，因为该公告没有明确说明覆盖范围。与黄金令牌一起选择时，两项折扣按剩余值相乘作规划估算，具体以相同账号条件下的游戏内显示为准。回归玩家 50% 仍只减少时间。夯木节选项是模拟历史规则，不保证当前或未来活动完全相同。

官方 API 当前公开介绍的是部落、玩家、排行榜和联赛资料，不能视作完整的逐级升级时间/费用来源。若将来接入 API，密钥不能写入公开网页或 GitHub Pages 的前端文件。未来公开分享本项目之前，还需重新检查第三方数据的使用许可与 Supercell 粉丝内容规则。
