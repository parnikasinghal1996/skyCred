import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDotEnv } from '../scripts/build.mjs';

test('parseDotEnv reads KEY=value pairs, quotes, comments and export prefixes', () => {
  const parsed = parseDotEnv(
    [
      '# a comment',
      '',
      'WEATHER_API_KEY=abc123',
      'QUOTED="with spaces"',
      "SINGLE='single'",
      'export EXPORTED=yes',
      'INLINE=value # trailing comment',
      'EMPTY=',
      'not a pair',
    ].join('\n')
  );
  assert.deepEqual(parsed, {
    WEATHER_API_KEY: 'abc123',
    QUOTED: 'with spaces',
    SINGLE: 'single',
    EXPORTED: 'yes',
    INLINE: 'value',
    EMPTY: '',
  });
});

test('parseDotEnv handles Windows line endings', () => {
  assert.deepEqual(parseDotEnv('A=1\r\nB=2\r\n'), { A: '1', B: '2' });
});
