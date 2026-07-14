# Contributing

感谢你关注 **Enterprise Harness**。

这个仓库当前处于 **可运行的 repo contract + portable runtime MVP** 阶段，欢迎帮助我们把它从“骨架”打磨成“更稳定、更易安装、更适合团队共享”的企业后端交付 Harness。

---

## 1. 先读什么

在提 issue 或提交改动前，建议先看：

- `README.md`
- `CLAUDE.md`
- `harness/specs/mvp-roadmap.md`
- `harness/specs/plugin-runtime.md`
- `harness/specs/requirement-intake.md`

如果你要改 runtime / plugin 层，再看：

- `harness/specs/local-runtime-adapter.md`
- `harness/plugin/manifest.json`
- `harness/plugin/runtime/README.md`

---

## 2. 欢迎哪类贡献

当前最欢迎的方向：

### A. 门禁收紧
- design gate
- stale validation gate
- `RED_VERIFIED` 才允许生产源码写入
- reviewer verdict 消费逻辑

### B. Java 黄金样板增强
- ArchUnit
- JaCoCo 85%
- 真实 HTTP API E2E
- 更强 OpenAPI 契约校验

### C. 插件产品化
- machine-local adapter 正式 schema
- 更完整 installer
- upgrade / migration 机制
- Windows / macOS 真机验证

### D. 文档与协作
- README/路线图补充
- 更清晰的 onboarding / doctor / sync 文档
- 示例 change / golden path 演示

---

## 3. 提交前的基本约定

### 语言约定
- 流程资产、规范、评审说明：默认中文
- 代码标识符、包名、公开 API：默认英文

### 不要提交的内容
- 本机 secrets / token / API key
- `.claude/settings.local.json`
- `.codegraph/`
- `.omc/`
- 构建产物
- machine-local adapter 的真实本机文件

### 变更方式
如果是非平凡改动，请优先通过 `harness/changes/` 建一个 change，而不是直接一把改完。

建议最少落这些资产：

- `state.json`
- `change.md`
- `validation.md`
- `evidence/tooling.md`

---

## 4. 本地验证

当前最小验证命令：

```bash
bash hooks/validate-spec-structure.sh
bash hooks/full-verify.sh
```

如果改动了 `reference-service/`，建议额外执行：

```bash
mvn -f reference-service/pom.xml test
```

如果改动了 portable runtime，建议额外执行：

```bash
node harness/plugin/runtime/bootstrap.mjs
node harness/plugin/runtime/doctor.mjs
node harness/plugin/runtime/sync.mjs
```

---

## 5. Pull Request 建议

PR 最好说明：

1. 改了什么
2. 为什么改
3. 属于哪一层
   - repo contract
   - portable runtime
   - Java reference-service
4. 跑了哪些验证
5. 还有哪些未完成项 / 后续项

如果你的改动只完成了 MVP 某一部分，请明确说清楚，不要把局部增强写成“全套已完成”。

---

## 6. 贡献风格

我们更欢迎：

- 小而清晰的 PR
- 先让 contract 清楚，再扩实现
- 先让 doctor / validation 能说明问题，再做自动修复
- 真实可运行、可验证的增量，而不是只停留在描述层

不鼓励：

- 大而模糊的“一次性全部重写”
- 跳过 change 资产直接大量改动
- 把当前 Linux/bash 假设硬编码成长期标准

---

## 7. 不确定时怎么办

如果你不确定某个改动该先做成：

- contract
- runtime
- sample implementation

建议先开 issue，说清楚：

- 你的目标
- 你观察到的问题
- 你认为属于哪一层
- 你的最小可交付范围

这样更容易对齐。