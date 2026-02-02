/**
 * 命令模块导出
 */

// 每日复盘 - 步骤式 API（推荐）
export {
  dailyReflect,
  initReflection,
  getCurrentQuestion,
  submitAnswer,
  completeReflection,
  cancelReflection,
  getSessionStatus,
  // 向后兼容
  runInteractiveReflection,
} from './daily-reflect';

export type {
  DailyReflectOptions,
  DailyReflectResult,
  InitReflectionResult,
  SubmitAnswerResult,
  CompleteReflectionResult,
  GetQuestionResult,
} from './daily-reflect';

// 项目复盘 - 步骤式 API
export {
  initProjectReflection,
  getCurrentProjectQuestion,
  submitProjectAnswer,
  completeProjectReflection,
  cancelProjectReflection,
  getProjectSessionStatus,
  validateRepos,
  getProjectName,
} from './project-reflect';

export type {
  ProjectReflectOptions,
  InitProjectReflectionResult,
  SubmitProjectAnswerResult,
  CompleteProjectReflectionResult,
  GetProjectQuestionResult,
  ProjectSessionStatus,
} from './project-reflect';

// 用户画像
export {
  viewProfile,
  correctProfile,
  addProject,
  removeProject,
  updateDomainLevel,
  getCorrectableFields,
} from './reflect-profile';
export type { ProfileCommandResult } from './reflect-profile';

// 帮助
export { showHelp, showVersion, HELP_TEXT } from './reflect-help';
