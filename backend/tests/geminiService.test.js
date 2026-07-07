const { parseResponseLegacy, extractSourceCitations, buildSystemPrompt } = require('../src/services/geminiService');

describe('extractSourceCitations', () => {
  test('extracts a single source citation', () => {
    const result = extractSourceCitations('According to [Source 1], the policy is clear.');
    expect(result).toEqual([1]);
  });

  test('extracts multiple citations deduplicated and sorted', () => {
    const result = extractSourceCitations('See [Source 2] and [Source 1] and [Source 2] again.');
    expect(result).toEqual([1, 2]);
  });

  test('no citations on "I don\'t know" response', () => {
    const result = extractSourceCitations("I don't know based on the uploaded documents.");
    expect(result).toEqual([]);
  });
});

describe('parseResponseLegacy (deprecated, kept for reference)', () => {
  test('parses a tool_call code block', () => {
    const text = '```tool_call\n{"tool": "save_task", "arguments": {"title": "Test"}}\n```';
    const result = parseResponseLegacy(text);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].tool).toBe('save_task');
    expect(result.toolCalls[0].arguments.title).toBe('Test');
  });

  test('parses a tool_code code block (format-drift case)', () => {
    const text = '```tool_code\n{"tool": "save_task", "arguments": {"title": "Format drift"}}\n```';
    const result = parseResponseLegacy(text);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].tool).toBe('save_task');
  });

  test('malformed JSON in a tool_call block does not throw', () => {
    const text = '```tool_call\n{invalid json}\n```\nNormal text.';
    expect(() => parseResponseLegacy(text)).not.toThrow();
    const result = parseResponseLegacy(text);
    expect(result.toolCalls).toBeUndefined();
    expect(result.text).toBe('Normal text.');
  });

  test('removes tool_call blocks from clean text', () => {
    const text = 'Some text\n```tool_call\n{"tool": "save_task", "arguments": {"title": "X"}}\n```\nMore text.';
    const result = parseResponseLegacy(text);
    expect(result.text).toBe('Some text\n\nMore text.');
  });
});

describe('buildSystemPrompt', () => {
  test('includes document context when chunks are provided', () => {
    const chunks = [
      { content: 'Policy document content', document_name: 'policy.pdf' },
      { content: 'Report data', document_name: 'report.pdf' },
    ];
    const prompt = buildSystemPrompt(chunks, []);
    expect(prompt).toContain('[Source 1]');
    expect(prompt).toContain('[Source 2]');
    expect(prompt).toContain('Policy document content');
    expect(prompt).toContain('<retrieved_document_data');
  });

  test('shows no relevant documents when chunks are empty', () => {
    const prompt = buildSystemPrompt([], []);
    expect(prompt).toContain('No relevant documents found');
  });

  test('includes tool definitions when provided', () => {
    const tools = [
      { name: 'save_task', description: 'Save a task', parameters: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } },
    ];
    const prompt = buildSystemPrompt([], tools);
    expect(prompt).toContain('AVAILABLE TOOLS');
    expect(prompt).toContain('save_task');
  });
});