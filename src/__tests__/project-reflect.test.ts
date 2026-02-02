/**
 * project-reflect command tests
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import {
  validateRepos,
  getProjectName,
  initProjectReflection,
  getCurrentProjectQuestion,
  submitProjectAnswer,
  cancelProjectReflection,
  getProjectSessionStatus,
} from '../commands/project-reflect';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('project-reflect', () => {
  describe('validateRepos', () => {
    test('validates valid git repository', () => {
      // Use current project directory as valid repository
      const cwd = process.cwd();
      const { valid, invalid } = validateRepos([cwd]);

      expect(valid).toContain(cwd);
      expect(invalid.length).toBe(0);
    });

    test('identifies invalid paths', () => {
      const { valid, invalid } = validateRepos(['/nonexistent/path']);

      expect(valid.length).toBe(0);
      expect(invalid).toContain('/nonexistent/path');
    });

    test('handles mixed valid and invalid paths', () => {
      const cwd = process.cwd();
      const { valid, invalid } = validateRepos([cwd, '/nonexistent/path']);

      expect(valid).toContain(cwd);
      expect(invalid).toContain('/nonexistent/path');
    });
  });

  describe('getProjectName', () => {
    test('returns directory name for single repo', () => {
      const name = getProjectName(['/home/user/projects/my-app']);
      expect(name).toBe('my-app');
    });

    test('returns joined name for multiple repos', () => {
      const name = getProjectName(['/home/user/frontend', '/home/user/backend']);
      expect(name).toBe('frontend_backend');
    });
  });

  describe('getProjectSessionStatus', () => {
    test('returns active: false when no session', () => {
      const status = getProjectSessionStatus();
      expect(status.active).toBe(false);
    });
  });

  describe('cancelProjectReflection', () => {
    test('returns failure when no session', () => {
      const result = cancelProjectReflection();
      expect(result.success).toBe(false);
    });
  });

  describe('getCurrentProjectQuestion', () => {
    test('returns error when no session', () => {
      const result = getCurrentProjectQuestion();
      expect(result.success).toBe(false);
      expect(result.message).toContain('No active project reflection session');
    });
  });

  describe('submitProjectAnswer', () => {
    test('returns error when no session', () => {
      const result = submitProjectAnswer('q1', 'test answer');
      expect(result.success).toBe(false);
      expect(result.message).toContain('No active project reflection session');
    });
  });

  describe('initProjectReflection', () => {
    beforeEach(() => {
      // Ensure no leftover sessions
      cancelProjectReflection();
    });

    afterEach(() => {
      // Clean up session
      cancelProjectReflection();
    });

    test('empty repo list returns error', async () => {
      const result = await initProjectReflection([]);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Please provide at least one repository path');
    });

    test('invalid repo path returns error', async () => {
      const result = await initProjectReflection(['/nonexistent/path']);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid repository paths');
    });

    test('valid repo can initialize session', async () => {
      const cwd = process.cwd();
      const result = await initProjectReflection([cwd]);

      // May succeed or fail depending on git history
      if (result.success) {
        expect(result.repos).toContain(cwd);
        expect(result.question).toBeDefined();
        expect(result.totalQuestions).toBeGreaterThan(0);
      } else {
        // If no data, should return appropriate error message
        expect(result.message).toBeDefined();
      }
    });

    test('can get session status after initialization', async () => {
      const cwd = process.cwd();
      const initResult = await initProjectReflection([cwd]);

      if (initResult.success) {
        const status = getProjectSessionStatus();
        expect(status.active).toBe(true);
        expect(status.repos).toContain(cwd);
      }
    });

    test('can get current question after initialization', async () => {
      const cwd = process.cwd();
      const initResult = await initProjectReflection([cwd]);

      if (initResult.success) {
        const questionResult = getCurrentProjectQuestion();
        expect(questionResult.success).toBe(true);
        expect(questionResult.question).toBeDefined();
        expect(questionResult.isComplete).toBe(false);
      }
    });

    test('can submit answer', async () => {
      const cwd = process.cwd();
      const initResult = await initProjectReflection([cwd]);

      if (initResult.success && initResult.question) {
        const answerResult = submitProjectAnswer(
          initResult.question.id,
          'This is a test answer with enough content to avoid follow-up questions'
        );
        expect(answerResult.success).toBe(true);
        expect(['follow_up', 'next', 'complete']).toContain(answerResult.action);
      }
    });

    test('can cancel session', async () => {
      const cwd = process.cwd();
      const initResult = await initProjectReflection([cwd]);

      if (initResult.success) {
        const cancelResult = cancelProjectReflection();
        expect(cancelResult.success).toBe(true);

        const status = getProjectSessionStatus();
        expect(status.active).toBe(false);
      }
    });
  });
});
