/**
 * ProfileManager 单元测试
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ProfileManager } from '../core/profile';
import { existsSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// 为每个测试生成唯一路径的辅助函数
let testCounter = 0;
function createTestManager(): { manager: ProfileManager; testDir: string } {
  testCounter++;
  const randomSuffix = Math.random().toString(36).substring(2, 10);
  const testDir = join(tmpdir(), `claude-reflect-test-${Date.now()}-${testCounter}-${randomSuffix}`);
  mkdirSync(testDir, { recursive: true });
  const profilePath = join(testDir, 'profile.json');
  return { manager: new ProfileManager(profilePath), testDir };
}

function cleanupTestDir(testDir: string): void {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // 忽略清理错误
  }
}

describe('ProfileManager', () => {
  let testDir: string;
  let profilePath: string;
  let manager: ProfileManager;

  beforeEach(() => {
    const result = createTestManager();
    manager = result.manager;
    testDir = result.testDir;
    profilePath = join(testDir, 'profile.json');
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  describe('initialize', () => {
    test('should create default profile if not exists', () => {
      const profile = manager.initialize();

      expect(profile.version).toBe('1.0');
      expect(profile.technical_level.overall).toBe('unknown');
      expect(profile.strengths).toEqual([]);
      expect(profile.weaknesses).toEqual([]);
      expect(existsSync(profilePath)).toBe(true);
    });

    test('should load existing profile', () => {
      // 先初始化
      manager.initialize();
      manager.addStrength('TypeScript');

      // 创建新 manager 实例
      const manager2 = new ProfileManager(profilePath);
      const profile = manager2.initialize();

      expect(profile.strengths).toContain('TypeScript');
    });
  });

  describe('load', () => {
    test('should initialize if profile does not exist', () => {
      const profile = manager.load();
      expect(profile.version).toBe('1.0');
    });

    test('should return cached profile on second call', () => {
      manager.initialize();
      const profile1 = manager.load();
      const profile2 = manager.load();
      expect(profile1).toBe(profile2);
    });
  });

  describe('update', () => {
    test('should update profile fields', () => {
      manager.initialize();

      const updated = manager.update({
        technical_level: {
          overall: 'intermediate',
          confidence: 0.7,
          domains: { TypeScript: 'advanced' },
        },
      });

      expect(updated.technical_level.overall).toBe('intermediate');
      expect(updated.technical_level.confidence).toBe(0.7);
      expect(updated.technical_level.domains.TypeScript).toBe('advanced');
    });

    test('should preserve existing fields during update', () => {
      manager.initialize();
      manager.addStrength('Problem solving');

      const updated = manager.update({
        weaknesses: ['Documentation'],
      });

      expect(updated.strengths).toContain('Problem solving');
      expect(updated.weaknesses).toContain('Documentation');
    });
  });

  describe('addStrength', () => {
    test('should add strength', () => {
      manager.initialize();
      manager.addStrength('TypeScript');

      const profile = manager.get();
      expect(profile.strengths).toContain('TypeScript');
    });

    test('should not add duplicate strength', () => {
      manager.initialize();
      manager.addStrength('TypeScript');
      manager.addStrength('TypeScript');

      const profile = manager.get();
      expect(profile.strengths.filter((s) => s === 'TypeScript').length).toBe(1);
    });
  });

  describe('addWeakness', () => {
    test('should add weakness', () => {
      manager.initialize();
      manager.addWeakness('Testing');

      const profile = manager.get();
      expect(profile.weaknesses).toContain('Testing');
    });
  });

  describe('addDomain', () => {
    test('should add technical domain', () => {
      manager.initialize();
      manager.addDomain('React', 'advanced');

      const profile = manager.get();
      expect(profile.technical_level.domains.React).toBe('advanced');
    });
  });

  describe('addProject / removeProject', () => {
    test('should add and remove projects', () => {
      manager.initialize();
      manager.addProject('/path/to/project', 'maintainer');

      let profile = manager.get();
      expect(profile.active_projects).toHaveLength(1);
      expect(profile.active_projects[0].path).toBe('/path/to/project');
      expect(profile.active_projects[0].role).toBe('maintainer');

      manager.removeProject('/path/to/project');
      profile = manager.get();
      expect(profile.active_projects).toHaveLength(0);
    });

    test('should not add duplicate project', () => {
      manager.initialize();
      manager.addProject('/path/to/project');
      manager.addProject('/path/to/project');

      const profile = manager.get();
      expect(profile.active_projects).toHaveLength(1);
    });
  });

  describe('recordCorrection', () => {
    test('should record profile correction', () => {
      manager.initialize();
      manager.recordCorrection(
        'technical_level.overall',
        'unknown',
        'intermediate',
        'User correction'
      );

      const profile = manager.get();
      expect(profile.profile_corrections).toHaveLength(1);
      expect(profile.profile_corrections[0].field).toBe('technical_level.overall');
      expect(profile.profile_corrections[0].old_value).toBe('unknown');
      expect(profile.profile_corrections[0].new_value).toBe('intermediate');
      expect(profile.profile_corrections[0].reason).toBe('User correction');
    });
  });

  describe('applyCorrection', () => {
    test('should apply correction and record it', () => {
      manager.initialize();
      manager.applyCorrection(
        'technical_level.overall',
        'advanced',
        'User self-assessment'
      );

      const profile = manager.get();
      expect(profile.technical_level.overall).toBe('advanced');
      expect(profile.profile_corrections).toHaveLength(1);
    });
  });

  describe('getProjectPaths', () => {
    test('should return project paths', () => {
      manager.initialize();
      manager.addProject('/path/a');
      manager.addProject('/path/b');

      const paths = manager.getProjectPaths();
      expect(paths).toEqual(['/path/a', '/path/b']);
    });
  });

  describe('formatProfile', () => {
    test('should format profile as readable text', () => {
      manager.initialize();
      manager.addStrength('TypeScript');
      manager.addWeakness('Testing');
      manager.addDomain('Node.js', 'advanced');

      const formatted = manager.formatProfile();

      expect(formatted).toContain('# 用户画像');
      expect(formatted).toContain('## 技术水平');
      expect(formatted).toContain('TypeScript');
      expect(formatted).toContain('Testing');
      expect(formatted).toContain('Node.js: advanced');
    });
  });

  describe('deepMerge', () => {
    test('should merge nested objects', () => {
      manager.initialize();

      const updated = manager.update({
        work_habits: {
          peak_hours: ['09:00-12:00'],
          avg_session_length_minutes: 60,
          multitasking_tendency: 'low',
        },
      });

      expect(updated.work_habits.peak_hours).toEqual(['09:00-12:00']);
      expect(updated.work_habits.avg_session_length_minutes).toBe(60);
      expect(updated.work_habits.multitasking_tendency).toBe('low');
    });
  });

  describe('getFieldValue / setFieldValue', () => {
    test('should get and set nested field values', () => {
      manager.initialize();

      // 通过 applyCorrection 测试 setFieldValue
      manager.applyCorrection(
        'learning_preferences.style',
        'hands-on',
        'User preference'
      );

      const profile = manager.get();
      expect(profile.learning_preferences.style).toBe('hands-on');
    });
  });
});
