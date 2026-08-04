// `codegraph status` exits 0 whether or not the project has an index, so exit
// code alone cannot distinguish a working graph from a silently degraded one.
// Without an index every query fails and exploration falls back to raw
// grep/read — the context blowup the subagent contract exists to prevent.

const REMEDY = '在目标项目根目录运行 `codegraph init` 建立索引，否则 code-explore 会退化成全量 grep/read。';

export function evaluateCodegraphIndex(result) {
  if (!result || result.status !== 0) {
    const reason = String(result?.stderr || result?.error?.message || '').trim();
    return {
      ok: false,
      severity: 'warn',
      status: 'unavailable',
      detail: `codegraph CLI 不可用${reason ? `：${reason.split('\n')[0]}` : ''}。${REMEDY}`,
    };
  }

  const text = String(result.stdout || '').replace(/\[[0-9;]*m/gu, '');
  if (/not initialized/iu.test(text)) {
    return {
      ok: false,
      severity: 'warn',
      status: 'not-initialized',
      detail: `codegraph 索引未初始化，图查询会全部失败并静默退化成 grep/read。${REMEDY}`,
    };
  }

  const files = text.match(/Files:\s*([\d,]+)/u);
  const nodes = text.match(/Nodes:\s*([\d,]+)/u);
  return {
    ok: true,
    severity: 'info',
    status: 'indexed',
    detail: `codegraph 已索引${files ? ` files=${files[1]}` : ''}${nodes ? ` nodes=${nodes[1]}` : ''}`,
  };
}
