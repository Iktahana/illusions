export { useTextStatistics } from "./use-text-statistics";
export { useEditorSettings } from "./use-editor-settings";
export { useDisplaySettings } from "./use-display-settings";
export { useAiSettings } from "./use-ai-settings";
export { useElectronEvents } from "./use-electron-events";
export { useProjectLifecycle } from "./use-project-lifecycle";
export { useRecentProjects } from "./use-recent-projects";
export { useUpgradeBanner } from "./use-upgrade-banner";
export { useChapters } from "./use-chapters";

export type { TextStatisticsResult } from "./use-text-statistics";
export type { EditorSettings, EditorSettingsHandlers, EditorSettingsSetters, UseEditorSettingsResult } from "./use-editor-settings";
export type { DisplaySettings, DisplaySettingsHandlers, DisplaySettingsSetters, UseDisplaySettingsResult } from "./use-display-settings";
export type { AiSettings, AiSettingsHandlers, UseAiSettingsResult } from "./use-ai-settings";
export type { ProjectLifecycleState, ProjectLifecycleHandlers, ProjectLifecycleUpgrade, UseProjectLifecycleResult } from "./use-project-lifecycle";
export type { RecentProjectEntry, PermissionPromptState } from "./types";
