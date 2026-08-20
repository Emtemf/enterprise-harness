// Runtime public API: task execution receipts and path safety.
// Skills may only import from runtime/api/*; runtime/core and runtime/lib are internal.

export { gitCommonDir } from '../lib/agent-evidence.mjs';
export { assertNoSymlinkComponents, assertSafeId, assertSafeRunId } from '../lib/safe-paths.mjs';
export {
  taskExecutionReceiptPath,
  taskExecutionReceiptSpoolPath,
  validateTaskExecutionReceipt,
} from '../lib/task-execution-receipt.mjs';
