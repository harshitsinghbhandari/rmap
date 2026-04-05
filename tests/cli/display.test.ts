import assert from 'node:assert';
import { displayMapStatus } from '../../src/cli/display.js';
import type { MapStatusResult } from '../../src/cli/types.js';

describe('CLI Display', () => {
  test('displayMapStatus handles map not found case', () => {
    const result: MapStatusResult = {
      hasMap: false,
      hasCheckpoint: false,
      checkpoint: undefined,
      metadata: undefined,
      changes: undefined,
      verdict: undefined,
    };

    const consoleSpy = [];
    const originalLog = console.log;
    console.log = (...args) => consoleSpy.push(args.join(' '));

    displayMapStatus(result);

    assert.ok(consoleSpy.some(msg => msg.includes('No map found')), 'Should log "No map found"');
    assert.ok(consoleSpy.some(msg => msg.includes('Run `rmap map` to create a new map')), 'Should suggest creating a new map');

    console.log = originalLog;
  });

  test('displayMapStatus handles up-to-date case', () => {
    const result: MapStatusResult = {
      hasMap: true,
      hasCheckpoint: false,
      checkpoint: undefined,
      metadata: {
        version: '1.0.0',
        schema: '1.0',
        buildCommitShort: 'abc1234',
        commitAge: 1,
        currentCommitShort: 'abc1234',
        commitsAhead: 0,
      },
      changes: {
        totalChanges: 0,
        changedFiles: [],
        deletedFiles: 0,
        updateStrategy: 'none',
        reason: '',
      },
      verdict: 'up-to-date',
    };

    const consoleSpy = [];
    const originalLog = console.log;
    console.log = (...args) => consoleSpy.push(args.join(' '));

    displayMapStatus(result);

    assert.ok(consoleSpy.some(msg => msg.includes('MAP IS UP TO DATE')), 'Should log "MAP IS UP TO DATE"');

    console.log = originalLog;
  });
});
