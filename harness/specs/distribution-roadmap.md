# 插件分发路线图

## 目标

让当前 Enterprise Harness 从“公开仓库里的可运行骨架”继续走向“像 Superpowers / OpenSpec 一样可以快速安装、检查、更新的 Claude Code 插件资产”。

## 当前已具备

- 统一 runtime CLI：`harness/plugin/runtime/cli.mjs`
- 本地 doctor / sync / verify / install / migrate / upgrade / upstream-check
- 本机 local adapter 路径约定与 schema
- 公开仓库 README / CONTRIBUTING / issue templates
- root `package.json` 与 bin 入口骨架

## 当前还缺

### 1. 发布面
- npm / package registry 发布策略
- package 名称确认（当前 `package.json` 先用 `enterprise-harness` 占位）
- 发布版本号策略

### 2. 安装体验
- 真正的一键 install 流程
- 已发布包的 `npx` / `npm install -g` 路径
- 对 Claude Code 插件市场/分发入口的明确适配

### 3. 更新体验
- 更完整的 `update` 与 `upgrade` 语义区分
- 版本比较
- 迁移说明自动提示

### 4. 平台验证
- Windows 真机验证
- macOS 真机验证
- Linux 继续回归

## 建议阶段

### 阶段 1：仓库内分发骨架（已完成）
- root `package.json`
- bin 入口
- runtime CLI
- update skeleton

### 阶段 2：可安装路径
- 支持 `npm link` / `npm install -g` / 将来 `npx` 发布路径
- 明确安装者看到的最短路径

### 阶段 3：可更新路径
- 版本检查
- 上游升级检查
- local adapter 迁移提示

### 阶段 4：可发布路径
- 公开发布策略
- 兼容性矩阵
- 安装文档正式化

## 结论

当前项目已经具备“像插件一样组织”的骨架，但还没有完成真正的公开分发产品化。接下来应优先补：

1. package 分发路径
2. 一键 install
3. update / migrate 体验
4. Windows/macOS 真机验证
