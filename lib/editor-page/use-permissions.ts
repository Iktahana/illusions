import { useCallback, useState } from "react";

import type { PermissionPromptState } from "./types";

export interface UsePermissionsResult {
  showPermissionPrompt: boolean;
  permissionPromptData: PermissionPromptState | null;
  handlePermissionGranted: () => void;
  handlePermissionDenied: () => void;
  setShowPermissionPrompt: React.Dispatch<React.SetStateAction<boolean>>;
  setPermissionPromptData: React.Dispatch<React.SetStateAction<PermissionPromptState | null>>;
}

/**
 * Manages permission prompt state for re-opening stored Web File System API project handles.
 * Calls `openRestoredProject` when the user grants permission.
 */
export function usePermissions(
  openRestoredProject: (handle: FileSystemDirectoryHandle) => Promise<void>,
): UsePermissionsResult {
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [permissionPromptData, setPermissionPromptData] = useState<PermissionPromptState | null>(
    null,
  );

  const handlePermissionGranted = useCallback(() => {
    if (permissionPromptData) {
      const handle = permissionPromptData.handle;
      // Dismiss the prompt immediately so the UI is unblocked, then open the project.
      // Errors are surfaced inside openRestoredProject via notificationManager.
      setShowPermissionPrompt(false);
      setPermissionPromptData(null);
      void openRestoredProject(handle);
    } else {
      setShowPermissionPrompt(false);
      setPermissionPromptData(null);
    }
  }, [permissionPromptData, openRestoredProject]);

  const handlePermissionDenied = useCallback(() => {
    setShowPermissionPrompt(false);
    setPermissionPromptData(null);
  }, []);

  return {
    showPermissionPrompt,
    permissionPromptData,
    handlePermissionGranted,
    handlePermissionDenied,
    setShowPermissionPrompt,
    setPermissionPromptData,
  };
}
