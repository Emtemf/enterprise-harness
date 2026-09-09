# Enterprise governance failure-injection benchmark

这个基线回答一个比“第一次提问用了多少 token”更接近 Enterprise Harness 定位的问题：

> 当工件变旧、测试设计改变、agent 越权写入或缺少独立证明时，错误能否继续进入下一个阶段？

运行：

```bash
npm run benchmark:governance
```

需要保存带 commit、耗时和输出 digest 的结果时，将标准输出重定向到 benchmark 目录：

```bash
node benchmarks/governance-v1/run.mjs > benchmarks/governance-v1/result-local.json
```

## 解释边界

- 每个 failure case 由一个确定性 smoke test 注入异常，并断言 runtime 拒绝它。
- success case 防止“所有东西都拒绝”的伪安全：完整 lineage 必须仍能走完 Clarify 到 Archive。
- 这组数据只证明 Enterprise Harness 已实现自己的机械门禁，不证明 Superpowers 或 OpenSpec 在相同 case 中一定失败。
- 竞品结论仍必须来自固定版本官方合同或独立行为实验，不能把“没有同构 runtime”偷换成“没有任何控制能力”。
- token/ROI 必须由完整生命周期、多次真实模型运行另行证明。
