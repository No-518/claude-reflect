/**
 * ClaudeMemClient 单元测试
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { ClaudeMemClient } from '../integrations/claude-mem';

describe('ClaudeMemClient', () => {
  let client: ClaudeMemClient;

  beforeEach(() => {
    client = new ClaudeMemClient();
  });

  afterEach(() => {
    client.close();
  });

  describe('isAvailable', () => {
    test('should return availability status', async () => {
      const status = await client.isAvailable();

      expect(status).toHaveProperty('api');
      expect(status).toHaveProperty('db');
      expect(status).toHaveProperty('mode');
      expect(['full', 'api-only', 'db-only', 'unavailable']).toContain(status.mode);
    });
  });

  describe('parseJsonArray', () => {
    test('should parse JSON string to array', () => {
      const result = (client as any).parseJsonArray('["a", "b", "c"]');
      expect(result).toEqual(['a', 'b', 'c']);
    });

    test('should return array as-is', () => {
      const input = ['a', 'b'];
      const result = (client as any).parseJsonArray(input);
      expect(result).toBe(input);
    });

    test('should return null for invalid input', () => {
      expect((client as any).parseJsonArray(null)).toBeNull();
      expect((client as any).parseJsonArray(undefined)).toBeNull();
      expect((client as any).parseJsonArray('invalid json')).toBeNull();
    });

    test('should return null for non-array JSON', () => {
      expect((client as any).parseJsonArray('{"key": "value"}')).toBeNull();
    });
  });

  describe('computeStats', () => {
    test('should compute stats from observations', () => {
      const observations = [
        {
          id: 1,
          memory_session_id: 'session-1',
          project: 'project-a',
          type: 'feature',
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
        {
          id: 2,
          memory_session_id: 'session-1',
          project: 'project-a',
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
        {
          id: 3,
          memory_session_id: 'session-2',
          project: 'project-b',
          type: 'feature',
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
      ];

      const stats = (client as any).computeStats(observations);

      expect(stats.total_observations).toBe(3);
      expect(stats.by_type.feature).toBe(2);
      expect(stats.by_type.bugfix).toBe(1);
      expect(stats.by_project['project-a']).toBe(2);
      expect(stats.by_project['project-b']).toBe(1);
      expect(stats.projects_active).toContain('project-a');
      expect(stats.projects_active).toContain('project-b');
    });

    test('should handle empty observations', () => {
      const stats = (client as any).computeStats([]);

      expect(stats.total_observations).toBe(0);
      expect(stats.projects_active).toEqual([]);
      expect(Object.keys(stats.by_type)).toHaveLength(0);
    });
  });

  describe('parseObservations', () => {
    test('should parse API response format', () => {
      const raw = [
        {
          id: 1,
          memorySessionId: 'session-1',
          project: 'test-project',
          type: 'feature',
          title: 'Feature title',
          subtitle: 'Subtitle',
          narrative: 'Did something',
          facts: ['fact1', 'fact2'],
          concepts: ['concept1'],
          filesRead: ['file1.ts'],
          filesModified: ['file2.ts'],
          promptNumber: 5,
          createdAt: '2026-02-03T10:00:00Z',
          createdAtEpoch: 1738580400,
        },
      ];

      const parsed = (client as any).parseObservations(raw);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].memory_session_id).toBe('session-1');
      expect(parsed[0].files_read).toEqual(['file1.ts']);
      expect(parsed[0].files_modified).toEqual(['file2.ts']);
      expect(parsed[0].prompt_number).toBe(5);
    });

    test('should handle snake_case format', () => {
      const raw = [
        {
          id: 1,
          memory_session_id: 'session-1',
          project: 'test-project',
          type: 'bugfix',
          title: null,
          subtitle: null,
          narrative: null,
          facts: null,
          concepts: null,
          files_read: null,
          files_modified: null,
          prompt_number: null,
          created_at: '2026-02-03T10:00:00Z',
          created_at_epoch: 1738580400,
        },
      ];

      const parsed = (client as any).parseObservations(raw);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].type).toBe('bugfix');
    });
  });

  describe('getDailyReview', () => {
    test('should return empty data when unavailable', async () => {
      // 创建一个模拟不可用的 client
      const mockClient = new ClaudeMemClient();

      // 模拟 isAvailable 返回 unavailable
      const originalIsAvailable = mockClient.isAvailable.bind(mockClient);
      mockClient.isAvailable = async () => ({
        api: false,
        db: false,
        mode: 'unavailable' as const,
      });

      const data = await mockClient.getDailyReview('2026-02-03');

      expect(data.date).toBe('2026-02-03');
      expect(data.observations).toEqual([]);
      expect(data.projects).toEqual([]);
      expect(data.stats.total_observations).toBe(0);

      mockClient.close();
    });
  });

  describe('getProjects', () => {
    test('should return empty array when unavailable', async () => {
      const mockClient = new ClaudeMemClient();
      mockClient.isAvailable = async () => ({
        api: false,
        db: false,
        mode: 'unavailable' as const,
      });

      const projects = await mockClient.getProjects();

      expect(projects).toEqual([]);

      mockClient.close();
    });
  });

  describe('close', () => {
    test('should close database connection', () => {
      // 调用 close 不应抛出错误
      expect(() => client.close()).not.toThrow();
      // 再次调用也不应抛出
      expect(() => client.close()).not.toThrow();
    });
  });
});
