# Exploration

## Topic
improve installer, launcher, readiness separation, and runtime verification

## Date
2026-07-16

## Request Shape
modify

## Candidate Tier
L3

## Owning Module / Domain / Service
- scope: portable runtime / runtime productization
- module: `harness/plugin/runtime/`
- supporting CI/docs: `.github/workflows/`, `README.md`

## Codegraph Attempt
- Status: used
- Queries:
  - `installer upgrade migration upstream-check local adapter schema doctor sync platform smoke workflow files runtime productization current commands and docs`
- Key Findings:
  - `release-local.mjs` 已完成 fresh source-external smoke，但 broader runtime productization 仍未收口
  - `verify.mjs` 仍把 contract / runtime readiness 混成一个绿灯口径
  - `upstream-check.mjs` 仍只展示 current/expected，不显式标记 validated-version mismatch
  - issue #10 audit comment还要求 external-cwd launcher、Windows argv boundary、help no-side-effect 和 readiness separation
- Fallback Reason: none

## Context7 / Documentation Attempt
- Library Name: none needed
- Resolved Library ID: n/a
- Version: n/a
- Query: n/a
- Key Findings:
  - 当前问题主要是仓库内 runtime/productization contract，而不是外部库版本行为
- Fallback Reason: repo code facts already sufficient

## Impact Summary
- API: no
- Data: no
- Architecture: yes
- Rule: yes

## Unknowns
- verify 是拆子命令还是仅调整 JSON/human wording
- Windows argv boundary 是否需要专门的 wrapper helper

## Decisions Required
- runtime readiness 与 contract verify 的最终命令边界
- validated version mismatch 的 fail/warn 策略

## Confidence
medium-high
