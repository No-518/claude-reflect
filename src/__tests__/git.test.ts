/**
 * GitHistoryReader 单元测试
 */

import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { GitHistoryReader } from '../integrations/git';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

// Mock child_process.execSync
const mockExecSync = mock(() => '');

describe('GitHistoryReader', () => {
  describe('isGitRepo', () => {
    test('should return true for valid git repo', () => {
      const reader = new GitHistoryReader(process.cwd());
      // 当前项目是 git 仓库
      expect(reader.isGitRepo()).toBe(true);
    });

    test('should return false for non-git directory', () => {
      const reader = new GitHistoryReader('/tmp');
      expect(reader.isGitRepo()).toBe(false);
    });
  });

  describe('parseGitLog', () => {
    test('should parse git log output correctly', () => {
      const reader = new GitHistoryReader(process.cwd());

      // 测试解析逻辑 (调用私有方法需要通过 any 类型)
      const sampleOutput = `"abc123|Fix bug in login|John Doe|john@example.com|2026-02-03T10:00:00+08:00"
5	2	src/auth.ts
3	1	src/utils.ts
"def456|Add new feature|Jane Doe|jane@example.com|2026-02-03T11:00:00+08:00"
10	0	src/feature.ts`;

      const commits = (reader as any).parseGitLog(sampleOutput);

      expect(commits).toHaveLength(2);
      expect(commits[0].hash).toBe('abc123');
      expect(commits[0].message).toBe('Fix bug in login');
      expect(commits[0].author).toBe('John Doe');
      expect(commits[0].files_changed).toBe(2);
      expect(commits[0].additions).toBe(8);
      expect(commits[0].deletions).toBe(3);

      expect(commits[1].hash).toBe('def456');
      expect(commits[1].message).toBe('Add new feature');
      expect(commits[1].files_changed).toBe(1);
    });

    test('should handle empty output', () => {
      const reader = new GitHistoryReader(process.cwd());
      const commits = (reader as any).parseGitLog('');
      expect(commits).toHaveLength(0);
    });
  });

  describe('parseNumstatLine', () => {
    test('should parse numstat line correctly', () => {
      const reader = new GitHistoryReader(process.cwd());

      const result = (reader as any).parseNumstatLine('5\t2\tsrc/index.ts');
      expect(result).toEqual({
        path: 'src/index.ts',
        additions: 5,
        deletions: 2,
      });
    });

    test('should handle binary files (- - notation)', () => {
      const reader = new GitHistoryReader(process.cwd());

      const result = (reader as any).parseNumstatLine('-\t-\tassets/image.png');
      expect(result).toEqual({
        path: 'assets/image.png',
        additions: 0,
        deletions: 0,
      });
    });

    test('should return null for invalid lines', () => {
      const reader = new GitHistoryReader(process.cwd());

      expect((reader as any).parseNumstatLine('')).toBeNull();
      expect((reader as any).parseNumstatLine('invalid')).toBeNull();
    });
  });

  describe('parseCommitHeader', () => {
    test('should parse commit header correctly', () => {
      const reader = new GitHistoryReader(process.cwd());

      const result = (reader as any).parseCommitHeader(
        '"abc123|Fix bug|John Doe|john@example.com|2026-02-03T10:00:00+08:00"'
      );

      expect(result.hash).toBe('abc123');
      expect(result.message).toBe('Fix bug');
      expect(result.author).toBe('John Doe');
      expect(result.email).toBe('john@example.com');
      expect(result.timestamp).toBe('2026-02-03T10:00:00+08:00');
    });
  });

  describe('buildGitLogArgs', () => {
    test('should build args with date range', () => {
      const reader = new GitHistoryReader(process.cwd());

      const args = (reader as any).buildGitLogArgs({
        since: '2026-02-01',
        until: '2026-02-03',
      });

      expect(args).toContain('--since="2026-02-01"');
      expect(args).toContain('--until="2026-02-03"');
    });

    test('should build args with limit', () => {
      const reader = new GitHistoryReader(process.cwd());

      const args = (reader as any).buildGitLogArgs({ limit: 10 });
      expect(args).toContain('-n 10');
    });

    test('should build args with author filter', () => {
      const reader = new GitHistoryReader(process.cwd());

      const args = (reader as any).buildGitLogArgs({ author: 'John' });
      expect(args).toContain('--author="John"');
    });
  });

  describe('getCommitsFromRepos', () => {
    test('should merge commits from multiple repos', () => {
      // 测试静态方法
      const commits = GitHistoryReader.getCommitsFromRepos(
        [process.cwd()],
        { limit: 5 }
      );

      // 应该返回数组（可能为空，取决于仓库状态）
      expect(Array.isArray(commits)).toBe(true);
    });
  });
});
