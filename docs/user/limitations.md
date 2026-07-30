# 已知限制

- 当前首要运行面是 Claude Code，不承诺其他 agent harness 的 hook 兼容。
- 默认治理路径针对 Java/Spring Boot/Maven；Gradle 和其他语言仍需项目策略与 acceptance fixture。
- OpenAPI 与 Controller 检查尚不能覆盖全部合法 YAML、组合 schema、注解元编程和运行时 Spring mapping。
- Context7 是首选资料入口但不是最终权威；不足时仍需官方文档或源码。
- hooks 不能替代操作系统 sandbox、仓库权限、CI 分支保护或供应链安全。
- worktree 只隔离文件和分支，不等于上下文隔离。
- Windows、macOS、Linux 的 CI 配置存在，实时是否通过以 GitHub Actions 为准。
- standalone 安装支持备份和回滚，但修改过的合并配置在卸载时会保留，需要人工清理 harness hook。
- state/event 已使用 revision CAS、进程锁、原子 rename 与幂等 eventId；跨主机共享文件系统仍需外部协调。
- 当前 API checker 解析不到结构时必须返回 `unsupported`；尚未实现的解析面不能声称 pass。
