# 打包

```bash
node bin/package.mjs --out dist
```

打包器使用 allowlist。输出 tarball、`manifest-files.json` 和 `SHA256SUMS`。

包含 plugin manifest、skills、agents、rules、hooks、runtime、现行 specs、state schema、templates、reviewers、upstream registry、capability manifest、bin、README、CHANGELOG、LICENSE 和 package metadata。

打包器按稳定路径顺序归档文件，并把归档内文件时间归一化；同一源码状态重复打包必须得到相同 SHA256。

排除 changes、archive、work、lessons、active pointer、源仓库 evidence/command policy、runtime tests、内部状态、local adapter 和 receipts。

验收：

```bash
node harness/plugin/runtime/test/artifact-content-smoke.mjs verify
node bin/validate-artifact.mjs <tarball> <version>
```
