/**
 * ReportGenerator 单元测试
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ReportGenerator } from '../core/report';
import type { DailyTimeline, ReflectionSession, DailyReport, Learning } from '../types';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ReportGenerator', () => {
  let generator: ReportGenerator;
  let testDir: string;

  beforeEach(() => {
    generator = new ReportGenerator();
    testDir = join(tmpdir(), `claude-reflect-report-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  // 创建测试数据
  const createMockTimeline = (): DailyTimeline => ({
    date: '2026-02-03',
    events: [
      {
        id: 'event-1',
        source: 'claude-mem',
        timestamp: Date.now(),
        type: 'feature',
        title: 'Implemented new feature',
        summary: 'Added user authentication',
        details: {
          id: 1,
          memory_session_id: 'session-1',
          project: 'test-project',
          type: 'feature',
          title: 'Feature title',
          subtitle: null,
          narrative: 'Did some work',
          facts: null,
          concepts: null,
          files_read: null,
          files_modified: null,
          prompt_number: 1,
          created_at: new Date().toISOString(),
          created_at_epoch: Date.now(),
        },
      },
      {
        id: 'event-2',
        source: 'git',
        timestamp: Date.now(),
        type: 'bugfix',
        title: 'Fixed login bug',
        summary: 'Fixed issue with login',
        details: {
          hash: 'abc123def456',
          message: 'Fix login bug',
          author: 'Test User',
          email: 'test@example.com',
          timestamp: new Date().toISOString(),
          files_changed: 2,
          additions: 15,
          deletions: 5,
          files: [],
        },
      },
    ],
    stats: {
      total_observations: 1,
      total_commits: 1,
      projects_active: ['test-project'],
      by_type: { feature: 1, bugfix: 1 },
      by_project: { 'test-project': 2 },
    },
  });

  const createMockSession = (): ReflectionSession => ({
    date: '2026-02-03',
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    questions: [
      {
        id: 'q1',
        category: 'technical',
        question: 'What did you learn?',
      },
      {
        id: 'q2',
        category: 'decision',
        question: 'What decisions did you make?',
      },
      {
        id: 'q3',
        category: 'efficiency',
        question: 'How was your efficiency?',
      },
    ],
    answers: {
      q1: '学到了 TypeScript 的高级类型用法',
      q2: '决定使用 Bun 作为运行时',
      q3: '今天效率还不错，完成了主要功能',
    },
    learnings: [
      {
        category: 'technical',
        content: '学到了 TypeScript 的高级类型用法',
        confidence: 'high',
        source_refs: ['event-1'],
      },
      {
        category: 'decision',
        content: '决定使用 Bun 作为运行时，因为它性能更好',
        confidence: 'medium',
        source_refs: [],
      },
      {
        category: 'efficiency',
        content: '今天效率还不错，完成了主要功能',
        confidence: 'medium',
        source_refs: [],
      },
    ],
    profile_updates: {},
  });

  describe('generateReport', () => {
    test('should generate report from timeline and session', () => {
      const timeline = createMockTimeline();
      const session = createMockSession();

      const report = generator.generateReport(timeline, session);

      expect(report.date).toBe('2026-02-03');
      expect(report.generated_at).toBeDefined();
      expect(report.summary.active_projects).toBe(1);
      expect(report.summary.total_commits).toBe(1);
      expect(report.summary.total_observations).toBe(1);
    });

    test('should categorize learnings correctly', () => {
      const timeline = createMockTimeline();
      const session = createMockSession();

      const report = generator.generateReport(timeline, session);

      expect(report.technical_learnings.length).toBe(1);
      expect(report.decision_analysis.length).toBe(1);
      expect(report.efficiency_insights.length).toBe(1);
    });

    test('should include raw data references', () => {
      const timeline = createMockTimeline();
      const session = createMockSession();

      const report = generator.generateReport(timeline, session);

      expect(report.raw_data_refs.observations).toContain(1);
      expect(report.raw_data_refs.commits).toContain('abc123de');
    });

    test('should generate suggestions', () => {
      const timeline = createMockTimeline();
      const session = createMockSession();

      const report = generator.generateReport(timeline, session);

      expect(report.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('toMarkdown', () => {
    test('should convert report to markdown', () => {
      const timeline = createMockTimeline();
      const session = createMockSession();
      const report = generator.generateReport(timeline, session);

      const markdown = generator.toMarkdown(report);

      expect(markdown).toContain('# Daily Reflection - 2026-02-03');
      expect(markdown).toContain('## Summary');
      expect(markdown).toContain('## Technical Learnings');
      expect(markdown).toContain('## Decision Analysis');
      expect(markdown).toContain('## Efficiency Insights');
      expect(markdown).toContain("## Tomorrow's Suggestions");
      expect(markdown).toContain('## Raw Data References');
    });

    test('should include learning content in markdown', () => {
      const timeline = createMockTimeline();
      const session = createMockSession();
      const report = generator.generateReport(timeline, session);

      const markdown = generator.toMarkdown(report);

      expect(markdown).toContain('TypeScript');
      expect(markdown).toContain('Bun');
    });

    test('should handle empty learnings', () => {
      const timeline = createMockTimeline();
      const session: ReflectionSession = {
        ...createMockSession(),
        learnings: [],
      };
      const report = generator.generateReport(timeline, session);

      const markdown = generator.toMarkdown(report);

      expect(markdown).toContain('*No specific technical learnings recorded today.*');
    });

    test('should include primary focus percentages', () => {
      const timeline = createMockTimeline();
      const session = createMockSession();
      const report = generator.generateReport(timeline, session);

      const markdown = generator.toMarkdown(report);

      expect(markdown).toMatch(/\d+%/); // Should contain percentage
    });
  });

  describe('generateSuggestions', () => {
    test('should generate efficiency suggestion when efficiency learnings exist', () => {
      const timeline = createMockTimeline();
      const session = createMockSession();
      const report = generator.generateReport(timeline, session);

      expect(report.suggestions.some((s) => s.includes('效率'))).toBe(true);
    });

    test('should generate technical suggestion when technical learnings exist', () => {
      const timeline = createMockTimeline();
      const session = createMockSession();
      const report = generator.generateReport(timeline, session);

      expect(report.suggestions.some((s) => s.includes('技术') || s.includes('笔记'))).toBe(true);
    });

    test('should generate bugfix suggestion when many bugfixes', () => {
      const timeline: DailyTimeline = {
        ...createMockTimeline(),
        events: Array(5).fill({
          id: 'bugfix-event',
          source: 'claude-mem',
          timestamp: Date.now(),
          type: 'bugfix',
          title: 'Fixed bug',
          summary: 'Bug fix',
          details: {
            id: 1,
            memory_session_id: 'session-1',
            project: 'test',
            type: 'bugfix',
            title: null,
            subtitle: null,
            narrative: null,
            facts: null,
            concepts: null,
            files_read: null,
            files_modified: null,
            prompt_number: null,
            created_at: '',
            created_at_epoch: 0,
          },
        }),
      };
      const session = createMockSession();
      const report = generator.generateReport(timeline, session);

      expect(report.suggestions.some((s) => s.includes('bug') || s.includes('测试'))).toBe(true);
    });
  });

  describe('extractTitle', () => {
    test('should extract title from learning content', () => {
      const learning: Learning = {
        category: 'technical',
        content: '学到了 TypeScript 的高级类型。这是一个很长的内容，包含很多细节。',
        confidence: 'high',
        source_refs: [],
      };

      // 调用私有方法
      const title = (generator as any).extractTitle(learning);

      expect(title.length).toBeLessThanOrEqual(35); // 30 + "..."
    });

    test('should handle short content', () => {
      const learning: Learning = {
        category: 'technical',
        content: '学到了 TS',
        confidence: 'high',
        source_refs: [],
      };

      const title = (generator as any).extractTitle(learning);
      expect(title).toBe('学到了 TS');
    });

    test('should handle undefined content', () => {
      const learning = {
        category: 'technical',
        content: undefined,
        confidence: 'high',
        source_refs: [],
      } as unknown as Learning;

      const title = (generator as any).extractTitle(learning);
      expect(title).toBe('(无内容)');
    });

    test('should handle empty content', () => {
      const learning: Learning = {
        category: 'technical',
        content: '',
        confidence: 'high',
        source_refs: [],
      };

      const title = (generator as any).extractTitle(learning);
      expect(title).toBe('(无内容)');
    });
  });
});
