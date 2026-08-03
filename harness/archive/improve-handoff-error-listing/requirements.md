# Requirements

## 歧义评分

| 维度 | 分数(0-5) | 说明 |
|------|----------|------|
| T 目标 clarity | 5 | handoff create 报错时列合法 behavior 列表 |
| Scope clarity | 5 | 仅改 runtime/lib/handoff.mjs:74 一行 throw 文案 |
| User/actor clarity | 5 | 插件开发者/维护者 |
| Data/SQL clarity | 5 | N/A |
| Interface/API clarity | 5 | 错误消息文案变化，无 API 签名变更 |
| Acceptance criteria clarity | 5 | 报错消息包含合法 behavior 列表 |
| Constraint/risk clarity | 5 | 3 个 smoke 不依赖该文案，零回归 |
| **Overall** | **5.0** | |

### 当前最弱维度

- weakest：全部 5
- weakest score：5
- 评分依据：探索确认错误源头在 runtime/lib/handoff.mjs:74，registry 已在 line 72 加载，Object.keys 即可取合法列表
- unresolved high-risk ambiguity：none
