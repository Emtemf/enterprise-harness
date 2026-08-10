import { projectRoot } from '../lib/checks.mjs';
import { runHookResult } from '../lib/hook-input.mjs';
import { taskCompleted } from '../lib/hooks/task-completed.mjs';

const root = projectRoot();
runHookResult(taskCompleted({ root }));
