# 发布

0.3.19 到 0.4.0 使用 minor bump：

```bash
node bin/release.mjs --minor --dry-run
node bin/release.mjs --minor
```

release 前提：本机 `gh auth status --hostname github.com` 成功，且当前账号对 `origin` 指向的 GitHub 仓库具有 write、maintain 或 admin 权限。

release 顺序：

1. 检查 clean、main、`origin/main` 和 tag。
2. 创建临时 branch/worktree。
3. 修改 `package.json.version`、从 Unreleased 生成 CHANGELOG 版本节并生成 manifest 投影。
4. 验证全部 tracked diff 精确等于版本投影与 CHANGELOG allowlist，只 add 这些文件并 commit。
5. 从已提交且 tracked-clean 的 release tree 运行 `quality:local`，完成 prepublish、external-project E2E、制品、SBOM、release notes 与解包验收；artifact manifest 的每个输入还必须由 release commit 跟踪且 size/SHA256 与该 clean tree 一致。
6. tag、push commit、核对 `origin/main` commit、push tag，再核对远端 tag target。
7. 从 `origin` URL 解析 GitHub `owner/repo`，通过本机 `gh release create --verify-tag` 上传已验收附件。

release 不接受独立 `--repo` 真相：GitHub Release 目标必须由 `remote.origin.url` 解析，并且远端 tag 必须与 release commit 完全相同。

## 部分发布恢复

在首次远端 main push 之后发生任何失败，脚本会保留临时 worktree/制品，并输出结构化恢复记录：

- `RECOVERY_WORKTREE=<path>`：保留的已验收 release tree。
- `RECOVERY_TAG_ARGV=[...]`：仅在 main 已推送但 tag 缺失或不一致时输出；先按 JSON argv 原样执行。
- `RECOVERY_RELEASE_ARGV=[...]`：tag 已正确发布后，在 `RECOVERY_WORKTREE` 中按 JSON argv 原样执行。

对应三种状态：

1. main 明确未发布：修复原始错误后正常重跑 release。若 push 后无法读取远端状态，脚本会保留 `RECOVERY_WORKTREE` 但不会给出不安全的 tag/Release argv；先人工核对 origin/main。
2. main 已发布、tag 缺失：依次执行 `RECOVERY_TAG_ARGV`、`RECOVERY_RELEASE_ARGV`。
3. main 与 tag 已发布、GitHub Release 缺失：只执行 `RECOVERY_RELEASE_ARGV`。

恢复成功并核对 GitHub Release 附件后，再用 `git worktree remove <RECOVERY_WORKTREE>` 清理保留目录；不要在恢复前删除它。

禁止 `git add -A`、`git push origin main --tags` 和从 dirty worktree 发布。
