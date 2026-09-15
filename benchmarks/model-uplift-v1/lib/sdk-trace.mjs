const diagnosticPattern = /\b(EH-[A-Z0-9-]+-\d+)\b/u;

export function sanitizedSdkToolTrace(events) {
  return events.flatMap((event, eventIndex) => {
    const content = Array.isArray(event?.message?.content) ? event.message.content : [];
    return content.flatMap((block) => {
      if (block?.type === 'tool_use') {
        return [{ eventIndex, kind: 'tool-use', toolName: String(block.name || 'unknown'), toolUseId: block.id || null }];
      }
      if (block?.type !== 'tool_result') return [];
      const serialized = typeof block.content === 'string' ? block.content : JSON.stringify(block.content || '');
      return [{
        eventIndex,
        kind: 'tool-result',
        toolUseId: block.tool_use_id || null,
        isError: block.is_error === true,
        diagnosticCode: serialized.match(diagnosticPattern)?.[1] || null,
      }];
    });
  });
}
