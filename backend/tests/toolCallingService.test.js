const { validateToolArguments, convertToFunctionDeclarations } = require('../src/services/toolCallingService');

describe('validateToolArguments', () => {
  test('valid call with all required fields passes', () => {
    const result = validateToolArguments('save_task', { title: 'Review report' });
    expect(result).toEqual({ title: 'Review report' });
  });

  test('throws for unknown tool', () => {
    expect(() => {
      validateToolArguments('unknown_tool', {});
    }).toThrow('Unknown tool: unknown_tool');
  });

  test('throws for missing required field', () => {
    expect(() => {
      validateToolArguments('save_task', {});
    }).toThrow("Missing required argument 'title' for tool 'save_task'");
  });

  test('throws for unknown argument', () => {
    expect(() => {
      validateToolArguments('save_task', { title: 'Test', unknownField: 'value' });
    }).toThrow("Unknown argument 'unknownField' for tool 'save_task'");
  });

  test('throws for wrong type', () => {
    expect(() => {
      validateToolArguments('save_task', { title: 123 });
    }).toThrow("Argument 'title' must be of type string");
  });

  test('throws for invalid enum value', () => {
    expect(() => {
      validateToolArguments('send_workspace_summary', { platform: 'telegram', summary: 'test' });
    }).toThrow("Argument 'platform' must be one of: discord, slack, both");
  });

  test('throws for over-length string', () => {
    const longTitle = 'x'.repeat(501);
    expect(() => {
      validateToolArguments('save_task', { title: longTitle });
    }).toThrow("Argument 'title' exceeds maximum length of 500 characters");
  });

  test('sanitizes control characters from string inputs', () => {
    const result = validateToolArguments('save_task', { title: 'Hello\x00World\x1FTest' });
    expect(result.title).toBe('HelloWorldTest');
  });
});

describe('convertToFunctionDeclarations', () => {
  test('converts tool definitions to SDK functionDeclarations format', () => {
    const definitions = [
      {
        name: 'save_task',
        description: 'Save a task',
        parameters: {
          type: 'object',
          properties: { title: { type: 'string', description: 'The title' } },
          required: ['title'],
        },
      },
    ];

    const result = convertToFunctionDeclarations(definitions);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('save_task');
    expect(result[0].description).toBe('Save a task');
    expect(result[0].parameters.type).toBe('OBJECT');
    expect(result[0].parameters.properties.title.type).toBe('string');
    expect(result[0].parameters.required).toEqual(['title']);
  });

  test('returns empty array for empty definitions', () => {
    expect(convertToFunctionDeclarations([])).toEqual([]);
    expect(convertToFunctionDeclarations(null)).toEqual([]);
    expect(convertToFunctionDeclarations(undefined)).toEqual([]);
  });

  test('handles multiple tools', () => {
    const definitions = [
      { name: 'save_task', description: 'Save', parameters: { properties: { title: {} }, required: [] } },
      { name: 'send_workspace_summary', description: 'Send', parameters: { properties: { platform: {} }, required: ['platform'] } },
    ];
    const result = convertToFunctionDeclarations(definitions);
    expect(result).toHaveLength(2);
    expect(result[1].name).toBe('send_workspace_summary');
  });
});
