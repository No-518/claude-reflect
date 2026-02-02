/**
 * Claude-Mem 数据客户端
 *
 * 支持两种访问方式:
 * 1. HTTP API (优先) - 通过 localhost:37777 访问
 * 2. SQLite 直读 (fallback) - 直接读取数据库文件
 */

import { Database } from 'bun:sqlite';
import { existsSync, readFileSync } from 'fs';
import type { Observation, AvailabilityStatus, TimelineStats } from '../types';
import {
  CLAUDE_MEM_DB_PATH,
  CLAUDE_MEM_SETTINGS_PATH,
  DEFAULT_WORKER_HOST,
  DEFAULT_WORKER_PORT,
  getStartOfDay,
  getEndOfDay,
} from '../utils/paths';

export interface ClaudeMemSettings {
  CLAUDE_MEM_WORKER_HOST?: string;
  CLAUDE_MEM_WORKER_PORT?: string;
  CLAUDE_MEM_DATA_DIR?: string;
}

export interface DailyReviewData {
  date: string;
  observations: Observation[];
  projects: string[];
  stats: TimelineStats;
}

export class ClaudeMemClient {
  private apiUrl: string;
  private db: Database | null = null;
  private dbPath: string;

  constructor() {
    const settings = this.loadSettings();
    const host = settings.CLAUDE_MEM_WORKER_HOST || DEFAULT_WORKER_HOST;
    const port = settings.CLAUDE_MEM_WORKER_PORT || String(DEFAULT_WORKER_PORT);
    this.apiUrl = `http://${host}:${port}`;
    this.dbPath = this.resolveDbPath(settings);
  }

  /**
   * 加载 claude-mem 设置
   */
  private loadSettings(): ClaudeMemSettings {
    try {
      if (existsSync(CLAUDE_MEM_SETTINGS_PATH)) {
        const content = readFileSync(CLAUDE_MEM_SETTINGS_PATH, 'utf-8');
        return JSON.parse(content);
      }
    } catch {
      // 忽略错误，使用默认设置
    }
    return {};
  }

  /**
   * 解析数据库路径
   */
  private resolveDbPath(settings: ClaudeMemSettings): string {
    if (settings.CLAUDE_MEM_DATA_DIR) {
      return `${settings.CLAUDE_MEM_DATA_DIR}/claude-mem.db`;
    }
    return CLAUDE_MEM_DB_PATH;
  }

  /**
   * 检查可用性
   */
  async isAvailable(): Promise<AvailabilityStatus> {
    const api = await this.checkApiAvailable();
    const db = this.checkDbAvailable();

    let mode: AvailabilityStatus['mode'];
    if (api && db) {
      mode = 'full';
    } else if (api) {
      mode = 'api-only';
    } else if (db) {
      mode = 'db-only';
    } else {
      mode = 'unavailable';
    }

    return { api, db, mode };
  }

