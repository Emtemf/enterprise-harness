# Runtime 操作

```bash
enterprise-harness bootstrap
enterprise-harness status
enterprise-harness doctor
enterprise-harness workflow status --json
enterprise-harness verify
enterprise-harness upstream-check
```

`doctor` 只检查本地环境，`doctor --online` 才探测 Context7。

`upstream-check` 默认验证确定性本地版本；Context7 和参考型上游显示为 `online-check-not-run` 或 `manual-review-required`。

`sync` 当前检查 marker、adapter 和环境一致性，不同步源码。命令准确参数以 `<command> --help` 为准。
