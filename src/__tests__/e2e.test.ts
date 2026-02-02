/**
 * End-to-end tests
 *
 * Test complete command flows
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  dailyReflect,
  runInteractiveReflection,
  initReflection,
  getCurrentQuestion,
  submitAnswer,
  completeReflection,
  cancelReflection,
  getSessionStatus,
} from '../commands/daily-reflect';
import { viewProfile, correctProfile, addProject, removeProject } from '../commands/reflect-profile';
import { showHelp, showVersion, HELP_TEXT } from '../commands/reflect-help';
import { DataAggregator } from '../core/aggregator';
import { ProfileManager } from '../core/profile';
import { ReflectionEngine } from '../core/reflection';
import { ReportGenerator } from '../core/report';

describe('E2E: Command Flow Tests', () => {
  describe('dailyReflect', () => {
    test('should validate date format', async () => {
      const result = await dailyReflect({ date: 'invalid-date' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid date format');
    });

    test('should handle valid date format', async () => {
      const result = await dailyReflect({ date: '2026-02-03' });

      // Result varies depending on data availability
      expect(result.date).toBe('2026-02-03');
      // success may be true or false depending on data availability
    });

    test('should use today as default date', async () => {
      const today = new Date().toISOString().split('T')[0];
      const result = await dailyReflect({});

      expect(result.date).toBe(today);
    });
  });

  describe('runInteractiveReflection', () => {
    test('should handle callback-based interaction', async () => {
      // Mock answer callback
      let questionCount = 0;
      const mockAnswerCallback = async (question: string): Promise<string> => {
        questionCount++;
        // Provide long enough answer to avoid follow-up
        return `This is a detailed answer for question ${questionCount}, with enough content to meet the answer length requirement.`;
      };

      const result = await runInteractiveReflection('2026-02-03', mockAnswerCallback);

      // Result depends on data availability
      expect(result.date).toBe('2026-02-03');
    });
  });

  describe('reflectHelp', () => {
    test('should return help content', () => {
      const help = showHelp();

      expect(help).toContain('Claude Reflect');
      expect(help).toContain('/daily-reflect');
      expect(help).toContain('/reflect-profile');
      expect(help).toContain('/reflect-help');
    });

    test('should return version', () => {
      const version = showVersion();
      expect(version).toContain('Claude Reflect');
      expect(version).toMatch(/v\d+\.\d+\.\d+/);
    });
  });

  describe('reflectProfile', () => {
    test('viewProfile should return profile data', () => {
      const result = viewProfile();

      expect(result.success).toBe(true);
      expect(result.profile).toBeDefined();
      expect(result.formatted).toBeDefined();
    });
  });
});

describe('E2E: Integration Tests', () => {
  describe('DataAggregator + ReflectionEngine + ReportGenerator', () => {
    test('should work together for complete reflection flow', async () => {
      // Create test components
      const aggregator = new DataAggregator({ projectPaths: [] });
      const reflectionEngine = new ReflectionEngine();
      const reportGenerator = new ReportGenerator();

      try {
        // Check availability
        const availability = await aggregator.checkAvailability();
        expect(availability).toHaveProperty('mode');

        // Get timeline (may be empty)
        const timeline = await aggregator.getDailyTimeline('2026-02-03');
        expect(timeline).toHaveProperty('date');
        expect(timeline).toHaveProperty('events');
        expect(timeline).toHaveProperty('stats');

        // If there are events, test complete flow
        if (timeline.events.length > 0) {
          const profile = {
            version: '1.0',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            technical_level: { overall: 'intermediate' as const, confidence: 0.5, domains: {} },
            strengths: [],
            weaknesses: [],
            work_habits: { peak_hours: [], avg_session_length_minutes: 0, multitasking_tendency: 'moderate' as const },
            learning_preferences: { style: 'mixed' as const, depth: 'moderate' as const, feedback_receptiveness: 'medium' as const },
            active_projects: [],
            profile_corrections: [],
          };

          // Start session
          const firstQuestion = reflectionEngine.startSession(timeline, profile);
          expect(firstQuestion).not.toBeNull();

          // Mock answers
          let result = reflectionEngine.processAnswer('This is a detailed answer with enough content');
          while (result.action !== 'complete') {
            result = reflectionEngine.processAnswer('Continue answering with more details');
          }

          // Complete session
          const session = reflectionEngine.completeSession(timeline);
          expect(session).not.toBeNull();

          // Generate report
          if (session) {
            const report = reportGenerator.generateReport(timeline, session);
            expect(report.date).toBe('2026-02-03');
            expect(report).toHaveProperty('summary');
            expect(report).toHaveProperty('technical_learnings');

            // Convert to Markdown
            const markdown = reportGenerator.toMarkdown(report);
            expect(markdown).toContain('# Daily Reflection');
          }
        }
      } finally {
        aggregator.close();
      }
    });
  });

  describe('ProfileManager integration', () => {
    let testDir: string;
    let profilePath: string;

    beforeEach(() => {
      testDir = join(tmpdir(), `claude-reflect-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      mkdirSync(testDir, { recursive: true });
      profilePath = join(testDir, 'profile.json');
    });

    afterEach(() => {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {}
    });

    test('should persist profile across manager instances', () => {
      // First manager instance
      const manager1 = new ProfileManager(profilePath);
      manager1.initialize();
      manager1.addStrength('TypeScript');
      manager1.addStrength('Testing');
      manager1.addDomain('Backend', 'advanced');

      // Second manager instance (simulates restart)
      const manager2 = new ProfileManager(profilePath);
      const profile = manager2.load();

      expect(profile.strengths).toContain('TypeScript');
      expect(profile.strengths).toContain('Testing');
      expect(profile.technical_level.domains.Backend).toBe('advanced');
    });

    test('should track corrections across sessions', () => {
      const manager = new ProfileManager(profilePath);
      manager.initialize();

      // Apply multiple corrections
      manager.applyCorrection('technical_level.overall', 'intermediate', 'Self assessment');
      manager.applyCorrection('learning_preferences.depth', 'deep-dive', 'User preference');

      // Verify correction history
      const profile = manager.get();
      expect(profile.profile_corrections.length).toBe(2);
      expect(profile.technical_level.overall).toBe('intermediate');
      expect(profile.learning_preferences.depth).toBe('deep-dive');
    });
  });
});

describe('E2E: Error Handling', () => {
  test('should handle missing data gracefully', async () => {
    const result = await dailyReflect({ date: '2000-01-01' });

    // Should not crash, return appropriate error message
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('message');
  });

  test('should handle invalid options', async () => {
    const result = await dailyReflect({
      date: '2026-02-03',
      overwrite: false,
      append: false,
    });

    // Should handle normally
    expect(result).toHaveProperty('date', '2026-02-03');
  });
});

describe('E2E: Step-based API', () => {
  afterEach(() => {
    // Clean up session state
    cancelReflection();
  });

  describe('initReflection', () => {
    test('should validate date format', async () => {
      const result = await initReflection('invalid-date');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid date format');
    });

    test('should return session status', async () => {
      // Without initialization, should return inactive
      const status = getSessionStatus();
      expect(status.active).toBe(false);
    });
  });

  describe('submitAnswer', () => {
    test('should fail without active session', () => {
      const result = submitAnswer('q1', 'test answer');

      expect(result.success).toBe(false);
      expect(result.message).toContain('No active reflection session');
    });
  });

  describe('getCurrentQuestion', () => {
    test('should fail without active session', () => {
      const result = getCurrentQuestion();

      expect(result.success).toBe(false);
      expect(result.message).toContain('No active reflection session');
    });
  });

  describe('completeReflection', () => {
    test('should fail without active session', () => {
      const result = completeReflection();

      expect(result.success).toBe(false);
      expect(result.message).toContain('No active reflection session');
    });
  });

  describe('cancelReflection', () => {
    test('should return false when no active session', () => {
      const result = cancelReflection();

      expect(result.success).toBe(false);
      expect(result.message).toContain('No active reflection session');
    });
  });
});

describe('E2E: ReflectionEngine Complete Flow', () => {
  test('should handle complete Q&A flow', () => {
    const engine = new ReflectionEngine();

    // Create minimal timeline
    const timeline = {
      date: '2026-02-03',
      events: [
        {
          id: 'event-1',
          source: 'claude-mem' as const,
          timestamp: Date.now(),
          type: 'feature',
          title: 'Implemented feature X',
          summary: 'Added new feature',
          details: {
            id: 1,
            memory_session_id: 'session-1',
            project: 'test',
            type: 'feature' as const,
            title: 'Feature X',
            subtitle: null,
            narrative: 'Worked on feature',
            facts: null,
            concepts: ['TypeScript'],
            files_read: null,
            files_modified: ['src/feature.ts'],
            prompt_number: 1,
            created_at: new Date().toISOString(),
            created_at_epoch: Date.now(),
          },
        },
      ],
      stats: {
        total_observations: 1,
        total_commits: 0,
        projects_active: ['test'],
        by_type: { feature: 1 },
        by_project: { test: 1 },
      },
    };

    const profile = {
      version: '1.0',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      technical_level: { overall: 'intermediate' as const, confidence: 0.5, domains: {} },
      strengths: [],
      weaknesses: [],
      work_habits: { peak_hours: [], avg_session_length_minutes: 0, multitasking_tendency: 'moderate' as const },
      learning_preferences: { style: 'mixed' as const, depth: 'moderate' as const, feedback_receptiveness: 'medium' as const },
      active_projects: [],
      profile_corrections: [],
    };

    // Start session
    const firstQuestion = engine.startSession(timeline, profile);
    expect(firstQuestion).not.toBeNull();
    expect(firstQuestion?.category).toBeDefined();

    // Perform complete Q&A
    let questionCount = 0;
    while (!engine.isComplete() && questionCount < 20) {
      const progress = engine.getProgress();
      expect(progress).not.toBeNull();

      // Provide detailed answer to avoid follow-up
      const result = engine.processAnswer(
        `This is a detailed answer for question ${questionCount + 1}. Today I learned a lot about TypeScript, including advanced usage of the type system.`
      );

      questionCount++;

      if (result.action === 'complete') {
        break;
      }
    }

    // Complete session
    const session = engine.completeSession(timeline);
    expect(session).not.toBeNull();
    expect(session?.questions.length).toBeGreaterThan(0);
    expect(Object.keys(session?.answers || {}).length).toBeGreaterThan(0);
    expect(session?.learnings.length).toBeGreaterThanOrEqual(0);
  });
});
