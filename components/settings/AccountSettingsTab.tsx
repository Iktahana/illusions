"use client";

import { useAuth } from "@/contexts/AuthContext";

function UserInitials({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-foreground text-xl font-bold">
      {initials || "?"}
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const labels: Record<string, string> = {
    free: "Free",
    pro: "Pro",
    enterprise: "Enterprise",
  };
  const label = labels[plan] ?? plan;

  return (
    <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
      {label}
    </span>
  );
}

export default function AccountSettingsTab() {
  const { isAuthenticated, isLoading, user, login, logout } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-foreground-tertiary border-t-accent" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-medium text-foreground">illusionsアカウント</h3>
          <p className="mt-2 text-sm text-foreground-secondary">
            アカウントにログインすると、クラウド同期やAI機能などの追加機能をご利用いただけます。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void login()}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          ログイン
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-medium text-foreground">illusionsアカウント</h3>
      </div>

      <div className="flex items-center gap-4">
        {user.image ? (
          <img src={user.image} alt={user.name} className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <UserInitials name={user.name} />
        )}
        <div className="min-w-0">
          <p className="text-base font-medium text-foreground truncate">{user.name}</p>
          <p className="text-sm text-foreground-secondary truncate">{user.email}</p>
          <div className="mt-1">
            <PlanBadge plan={user.plan} />
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void logout()}
        className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground-secondary transition-colors hover:bg-hover hover:text-foreground"
      >
        ログアウト
      </button>
    </div>
  );
}
