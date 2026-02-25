/**
 * Project upgrade service.
 * Handles upgrading from standalone mode to project mode.
 *
 * スタンドアロンモードからプロジェクトモードへのアップグレードを処理する。
 */

import { getProjectService } from "./project-service";

import type { ProjectService } from "./project-service";
import type { StandaloneMode, ProjectMode, ProjectConfig } from "./project-types";

export class ProjectUpgradeService {
  private projectService: ProjectService;

  constructor() {
    this.projectService = getProjectService();
  }

  /**
   * Upgrade a standalone file to a full project.
   * Creates a new project directory structure and migrates the file content.
   *
   * 単一ファイルをプロジェクトに変換する。
   * 新しいプロジェクトディレクトリ構造を作成し、ファイル内容を移行する。
   *
   * Flow:
   * 1. Extract project name from the standalone filename
   * 2. Create a new project (opens directory picker for user)
   * 3. Overwrite the default main file with the existing content
   * 4. Preserve editor settings from the standalone mode
   *
   * @param standaloneMode - The current standalone mode state
   * @param content - The current file content to migrate
   * @returns ProjectMode representing the upgraded project
   */
  async upgradeToProject(
    standaloneMode: StandaloneMode,
    content: string
  ): Promise<ProjectMode> {
    // Extract project name from filename (without extension)
    const name = standaloneMode.fileName.replace(/\.[^.]+$/, "");

    // Create project (this opens directory picker for user selection)
    const project = await this.projectService.createProject(
      name,
      standaloneMode.fileExtension
    );

    // Overwrite the main file with existing content
    // (createProject writes default content, so we need to replace it)
    await this.projectService.saveProject(project, content);

    // Preserve editor settings from standalone mode
    const updatedMetadata: ProjectConfig = {
      ...project.metadata,
      editorSettings: standaloneMode.editorSettings,
    };

    return {
      ...project,
      metadata: updatedMetadata,
    };
  }
}

/**
 * Singleton instance of ProjectUpgradeService.
 */
let upgradeServiceInstance: ProjectUpgradeService | null = null;

/**
 * Get the singleton ProjectUpgradeService instance.
 * ProjectUpgradeService のシングルトンインスタンスを取得する。
 */
export function getProjectUpgradeService(): ProjectUpgradeService {
  if (!upgradeServiceInstance) {
    upgradeServiceInstance = new ProjectUpgradeService();
  }
  return upgradeServiceInstance;
}