  /**
   * 检查 API 是否可用
   */
  private async checkApiAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(`${this.apiUrl}/api/stats`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * 检查数据库是否可用
   */
  private checkDbAvailable(): boolean {
    return existsSync(this.dbPath);
  }

  /**
   * 获取每日复盘数据
   */
  async getDailyReview(date: string): Promise<DailyReviewData> {
    const status = await this.isAvailable();

    if (status.api) {
      return this.getDailyReviewViaApi(date);
    }

    if (status.db) {
      return this.getDailyReviewViaSqlite(date);
    }

    // 不可用时返回空数据
    return {
      date,
      observations: [],
      projects: [],
      stats: {
        total_observations: 0,
        total_commits: 0,
        projects_active: [],
        by_type: {},
        by_project: {},
      },
    };
  }

  /**
   * 通过 API 获取数据
   */
  private async getDailyReviewViaApi(date: string): Promise<DailyReviewData> {
    try {
      // 获取 observations
      const obsRes = await fetch(
        `${this.apiUrl}/api/search?type=observations&dateStart=${date}&dateEnd=${date}&limit=1000`
      );
      const obsData = await obsRes.json();

      // 获取项目列表
      const projRes = await fetch(`${this.apiUrl}/api/projects`);
      const projData = await projRes.json();

      const observations = this.parseObservations(obsData.observations || obsData.results || []);
      const projects = projData.projects || [];

      return {
        date,
        observations,
        projects,
        stats: this.computeStats(observations),
      };
    } catch (error) {
      console.error('API request failed:', error);
      // 尝试 fallback 到 SQLite
      if (this.checkDbAvailable()) {
        return this.getDailyReviewViaSqlite(date);
      }
      throw error;
    }
  }

  /**
   * 通过 SQLite 直接读取
   */
  private getDailyReviewViaSqlite(date: string): DailyReviewData {
    this.openDb();
    if (!this.db) {
      return {
        date,
        observations: [],
        projects: [],
        stats: {
          total_observations: 0,
          total_commits: 0,
          projects_active: [],
          by_type: {},
          by_project: {},
        },
      };
    }

    const startOfDay = getStartOfDay(date);
    const endOfDay = getEndOfDay(date);

    // 查询 observations
    const observations = this.db
      .prepare(
        `
      SELECT o.*, s.project
      FROM observations o
      JOIN sdk_sessions s ON o.memory_session_id = s.memory_session_id
      WHERE o.created_at_epoch >= ? AND o.created_at_epoch <= ?
      ORDER BY o.created_at_epoch ASC
    `
      )
      .all(startOfDay, endOfDay) as RawObservation[];

    // 查询项目列表
    const projectRows = this.db
      .prepare(
        `
      SELECT DISTINCT project FROM sdk_sessions WHERE project IS NOT NULL
    `
      )
      .all() as { project: string }[];

    const parsedObservations = this.parseRawObservations(observations);

    return {
      date,
      observations: parsedObservations,
      projects: projectRows.map((r) => r.project),
      stats: this.computeStats(parsedObservations),
    };
  }

  /**
   * 获取指定日期的 observations
   */
  async getDailyObservations(date: string): Promise<Observation[]> {
    const data = await this.getDailyReview(date);
    return data.observations;
  }

  /**
   * 获取日期范围内的 observations
   */
  async getObservations(options: {
    dateStart?: string;
    dateEnd?: string;
    limit?: number;
  }): Promise<Observation[]> {
    const status = await this.isAvailable();

    if (status.api) {
      try {
        const params = new URLSearchParams();
        params.set('type', 'observations');
        if (options.dateStart) params.set('dateStart', options.dateStart);
        if (options.dateEnd) params.set('dateEnd', options.dateEnd);
        params.set('limit', String(options.limit || 1000));

        const res = await fetch(`${this.apiUrl}/api/search?${params}`);
        const data = await res.json();
        return this.parseObservations(data.observations || data.results || []);
      } catch {
        // fallback to SQLite
      }
    }

    if (status.db) {
      this.openDb();
      if (this.db) {
        let sql = `
          SELECT o.*, s.project
          FROM observations o
          JOIN sdk_sessions s ON o.memory_session_id = s.memory_session_id
          WHERE 1=1
        `;
        const params: (number | string)[] = [];

        if (options.dateStart) {
          sql += ' AND o.created_at_epoch >= ?';
          params.push(getStartOfDay(options.dateStart));
        }
        if (options.dateEnd) {
          sql += ' AND o.created_at_epoch <= ?';
          params.push(getEndOfDay(options.dateEnd));
        }

        sql += ' ORDER BY o.created_at_epoch ASC';

        if (options.limit) {
          sql += ` LIMIT ${options.limit}`;
        }

        const rows = this.db.prepare(sql).all(...params) as RawObservation[];
        return this.parseRawObservations(rows);
      }
    }

    return [];
  }

  /**
   * 获取所有项目
   */
  async getProjects(): Promise<string[]> {
    const status = await this.isAvailable();

    if (status.api) {
      try {
        const res = await fetch(`${this.apiUrl}/api/projects`);
        const data = await res.json();
        return data.projects || [];
      } catch {
        // fallback
      }
    }

    if (status.db) {
      this.openDb();
      if (this.db) {
        const rows = this.db
          .prepare('SELECT DISTINCT project FROM sdk_sessions WHERE project IS NOT NULL')
          .all() as { project: string }[];
        return rows.map((r) => r.project);
      }
    }

    return [];
  }

  /**
   * 打开数据库连接
   */
  private openDb(): void {
    if (this.db) return;

    if (!existsSync(this.dbPath)) return;

    try {
      this.db = new Database(this.dbPath, { readonly: true });
    } catch (e) {
      console.error('Failed to open claude-mem database:', e);
    }
  }

  /**
   * 解析 API 返回的 observations
   */
  private parseObservations(raw: unknown[]): Observation[] {
    return raw.map((item: any) => ({
      id: item.id,
      memory_session_id: item.memory_session_id || item.memorySessionId || '',
      project: item.project || '',
      type: item.type || 'change',
      title: item.title || null,
      subtitle: item.subtitle || null,
      narrative: item.narrative || null,
      facts: this.parseJsonArray(item.facts),
      concepts: this.parseJsonArray(item.concepts),
      files_read: this.parseJsonArray(item.files_read || item.filesRead),
      files_modified: this.parseJsonArray(item.files_modified || item.filesModified),
      prompt_number: item.prompt_number || item.promptNumber || null,
      created_at: item.created_at || item.createdAt || '',
      created_at_epoch: item.created_at_epoch || item.createdAtEpoch || 0,
    }));
  }

  /**
   * 解析 SQLite 原始数据
   */
  private parseRawObservations(raw: RawObservation[]): Observation[] {
    return raw.map((item) => ({
      id: item.id,
      memory_session_id: item.memory_session_id,
      project: item.project,
      type: item.type as Observation['type'],
      title: item.title,
      subtitle: item.subtitle,
      narrative: item.narrative,
      facts: this.parseJsonArray(item.facts),
      concepts: this.parseJsonArray(item.concepts),
      files_read: this.parseJsonArray(item.files_read),
      files_modified: this.parseJsonArray(item.files_modified),
      prompt_number: item.prompt_number,
      created_at: item.created_at,
      created_at_epoch: item.created_at_epoch,
    }));
  }

  /**
   * 解析 JSON 数组字段
   */
  private parseJsonArray(value: unknown): string[] | null {
    if (!value) return null;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * 计算统计数据
   */
  private computeStats(observations: Observation[]): TimelineStats {
    const byType: Record<string, number> = {};
    const byProject: Record<string, number> = {};
    const projectsSet = new Set<string>();

    for (const obs of observations) {
      // 按类型统计
      byType[obs.type] = (byType[obs.type] || 0) + 1;

      // 按项目统计
      if (obs.project) {
        byProject[obs.project] = (byProject[obs.project] || 0) + 1;
        projectsSet.add(obs.project);
      }
    }

    return {
      total_observations: observations.length,
      total_commits: 0, // 由 DataAggregator 填充
      projects_active: Array.from(projectsSet),
      by_type: byType,
      by_project: byProject,
    };
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// SQLite 原始数据类型
interface RawObservation {
  id: number;
  memory_session_id: string;
  project: string;
  type: string;
  title: string | null;
  subtitle: string | null;
  narrative: string | null;
  facts: string | null;
  concepts: string | null;
  files_read: string | null;
  files_modified: string | null;
  prompt_number: number | null;
  created_at: string;
  created_at_epoch: number;
}
