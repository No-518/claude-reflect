/**
 * Claude Reflect - AI 复盘学习系统
 *
 * 通过分析 claude-mem observations 和 git 历史，
 * 引导用户进行交互式每日复盘，生成结构化学习报告。
 */

export { ClaudeMemClient } from './integrations/claude-mem';
export { GitHistoryReader } from './integrations/git';
export { DataAggregator } from './core/aggregator';
export { ProfileManager } from './core/profile';
export { ReflectionEngine } from './core/reflection';
export { ReportGenerator } from './core/report';

export * from './types';
