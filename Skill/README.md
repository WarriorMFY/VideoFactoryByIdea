# 技能库

> 四个桶，一个判定树。技能内部结构（SKILL.md / reference / scripts / templates / evidence / stages）
> 四桶一致，不因桶不同而变形。

## 四桶

| 桶 | 收什么 | 判据 |
| --- | --- | --- |
| `meta/` | 作用于技能与规范本身的工具 | 不产媒体、不调通道 |
| `hub/` | 被链直接调用的共用底座 | 单命令或单 CLI，无 stages |
| `chain/` | 多阶段流水线 | 有 stages/ 子技能，上阶段产物喂下阶段 |
| `other/` | 验收口径、需求转译 | 不参与编排 |

## 判定树

```
有 stages/ 子技能、上阶段产物是下阶段输入？
├── 是 → chain/
└── 否
    ├── 产出媒体像素或调通道？
    │   ├── 是 → 同输入重跑结果唯一？ 是 → hub/editing/ ｜ 否 → hub/generation/
    │   └── 否 → 作用于技能/规范本身？ 是 → meta/ ｜ 否 → other/
```

## 铁律

1. 生成与剪辑的分界看「采样」不看「模型」：输出是否唯一才是判据。
2. 同一父目录下成员 ≥2 才建子层；单孩子链与空桶都不建。
3. 技能目录名 = `SKILL.md` 的 `name`；一律 kebab-case。
4. 技能内部只引用本技能树内的文件（见 `meta/README.md` 规则 5）。
5. 每桶一个 README 作唯一清单，本文件不列技能。

## 下钻

- `meta/README.md` — 技能规范五条 + 本桶清单
- `hub/README.md` — 生成/剪辑分界 + 切合量转 + 本桶清单
- `chain/README.md` — 链的共同契约 + 本桶清单
- `other/README.md` — 兜底规则 + 本桶清单
