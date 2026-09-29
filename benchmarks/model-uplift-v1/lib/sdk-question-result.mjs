export function hasSuccessfulToolResult(event, toolUseId) {
  if (!toolUseId || !Array.isArray(event?.message?.content)) return false;
  return event.message.content.some((block) => (
    block?.type === 'tool_result'
    && block.tool_use_id === toolUseId
    && block.is_error !== true
  ));
}
