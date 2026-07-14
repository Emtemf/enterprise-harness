# 发布前 Checklist

## 目标

在真正对外发布前，用一份固定清单防止遗漏关键检查项。

## Contract

- [ ] `README.md` 已更新
- [ ] `CLAUDE.md` 与 `harness/specs/mvp-roadmap.md` 没有明显冲突
- [ ] `harness/specs/upstream-governance.md` 已反映当前上游关系
- [ ] `harness/specs/platform-validation-matrix.md` 已反映当前平台状态
- [ ] `harness/specs/release-readiness.md` 已反映当前发布状态

## Runtime

- [ ] `node harness/plugin/runtime/cli.mjs --help` 可运行
- [ ] `doctor` 可运行
- [ ] `sync` 可运行
- [ ] `verify` 可运行
- [ ] `install` / `setup-local-adapter` / `update` / `upgrade` / `migrate` 均至少有 skeleton
- [ ] `upstream-check` 可运行

## Local Adapter

- [ ] `local-adapter.schema.json` 存在
- [ ] `local-adapter.example.json` 存在
- [ ] `setup-local-adapter.mjs --write` 可生成本机 adapter
- [ ] `doctor` / `sync` 能读取本机 adapter

## Platform

- [ ] Linux smoke test 通过
- [ ] macOS smoke test 通过或明确记录阻塞项
- [ ] Windows smoke test 通过或明确记录阻塞项
- [ ] 平台差异与 workaround 已写入 `platform-compatibility.md`

## Upstreams

- [ ] CodeGraph 当前验证版本已记录
- [ ] Context7 当前验证版本已记录
- [ ] Superpowers / OpenSpec 当前参考状态已记录
- [ ] `upstream-check` 结果已检查

## Publication

- [ ] package name / scope 已确认
- [ ] 发布策略（private / public / internal）已确认
- [ ] 版本号已确认
- [ ] 若要对外发布，先跑 `npm run prepublish-check`

## 结论

只有当上面关键项足够多地转绿，才适合把仓库从“公开 skeleton”推进到“正式对外安装资产”。
