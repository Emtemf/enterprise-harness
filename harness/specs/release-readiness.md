# 发布准备说明

## 目标

明确什么时候可以把当前 Enterprise Harness 从“公开 skeleton 仓库”推进到“更正式的可安装插件资产”。

## 当前已具备

- root `package.json`
- `bin/enterprise-harness.mjs`
- runtime `cli.mjs`
- `doctor` / `sync` / `verify` / `install` / `upgrade` / `migrate`
- local adapter schema 与 setup
- 上游升级治理
- README / CONTRIBUTING / issue templates

## 当前还缺

### 1. 发布路径
- npm 包名最终确认
- 是否使用 scope（例如 `@org/enterprise-harness`）
- 版本策略（semver）

### 2. prepublish 检查
- package metadata 完整性
- runtime CLI 自检
- doctor / sync / verify / upstream-check 通过
- 平台矩阵状态说明

### 3. 安装体验
- `npm install -g` / `npx` 路径说明
- 安装者失败时的清晰诊断

## 当前建议的发布顺序

1. 完善 prepublish skeleton
2. 跑 Linux 发布前检查
3. 补 macOS / Windows 真机 smoke test 结果
4. 确认 package 命名与发布策略
5. 再做正式对外发布

## 不应提前宣称的内容

- 不应宣称“全平台已正式支持”
- 不应宣称“插件市场一键安装已稳定”
- 不应宣称“上游升级已完全自动兼容”

## 结论

当前更适合表述为：

> 已具备发布前骨架与统一命令面，正在补发布前检查与平台验证矩阵。
