import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function resolveLocalAdapterPath() {
  if (process.env.HARNESS_LOCAL_ADAPTER) {
    return process.env.HARNESS_LOCAL_ADAPTER;
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'enterprise-harness', 'local-adapter.json');
  }
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configHome, 'enterprise-harness', 'local-adapter.json');
}

function problem(pathValue, code, severity, message, nextAction, source) {
  return {
    path: pathValue,
    code,
    severity,
    message,
    nextAction,
    source,
  };
}

function missingProblem(pathValue, severity, nextAction) {
  return problem(
    pathValue,
    severity === 'error' ? 'missing-required-field' : 'missing-warn-field',
    severity,
    `${pathValue} 缺失`,
    nextAction,
    'validator'
  );
}

export function validateLocalAdapterData(data) {
  const problems = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    problems.push(problem(
      '$',
      'invalid-type',
      'error',
      'adapter JSON 必须是对象',
      '请把 local adapter 文件修正为 JSON object。',
      'validator'
    ));
    return problems;
  }
  if ((data.schemaVersion ?? null) !== 1) {
    problems.push(problem(
      'schemaVersion',
      'invalid-schema-version',
      'error',
      'schemaVersion 必须为 1',
      '请把 schemaVersion 调整为 1。',
      'validator'
    ));
  }
  if (!data.runtimeVersion) {
    problems.push(missingProblem('runtimeVersion', 'error', '请填写当前 runtime 版本。'));
  }
  if (!data.nodeCommand) {
    problems.push(missingProblem('nodeCommand', 'error', '请填写当前机器用于执行 Node.js 的命令，例如 `node`。'));
  }
  if (!data.codegraphCommand) {
    problems.push(missingProblem('codegraphCommand', 'warn', '若当前机器支持 codegraph，请填写其命令；否则允许留空并接受 degraded diagnostics。'));
  }
  if (!data.context7 || typeof data.context7 !== 'object') {
    problems.push(problem(
      'context7',
      'invalid-type',
      'error',
      'context7 必须是对象',
      '请补齐 context7 配置对象。',
      'validator'
    ));
  }
  if (!data?.context7?.mode) {
    problems.push(missingProblem('context7.mode', 'error', '请填写 Context7 运行模式，例如 `cli`。'));
  }
  if (!data?.context7?.apiKeyEnvVar) {
    problems.push(missingProblem('context7.apiKeyEnvVar', 'warn', '若当前机器需要 Context7 API key，请填写对应环境变量名；否则允许保留为空并接受 warning。'));
  }
  if (!data.mcp || typeof data.mcp !== 'object') {
    problems.push(problem(
      'mcp',
      'invalid-type',
      'error',
      'mcp 必须是对象',
      '请补齐 mcp 配置对象。',
      'validator'
    ));
  }
  if (!data?.mcp?.projectConfig) {
    problems.push(missingProblem('mcp.projectConfig', 'error', '请填写 repo 内的 MCP project config 路径，例如 `.mcp.json`。'));
  }
  if (typeof data?.mcp?.requiresLocalApproval !== 'boolean') {
    problems.push(problem(
      'mcp.requiresLocalApproval',
      'invalid-type',
      'error',
      'mcp.requiresLocalApproval 必须是布尔值',
      '请把 mcp.requiresLocalApproval 修正为 true 或 false。',
      'validator'
    ));
  }
  return problems;
}

export function readLocalAdapter(options = {}) {
  const filePath = options.filePath || resolveLocalAdapterPath();
  const exists = options.exists || fs.existsSync;
  const readFile = options.readFile || ((target) => fs.readFileSync(target, 'utf-8'));

  if (!exists(filePath)) {
    return {
      path: filePath,
      exists: false,
      data: null,
      problems: [problem(
        '$',
        'adapter-file-missing',
        'warn',
        'adapter 文件不存在',
        `请先运行 setup-local-adapter 生成本机 adapter，默认路径：${filePath}`,
        'read'
      )],
      errors: ['adapter 文件不存在'],
    };
  }

  let text;
  try {
    text = readFile(filePath);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown';
    const message = error instanceof Error ? error.message : String(error);
    const problems = [problem(
      '$',
      'io-read-failed',
      'error',
      `读取 adapter 文件失败：${code} ${message}`,
      '请检查 adapter 文件权限、路径与可读性。',
      'read'
    )];
    return {
      path: filePath,
      exists: true,
      data: null,
      problems,
      errors: problems.map((item) => item.message),
    };
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const problems = [problem(
      '$',
      'invalid-json',
      'error',
      `adapter JSON 非法：${message}`,
      '请修复 local adapter JSON 格式。',
      'read'
    )];
    return {
      path: filePath,
      exists: true,
      data: null,
      problems,
      errors: problems.map((item) => item.message),
    };
  }

  const problems = validateLocalAdapterData(data);
  return {
    path: filePath,
    exists: true,
    data,
    problems,
    errors: problems.map((item) => item.message),
  };
}
