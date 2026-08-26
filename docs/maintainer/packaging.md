# 打包

```bash
node bin/package.mjs --out dist
```

打包器使用 allowlist。输出 tarball、`manifest-files.json` 和 `SHA256SUMS`。

包含 plugin manifest、skills、agents、rules、hooks、runtime、现行 specs、state schema、project profile、templates、reviewers、upstream registry、capability manifest、bin、README、CHANGELOG、LICENSE 和 package metadata。

Harness artifact 必须同时包含 compact `skills/harness/SKILL.md`、三份按状态加载的 Clarify phase references、
output contract、few-shots 及其可达 assets/scripts。Supporting file 只出现在 tarball 不算可用；controller/reference
链接图必须让每个资源从 SKILL.md 可达，并且每个 reference 在开头声明 observable load condition 与 return-to-controller。

打包器使用内置的确定性 ustar/gzip writer，按稳定路径顺序归档并归一化 header；同一源码状态在各平台重复打包必须得到相同 SHA256。

排除 changes、archive、work、lessons、active pointer、源仓库 evidence/command policy、runtime tests、
`test/skill-evals/harness/` 研发评测、内部状态、local adapter 和 receipts。

验收：

```bash
node runtime/test/artifact-content-smoke.mjs verify
node runtime/test/harness-controller-routing-smoke.mjs verify
node bin/validate-artifact.mjs <tarball> <version>
```
