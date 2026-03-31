/**
 * Tests for CLI commands
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { mapCommand } from '../../src/cli/commands/map.js';
import { getContextCommand } from '../../src/cli/commands/get-context.js';

describe('Map Command', () => {
  test('should have correct name', () => {
    assert.strictEqual(mapCommand.name(), 'map', 'Command should be named "map"');
  });

  test('should have correct description', () => {
    const description = mapCommand.description();
    assert(description, 'Command should have a description');
    assert(description.includes('map'), 'Description should mention map');
  });

  test('should support --full option', () => {
    const options = mapCommand.options;
    const fullOption = options.find((opt) => opt.long === '--full');

    assert(fullOption, 'Should have --full option');
    assert(
      fullOption.description.toLowerCase().includes('full'),
      'Option description should mention full rebuild'
    );
  });

  test('should support --status option', () => {
    const options = mapCommand.options;
    const statusOption = options.find((opt) => opt.long === '--status');

    assert(statusOption, 'Should have --status option');
    assert(
      statusOption.description.toLowerCase().includes('status'),
      'Option description should mention status'
    );
  });

  test('should support --update option', () => {
    const options = mapCommand.options;
    const updateOption = options.find((opt) => opt.long === '--update');

    assert(updateOption, 'Should have --update option');
    assert(
      updateOption.description.toLowerCase().includes('update'),
      'Option description should mention update'
    );
  });

  test('should have exactly three options', () => {
    const options = mapCommand.options;
    assert.strictEqual(options.length, 3, 'Command should have exactly 3 options');
  });
});

describe('Get-Context Command', () => {
  test('should have correct name', () => {
    assert.strictEqual(
      getContextCommand.name(),
      'get-context',
      'Command should be named "get-context"'
    );
  });

  test('should have correct description', () => {
    const description = getContextCommand.description();
    assert(description, 'Command should have a description');
    assert(
      description.toLowerCase().includes('query') || description.toLowerCase().includes('context'),
      'Description should mention query or context'
    );
  });

  test('should support --file option', () => {
    const options = getContextCommand.options;
    const fileOption = options.find((opt) => opt.long === '--file');

    assert(fileOption, 'Should have --file option');
    assert(
      fileOption.description.toLowerCase().includes('file'),
      'Option description should mention file'
    );
  });

  test('should support --path option', () => {
    const options = getContextCommand.options;
    const pathOption = options.find((opt) => opt.long === '--path');

    assert(pathOption, 'Should have --path option');
    assert(
      pathOption.description.toLowerCase().includes('path') ||
        pathOption.description.toLowerCase().includes('directory'),
      'Option description should mention path or directory'
    );
  });

  test('should have exactly two options', () => {
    const options = getContextCommand.options;
    assert.strictEqual(options.length, 2, 'Command should have exactly 2 options');
  });

  test('should accept variadic tags argument', () => {
    const args = getContextCommand.registeredArguments;
    assert(args.length > 0, 'Command should accept arguments');

    const tagsArg = args[0];
    assert(tagsArg.variadic, 'First argument should be variadic');
    assert(!tagsArg.required, 'Tags argument should be optional');
  });
});

describe('Command Options Validation', () => {
  test('map command options should not conflict', () => {
    const options = mapCommand.options;
    const optionNames = options.map((opt) => opt.long);
    const uniqueNames = new Set(optionNames);

    assert.strictEqual(
      optionNames.length,
      uniqueNames.size,
      'All option names should be unique'
    );
  });

  test('get-context command options should not conflict', () => {
    const options = getContextCommand.options;
    const optionNames = options.map((opt) => opt.long);
    const uniqueNames = new Set(optionNames);

    assert.strictEqual(
      optionNames.length,
      uniqueNames.size,
      'All option names should be unique'
    );
  });

  test('map command options should have descriptions', () => {
    const options = mapCommand.options;

    for (const option of options) {
      assert(option.description, `Option ${option.long} should have a description`);
      assert(
        option.description.length > 0,
        `Option ${option.long} description should not be empty`
      );
    }
  });

  test('get-context command options should have descriptions', () => {
    const options = getContextCommand.options;

    for (const option of options) {
      assert(option.description, `Option ${option.long} should have a description`);
      assert(
        option.description.length > 0,
        `Option ${option.long} description should not be empty`
      );
    }
  });
});

describe('Command Structure', () => {
  test('map command should be a Commander command', () => {
    assert(mapCommand, 'mapCommand should exist');
    assert.strictEqual(typeof mapCommand.name, 'function', 'Should have name method');
    assert.strictEqual(typeof mapCommand.description, 'function', 'Should have description method');
    assert.strictEqual(typeof mapCommand.action, 'function', 'Should have action method');
  });

  test('get-context command should be a Commander command', () => {
    assert(getContextCommand, 'getContextCommand should exist');
    assert.strictEqual(typeof getContextCommand.name, 'function', 'Should have name method');
    assert.strictEqual(
      typeof getContextCommand.description,
      'function',
      'Should have description method'
    );
    assert.strictEqual(typeof getContextCommand.action, 'function', 'Should have action method');
  });
});
