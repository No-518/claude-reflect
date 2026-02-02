/**
 * PitfallDetector tests
 */

import { describe, expect, test } from 'bun:test';
import { PitfallDetector } from '../core/pitfall';
import type { GitCommit, Observation } from '../types';

describe('PitfallDetector', () => {
  const detector = new PitfallDetector();

  describe('detectFromCommits', () => {
    test('detects revert commits', () => {
      const commits: GitCommit[] = [
        {
          hash: 'abc123',
          message: 'Revert "Add feature X"',
          author: 'Test',
          email: 'test@test.com',
          timestamp: '2026-02-03T10:00:00Z',
          files_changed: 2,
          additions: 0,
          deletions: 50,
          files: [],
        },
      ];

      const signals = detector.detectFromCommits(commits);
      const revertSignals = signals.filter(s => s.type === 'revert');

      expect(revertSignals.length).toBeGreaterThan(0);
      expect(revertSignals[0].severity).toBe('high');
    });

    test('detects fix commits', () => {
      const commits: GitCommit[] = [
        {
          hash: 'abc123',
          message: 'fix: resolve login issue',
          author: 'Test',
          email: 'test@test.com',
          timestamp: '2026-02-03T10:00:00Z',
          files_changed: 1,
          additions: 5,
          deletions: 2,
          files: [],
        },
        {
          hash: 'def456',
          message: 'fix(auth): handle token expiry',
          author: 'Test',
          email: 'test@test.com',
          timestamp: '2026-02-03T11:00:00Z',
          files_changed: 1,
          additions: 10,
          deletions: 3,
          files: [],
        },
      ];

      const signals = detector.detectFromCommits(commits);
      const fixSignals = signals.filter(s => s.type === 'fix');

      expect(fixSignals.length).toBeGreaterThan(0);
    });

    test('detects high-frequency file modifications', () => {
      const commits: GitCommit[] = [
        {
          hash: 'abc123',
          message: 'update index.ts',
          author: 'Test',
          email: 'test@test.com',
          timestamp: '2026-02-03T10:00:00Z',
          files_changed: 1,
          additions: 5,
          deletions: 2,
          files: [{ path: 'src/index.ts', additions: 5, deletions: 2 }],
        },
        {
          hash: 'def456',
          message: 'another update to index.ts',
          author: 'Test',
          email: 'test@test.com',
          timestamp: '2026-02-03T11:00:00Z',
          files_changed: 1,
          additions: 3,
          deletions: 1,
          files: [{ path: 'src/index.ts', additions: 3, deletions: 1 }],
        },
        {
          hash: 'ghi789',
          message: 'yet another update to index.ts',
          author: 'Test',
          email: 'test@test.com',
          timestamp: '2026-02-03T12:00:00Z',
          files_changed: 1,
          additions: 2,
          deletions: 2,
          files: [{ path: 'src/index.ts', additions: 2, deletions: 2 }],
        },
      ];

      const signals = detector.detectFromCommits(commits);
      const highFreqSignals = signals.filter(s => s.type === 'high_frequency');

      expect(highFreqSignals.length).toBeGreaterThan(0);
      expect(highFreqSignals[0].file).toBe('src/index.ts');
    });

    test('detects massive refactors', () => {
      const commits: GitCommit[] = [
        {
          hash: 'abc123',
          message: 'refactor: rewrite authentication module',
          author: 'Test',
          email: 'test@test.com',
          timestamp: '2026-02-03T10:00:00Z',
          files_changed: 10,
          additions: 500,
          deletions: 400,
          files: [],
        },
      ];

      const signals = detector.detectFromCommits(commits);
      const refactorSignals = signals.filter(s => s.type === 'massive_refactor');

      expect(refactorSignals.length).toBeGreaterThan(0);
    });

    test('returns empty signals for empty commits', () => {
      const signals = detector.detectFromCommits([]);
      expect(signals).toEqual([]);
    });
  });

  describe('detectFromObservations', () => {
    test('detects bugfix observations', () => {
      const observations: Observation[] = [
        {
          id: 1,
          memory_session_id: 'session-1',
          project: 'test-project',
          type: 'bugfix',
          title: 'Fixed null pointer exception',
          subtitle: null,
          narrative: 'User reported crash on login',
          facts: null,
          concepts: null,
          files_read: null,
          files_modified: null,
          prompt_number: null,
          created_at: '2026-02-03T10:00:00Z',
          created_at_epoch: 1738584000000,
        },
      ];

      const signals = detector.detectFromObservations(observations);
      const bugfixSignals = signals.filter(s => s.type === 'bugfix_observation');

      expect(bugfixSignals.length).toBeGreaterThan(0);
    });

    test('detects observations with issue keywords', () => {
      const observations: Observation[] = [
        {
          id: 1,
          memory_session_id: 'session-1',
          project: 'test-project',
          type: 'discovery',
          title: 'Found an issue',
          subtitle: null,
          narrative: 'Found a problem: config file not loading correctly',
          facts: null,
          concepts: null,
          files_read: null,
          files_modified: null,
          prompt_number: null,
          created_at: '2026-02-03T10:00:00Z',
          created_at_epoch: 1738584000000,
        },
      ];

      const signals = detector.detectFromObservations(observations);

      expect(signals.length).toBeGreaterThan(0);
    });

    test('returns empty signals for empty observations', () => {
      const signals = detector.detectFromObservations([]);
      expect(signals).toEqual([]);
    });
  });

  describe('mergeSignals', () => {
    test('merges signals of same type', () => {
      const signals = [
        {
          type: 'fix' as const,
          date: '2026-02-03',
          commits: ['abc123'],
          severity: 'low' as const,
          description: 'Fix 1',
        },
        {
          type: 'fix' as const,
          date: '2026-02-03',
          commits: ['def456'],
          severity: 'medium' as const,
          description: 'Fix 2',
        },
      ];

      const merged = detector.mergeSignals(signals);

      expect(merged.length).toBe(1);
      expect(merged[0].commits.length).toBe(2);
      expect(merged[0].severity).toBe('medium'); // Takes highest severity
    });

    test('keeps different type signals separate', () => {
      const signals = [
        {
          type: 'fix' as const,
          date: '2026-02-03',
          commits: ['abc123'],
          severity: 'low' as const,
          description: 'Fix',
        },
        {
          type: 'revert' as const,
          date: '2026-02-03',
          commits: ['def456'],
          severity: 'high' as const,
          description: 'Revert',
        },
      ];

      const merged = detector.mergeSignals(signals);

      expect(merged.length).toBe(2);
    });
  });
});
