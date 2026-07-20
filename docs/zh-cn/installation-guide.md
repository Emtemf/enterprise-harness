# Enterprise Harness 安装教程

## 适用范围

这份文档只回答普通用户最关心的问题：

1. 怎么安装
2. 安装后从哪里开始

如果你是 maintainer / operator / 排障者，请直接跳到：

- [`maintainer-runtime-guide.md`](./maintainer-runtime-guide.md)

---

## 1. 你只需要记住什么

对普通用户来说，只需要记住两件事：

1. **安装 `enterprise-harness` 插件**
2. **进入 Claude Code 会话后，直接从 `/harness` 开始**

也就是说：

- plugin marketplace 是**安装方式**
- `/harness` 是**唯一工作流入口**
- `bootstrap` / `doctor` / `sync` / `verify` / `start-change` 这些都不是普通用户前门

---

## 2. 前置要求

### 必需

- Node.js **>= 20**
- Claude Code CLI 可用（`claude` 命令存在）
- 能进入本仓库根目录

### 推荐

- `codegraph` 可用
- `npx` 可用

---

## 3. 获取项目

```bash
git clone https://github.com/Emtemf/enterprise-harness.git
cd enterprise-harness
```

如果你的仓库目录名不是 `enterprise-harness`，进入你自己的实际目录即可。

---

## 4. 安装插件

### 方式 A：在 Claude Code 会话里（推荐，企业试点默认）

```bash
/plugin marketplace add https://github.com/Emtemf/enterprise-harness
/plugin install enterprise-harness@enterprise-harness
```

### 方式 B：在终端里执行等价命令

```bash
claude plugin marketplace add https://github.com/Emtemf/enterprise-harness
claude plugin install enterprise-harness@enterprise-harness --scope local
```

当前已确认：

- Git 远程仓库 URL 可以被 `claude plugin marketplace add` 识别为 marketplace 来源
- 在网络、代理、TLS clone 稳定时，这条链路更接近 `superpowers` 的安装体验

### 本地仓库 fallback（网络 / 代理 / TLS clone 不稳时使用）
如果你正在企业网络、代理环境、或 Git/TLS clone 不稳定的机器上实践，再退回本地仓库路径：

```bash
claude plugin marketplace add /absolute/path/to/enterprise-harness
claude plugin install enterprise-harness@enterprise-harness --scope local
```

> 注意：现在对普通用户的推荐主路径是**远程 Git 仓库 marketplace 安装**；
> 但为了真实企业环境可用性，仍保留本地路径 fallback，而不是假装远程链路在所有网络条件下都稳定。

---

## 5. 安装后怎么用

安装完成后，对普通用户来说只需要这样做：

1. 打开 Claude Code 会话
2. 输入 `/harness`

后续流程由系统负责继续带你往下走：

- `clarify`
- `route`
- `design`
- `plan`
- `tdd`
- `verify`
- `archive`

你不需要先理解这些阶段的内部实现，也不需要手动挑 backend 命令。

---

## 6. 更新插件

### Claude Code 会话里

```bash
/plugin marketplace update enterprise-harness
/plugin update enterprise-harness@enterprise-harness
```

### 终端等价命令

```bash
claude plugin marketplace update enterprise-harness
claude plugin update enterprise-harness@enterprise-harness --scope local
```

---

## 7. 到这里就够了

如果你是普通用户，到这里就可以停止阅读：

- 安装插件
- 打开 Claude Code
- 输入 `/harness`

如果你需要：

- runtime 初始化
- 本机 adapter 诊断
- warning 排查
- `start-change` / `lifecycle` 等后台命令
- 更底层的维护 / 排障说明

请继续阅读：

- [`maintainer-runtime-guide.md`](./maintainer-runtime-guide.md)

---

## 8. 已知边界

当前对普通用户最准确的结论是：

- **本地 marketplace 安装/更新路径可用**
- **安装后唯一工作流入口是 `/harness`**

这份文档不要求你先理解 runtime CLI、hooks、change state 或 reviewer 机制。

---

## 9. 相关文档

- [项目概览](./overview.md)
- [维护 / 排障指南](./maintainer-runtime-guide.md)
- `README.md`
- `CLAUDE.md`
