# 升级数据说明

当前数据版本：`0.1.0`。基础表首次整理时标注的核对日期为 2026-07-21，并不代表此后每条数据都已经复核。
旧版未记录上游数据的具体提交版本，因而不能精确重现当时的上游快照；以后更新应固定并保存上游提交号。

## 文件职责

- `data/upgrades.json`：来自 [ClashKingInc/clashy.go 的 `static_data.json`](https://github.com/ClashKingInc/clashy.go/blob/main/static/static_data.json) 的项目快照，经前一版计算器压缩和中文化。它是第三方数据，不是官方 API。
- `data/unlock-hall-overrides.json`：此前计算器使用的大本营解锁级别修正，尚待逐项复核。
- `data/corrections.json`：有明确差异记录的逐级校正；状态字段区分已证实和推定。
- `data/upgrades.js`：由以上三个源文件生成，供网页直接加载；不要手工编辑。

## 已知案例

战争机器 5→6：用户游戏内截图显示，黄金令牌减时 20% 时升级时间是 14 小时 20 分钟，费用是 1,200,000 建筑大师圣水。旧数据给出的基础时间为 36 小时，与截图不符。当前使用 18 小时作为基础时间暂定值，因为折后 14 小时 24 分钟按游戏显示精度向下取整可得到 14 小时 20 分钟；**无加成基础值仍须单独验证**。费用沿用旧数据中的基础费用 1,500,000，20% 折后与截图一致。

2026 年 8 月 [官方公告](https://supercell.com/en/games/clashofclans/blog/release-notes/august-update-3/)增加了 Diggy 11–15 级，以及建筑工人小屋、巨石碑的超级充能新等级。当前快照中的 Diggy 最高仅 10 级；新增内容的完整时间、费用和解锁要求尚未核实，因此没有编造数值填入第一版。

## 更新流程

1. 检查 [Supercell 更新公告](https://supercell.com/en/games/clashofclans/blog/) 与游戏内显示，列出可能受影响的项目和等级。
2. 对比新旧第三方快照，审阅每条差异，并在 `data/corrections.json` 或新版 `data/upgrades.json` 里记录来源和状态。
3. 运行 `npm run build:data` 和 `npm test`，再人工检查逐级表与常用方案。
4. 将 `meta.version` 升级，并更新页面的说明与 PWA 缓存版本。尚未核对的新项目继续标为待核对。

官方 API 当前公开介绍的是部落、玩家、排行榜和联赛资料，不能视作完整的逐级升级时间/费用来源。若将来接入 API，密钥不能写入公开网页或 GitHub Pages 的前端文件。未来公开分享本项目之前，还需重新检查第三方数据的使用许可与 Supercell 粉丝内容规则。
