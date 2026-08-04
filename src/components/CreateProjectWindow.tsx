"use client";

import CreateProjectWizard, { type CreateProjectSelection } from "@/components/CreateProjectWizard";

export default function CreateProjectWindow(): React.JSX.Element {
  const complete = (result: CreateProjectSelection | null): void => {
    void window.electronAPI?.completeCreateProjectDialog?.(result);
  };

  return (
    <CreateProjectWizard
      isOpen
      presentation="window"
      onClose={() => complete(null)}
      onProjectCreated={() => {}}
      onSubmit={complete}
    />
  );
}
