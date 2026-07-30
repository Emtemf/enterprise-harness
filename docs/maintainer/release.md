# 发布

```bash
node bin/release.mjs --patch --dry-run
node bin/release.mjs --patch
```

release 顺序：

1. 检查 clean、main、`origin/main` 和 tag。
2. 创建临时 branch/worktree。
3. 修改 `package.json.version`、从 Unreleased 生成 CHANGELOG 版本节并生成 manifest 投影。
4. 在隔离 checkout 中先执行最小 bootstrap，再运行 prepublish；验收不得依赖维护者机器之前留下的初始化标记。
5. 构建并解包验收 allowlisted artifact。
6. 只 add 版本投影和 CHANGELOG。
7. commit、tag、push commit、push tag。

GitHub release 再核对 tag/package 版本，生成 SHA256、CycloneDX SBOM，以 CHANGELOG 版本节作为 release body，并用解包 artifact 做 plugin validation。

禁止 `git add -A`、`git push origin main --tags` 和从 dirty worktree 发布。
