/**
 * Reflection Engine 单元测试
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  QuestionGenerator,
  DialogStateMachine,
  LearningExtractor,
  ReflectionEngine,
} from '../core/reflection';
import type {
  DailyTimeline,
  UserProfile,
  ReflectionQuestion,
  TimelineEvent,
} from '../types';

// 测试数据
const createMockTimeline = (eventCount: number = 5): DailyTimeline => {
  const events: TimelineEvent[] = [];

  for (let i = 0; i < eventCount; i++) {
    events.push({
      id: `event-${i}`,
      source: i % 2 === 0 ? 'claude-mem' : 'git',
      timestamp: Date.now() + i * 1000,
      type: ['feature', 'bugfix', 'refactor'][i % 3],
      title: `Event ${i}: Working on feature`,
      summary: `Summary of event ${i}`,
      details:
        i % 2 === 0
          ? {
              id: i,
              memory_session_id: 'session-1',
              project: 'test-project',
              type: 'feature',
              title: 'Feature title',
              subtitle: null,
              narrative: 'Did some work',
              facts: ['fact1', 'fact2'],
              concepts: ['TypeScript', 'Testing'],
              files_read: null,
              files_modified: ['src/index.ts'],
              prompt_number: i,
              created_at: new Date().toISOString(),
              created_at_epoch: Date.now(),
            }
          : {
              hash: `abc${i}`,
              message: `Commit ${i}`,
              author: 'Test User',
              email: 'test@example.com',
              timestamp: new Date().toISOString(),
              files_changed: 1,
              additions: 10,
              deletions: 5,
              files: [{ path: 'src/test.ts', additions: 10, deletions: 5 }],
            },
    });
  }

  return {
    date: '2026-02-03',
    events,
    stats: {
      total_observations: Math.ceil(eventCount / 2),
      total_commits: Math.floor(eventCount / 2),
      projects_active: ['test-project'],
      by_type: { feature: eventCount },
      by_project: { 'test-project': eventCount },
    },
  };
};

const createMockProfile = (): UserProfile => ({
  version: '1.0',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  technical_level: {
    overall: 'intermediate',
    confidence: 0.5,
    domains: {},
  },
  strengths: [],
  weaknesses: [],
  work_habits: {
    peak_hours: [],
    avg_session_length_minutes: 0,
    multitasking_tendency: 'moderate',
  },
  learning_preferences: {
    style: 'mixed',
    depth: 'moderate',
    feedback_receptiveness: 'medium',
  },
  active_projects: [],
  profile_corrections: [],
});

describe('QuestionGenerator', () => {
  let generator: QuestionGenerator;

  beforeEach(() => {
    generator = new QuestionGenerator();
  });

  describe('generateQuestions', () => {
    test('should generate 3 questions for few events', () => {
      const timeline = createMockTimeline(3);
      const profile = createMockProfile();

      const questions = generator.generateQuestions(timeline, profile);

      expect(questions.length).toBe(3);
    });

    test('should generate 5 questions for moderate events', () => {
      const timeline = createMockTimeline(10);
      const profile = createMockProfile();

      const questions = generator.generateQuestions(timeline, profile);

      expect(questions.length).toBe(5);
    });

    test('should generate 8 questions for many events', () => {
      const timeline = createMockTimeline(20);
      const profile = createMockProfile();

      const questions = generator.generateQuestions(timeline, profile);

      expect(questions.length).toBe(8);
    });

    test('should cover all three categories', () => {
      const timeline = createMockTimeline(10);
      const profile = createMockProfile();

      const questions = generator.generateQuestions(timeline, profile);

      const categories = questions.map((q) => q.category);
      expect(categories).toContain('technical');
      expect(categories).toContain('decision');
      expect(categories).toContain('efficiency');
    });

    test('should include follow_up for each question', () => {
      const timeline = createMockTimeline(5);
      const profile = createMockProfile();

      const questions = generator.generateQuestions(timeline, profile);

      for (const q of questions) {
        expect(q.follow_up).toBeDefined();
        expect(typeof q.follow_up).toBe('string');
      }
    });
  });
});

describe('DialogStateMachine', () => {
  let questions: ReflectionQuestion[];
  let machine: DialogStateMachine;

  beforeEach(() => {
    questions = [
      {
        id: 'q1',
        category: 'technical',
        question: '今天学到了什么？',
        follow_up: '能详细说说吗？',
      },
      {
        id: 'q2',
        category: 'decision',
        question: '做了什么决策？',
        follow_up: '为什么这样决定？',
      },
    ];
    machine = new DialogStateMachine(questions);
  });

  describe('initial state', () => {
    test('should start in idle state', () => {
      expect(machine.getState()).toBe('idle');
    });
  });

  describe('start', () => {
    test('should transition to asking state', () => {
      machine.start();
      expect(machine.getState()).toBe('asking');
    });

    test('should return first question', () => {
      const question = machine.start();
      expect(question?.id).toBe('q1');
    });
  });

  describe('processAnswer', () => {
    test('should trigger follow_up for short answers', () => {
      machine.start();
      const result = machine.processAnswer('是的');

      expect(result.action).toBe('follow_up');
      expect(result.message).toContain('详细');
      expect(machine.getState()).toBe('following_up');
    });

    test('should move to next question for adequate answers', () => {
      machine.start();
      const result = machine.processAnswer(
        '今天我学到了 TypeScript 的高级类型用法，包括条件类型和映射类型'
      );

      expect(result.action).toBe('next');
      expect(result.question?.id).toBe('q2');
      expect(machine.getState()).toBe('asking');
    });

    test('should complete when all questions answered', () => {
      machine.start();
      machine.processAnswer('长答案'.repeat(20));
      const result = machine.processAnswer('另一个长答案'.repeat(20));

      expect(result.action).toBe('complete');
      expect(machine.isComplete()).toBe(true);
    });
  });

  describe('getAnswers', () => {
    test('should collect all answers', () => {
      machine.start();
      machine.processAnswer('Answer 1 - detailed answer here');
      machine.processAnswer('Answer 2 - detailed answer here');

      const answers = machine.getAnswers();
      expect(Object.keys(answers).length).toBe(2);
      expect(answers['q1']).toBe('Answer 1 - detailed answer here');
    });
  });

  describe('getProgress', () => {
    test('should track progress', () => {
      machine.start();
      expect(machine.getProgress()).toEqual({ current: 1, total: 2 });

      machine.processAnswer('Long answer here with details');
      expect(machine.getProgress()).toEqual({ current: 2, total: 2 });
    });
  });
});

describe('LearningExtractor', () => {
  let extractor: LearningExtractor;

  beforeEach(() => {
    extractor = new LearningExtractor();
  });

  describe('extractLearnings', () => {
    test('should extract learnings from adequate answers', () => {
      const questions: ReflectionQuestion[] = [
        { id: 'q1', category: 'technical', question: 'What did you learn?' },
      ];
      const answers = {
        q1: '今天我学到了 TypeScript 的条件类型可以用来创建更灵活的类型定义',
      };
      const timeline = createMockTimeline(5);

      const learnings = extractor.extractLearnings(questions, answers, timeline);

      expect(learnings.length).toBe(1);
      expect(learnings[0].category).toBe('technical');
      expect(learnings[0].content.length).toBeGreaterThan(0);
    });

    test('should skip short answers', () => {
      const questions: ReflectionQuestion[] = [
        { id: 'q1', category: 'technical', question: 'What did you learn?' },
      ];
      const answers = { q1: '是' };
      const timeline = createMockTimeline(5);

      const learnings = extractor.extractLearnings(questions, answers, timeline);

      expect(learnings.length).toBe(0);
    });

    test('should assign confidence based on answer quality', () => {
      const questions: ReflectionQuestion[] = [
        { id: 'q1', category: 'technical', question: 'Q1' },
        { id: 'q2', category: 'technical', question: 'Q2' },
      ];
      const answers = {
        // 超过 100 字符的长答案，包含 "学到" 关键词
        q1: '今天我学到了很多关于 TypeScript 的知识，特别是泛型和条件类型的高级用法，这些知识让我能够更好地理解和使用类型系统。通过实践，我发现条件类型可以用来创建非常灵活的类型定义，这对于构建类型安全的 API 非常有帮助。',
        q2: '学到了一些东西，还行吧',
      };
      const timeline = createMockTimeline(5);

      const learnings = extractor.extractLearnings(questions, answers, timeline);

      // 长答案（>100字符+关键词）应该有 high 置信度
      const longAnswerLearning = learnings.find((l) =>
        l.content.includes('TypeScript')
      );
      expect(longAnswerLearning?.confidence).toBe('high');
    });
  });
});

describe('ReflectionEngine', () => {
  let engine: ReflectionEngine;

  beforeEach(() => {
    engine = new ReflectionEngine();
  });

  describe('startSession', () => {
    test('should start a new session', () => {
      const timeline = createMockTimeline(10);
      const profile = createMockProfile();

      const firstQuestion = engine.startSession(timeline, profile);

      expect(firstQuestion).not.toBeNull();
      expect(firstQuestion?.category).toBeDefined();
      expect(engine.getSession()).not.toBeNull();
    });
  });

  describe('processAnswer', () => {
    test('should process answers', () => {
      const timeline = createMockTimeline(10);
      const profile = createMockProfile();

      engine.startSession(timeline, profile);
      const result = engine.processAnswer(
        '今天学到了很多关于测试的知识'
      );

      expect(['follow_up', 'next', 'complete']).toContain(result.action);
    });
  });

  describe('completeSession', () => {
    test('should complete session and extract learnings', () => {
      const timeline = createMockTimeline(5);
      const profile = createMockProfile();

      engine.startSession(timeline, profile);

      // 回答所有问题
      let result = engine.processAnswer('学到了 TypeScript 的高级类型用法');
      while (result.action !== 'complete') {
        result = engine.processAnswer('继续学习和实践各种技术');
      }

      const session = engine.completeSession(timeline);

      expect(session).not.toBeNull();
      expect(session?.completed_at).toBeDefined();
      expect(session?.learnings).toBeDefined();
    });
  });

  describe('getProgress', () => {
    test('should return progress', () => {
      const timeline = createMockTimeline(5);
      const profile = createMockProfile();

      engine.startSession(timeline, profile);
      const progress = engine.getProgress();

      expect(progress).not.toBeNull();
      expect(progress?.current).toBe(1);
      expect(progress?.total).toBeGreaterThan(0);
    });

    test('should return null before session starts', () => {
      expect(engine.getProgress()).toBeNull();
    });
  });

  describe('isComplete', () => {
    test('should return false before completion', () => {
      const timeline = createMockTimeline(5);
      const profile = createMockProfile();

      engine.startSession(timeline, profile);
      expect(engine.isComplete()).toBe(false);
    });
  });
});
