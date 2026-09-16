export function parseClaudeCodeVersion(raw) {
  const match = String(raw || '').match(/\b(\d+\.\d+\.\d+)\b/u);
  return match?.[1] || null;
}

export function assertSdkClaudeCompatibility(sdkPackage, claudeVersionOutput) {
  const sdkVersion = typeof sdkPackage?.version === 'string' ? sdkPackage.version : null;
  const expectedClaudeVersion = typeof sdkPackage?.claudeCodeVersion === 'string'
    ? sdkPackage.claudeCodeVersion
    : null;
  const actualClaudeVersion = parseClaudeCodeVersion(claudeVersionOutput);
  if (!sdkVersion || !expectedClaudeVersion || !actualClaudeVersion) {
    throw new Error('cannot verify Agent SDK and Claude Code version compatibility');
  }
  if (expectedClaudeVersion !== actualClaudeVersion) {
    throw new Error(`Agent SDK ${sdkVersion} requires Claude Code ${expectedClaudeVersion}, but benchmark executable is ${actualClaudeVersion}`);
  }
  return { sdkVersion, expectedClaudeVersion, actualClaudeVersion };
}
