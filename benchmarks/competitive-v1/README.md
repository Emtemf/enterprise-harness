# Enterprise Workflow Competitive Benchmark v1

本基准比较的不是“谁在所有场景都更好”，而是三个工具在 Claude Code 企业软件变更场景中的可观察行为：

- Enterprise Harness `0.5.30`；
- Superpowers `v6.3.0` / `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`；
- OpenSpec `v1.12.0` / `e062b9572be933564ba3899d059377dfa1393e32`。

## 公平性规则

1. 使用相同 Claude Code 版本、模型、基础仓库、业务请求、最大轮数和单轮预算。
2. 每个 system/repetition 使用 fresh git repository 和 fresh Claude session；运行顺序必须轮换。
3. 使用各产品官方入口，不强迫竞争产品模仿 Enterprise Harness 的命令面。
   OpenSpec 使用其 `init` 生成的项目级 Claude Code 配置；另两者使用 `--plugin-dir`。三者都隔离用户和 local settings。
4. 原始 token、cost、turn、tool use、产物和代码 diff 由 runner 采集；语义评分由不知道 system 名称的 reviewer 按 `rubric.json` 完成。
5. 每个 case 每个 system 至少 5 次；发布显著性结论前建议 10 次，并同时报告中位数、IQR、成功率与全部失败。
6. token 指标必须报告 raw input/output/cache tokens 和 `tokens_per_accepted_run`。不能只比较单轮 token，也不能把字节代理写成 token。
7. 功能存在性、确定性测试和模型表现分开报告；仓库测试数量不能作为跨产品质量分数。

## 首个 case

`brownfield-cancel-with-sdk` 测量从含已知歧义的 brownfield 请求，到系统首次提出有依据的业务问题或生成可供人审查的计划制品：

- 必须读取现有 `OrderService`/`OrderStatus` 事实；
- 必须查证 Stripe Java `24.0.0` 的幂等行为，或显式报告无法查证；
- 不得把退款失败一致性、审计字段和验收方式静默补成用户决定；
- 不得修改产品代码；
- 提问时至多一个业务 decision。

这是 pilot，不足以证明总体优越。后续 case 应覆盖 stale artifact、重启恢复、独立审查、真实 RED、路径攻击和归档离线复验。

## 运行

```bash
node benchmarks/competitive-v1/run.mjs \
  --superpowers-root /path/to/superpowers-v6.3.0 \
  --reps 5 \
  --model sonnet \
  --turn-budget-usd 3 \
  --results-dir benchmarks/competitive-v1/results/pilot-YYYYMMDD
```

`results/` 默认不进入版本控制。对外只提交脱敏、人工复核后的聚合结果与必要的 digest-bound 样本。

先运行 `--reps 1 --turn-budget-usd 1` 只验证采集链。正式样本必须给三套系统相同且足以完成 case 的预算；预算不足导致的中断计作失败，不能从 token 统计中删除。

## 盲审与汇总

runner 完成后生成不含 system label、原路径和原工具名的 reviewer packet；`review-key.json` 必须与 reviewer 隔离：

```bash
node benchmarks/competitive-v1/prepare-review.mjs \
  benchmarks/competitive-v1/results/run/raw-results.json \
  benchmarks/competitive-v1/results/run/review \
  fixed-randomization-seed
```

reviewer 按 `rubric.json` 写 `reviews.json`，格式为 `{"reviews":[{"sampleId":"...","scores":{"repository_grounding":0}}]}`，并补齐全部维度。最后解盲汇总：

```bash
node benchmarks/competitive-v1/summarize.mjs \
  benchmarks/competitive-v1/results/run/review/review-key.json \
  benchmarks/competitive-v1/results/run/review/reviews.json \
  benchmarks/competitive-v1/results/run/summary.json
```

artifact 内容可能仍通过专有术语暴露系统身份，所以这里只称 label-blind review，不宣称严格双盲。
