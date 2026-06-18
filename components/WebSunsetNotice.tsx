"use client";

import { useEffect, useState } from "react";

import GlassDialog from "@/components/GlassDialog";
import DesktopAppDownloadButton from "@/components/DesktopAppDownloadButton";
import { isElectronRenderer } from "@/lib/utils/runtime-env";

/**
 * Web版サービス終了の告知モーダル。
 *
 * - Web版でのみ表示する（Electron版では何も描画しない）。
 * - アプリ起動（ページロード）ごとに毎回自動で開く。
 * - ユーザーは手動で閉じられる（「今後表示しない」のような永続化はしない）。
 *
 * ルート遷移（WelcomeScreen → Editor）でコンポーネントが再マウントされても
 * 同一ロード内で二重に開かないよう、モジュールレベルのフラグでガードする。
 */

/** 1回のページロード内で既に表示したかどうか（ルート遷移での再表示を防ぐ） */
let shownThisLoad = false;

export default function WebSunsetNotice(): React.JSX.Element | null {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Electron版では告知不要
    if (isElectronRenderer()) return;
    if (shownThisLoad) return;
    shownThisLoad = true;
    // 実行環境判定は window 依存のためマウント後にしか行えない。
    // SSR/Electron との hydration ずれを避けるため、初期 state ではなく
    // マウント後に開く（mount-time setState は意図的）。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOpen(true);
  }, []);

  if (!isOpen) return null;

  const close = (): void => setIsOpen(false);

  return (
    <GlassDialog
      isOpen={isOpen}
      onBackdropClick={close}
      ariaLabel="「illusions Web版」サービス終了のお知らせ"
      panelClassName="mx-4 w-full max-w-lg p-6"
    >
      <h2 className="text-lg font-semibold text-foreground">
        【重要】「illusions Web版」サービス終了およびデスクトップ版移行のお願い
      </h2>

      <div className="mt-3 max-h-[60vh] space-y-3 overflow-y-auto pr-1 text-sm leading-relaxed text-foreground-secondary">
        <p>平素より「illusions」をご利用いただき、誠にありがとうございます。</p>
        <p>
          この度、誠に勝手ながら「illusions Web版」は、
          <strong className="text-foreground">2027年1月1日</strong>
          をもちまして、サービスの提供を終了させていただくこととなりました。これまでWeb版をご愛顧いただきました皆様に、心より厚く御礼申し上げます。
        </p>
        <p>
          今後は、より安定した快適な環境を提供するため、デスクトップ版へサービスを統合させていただきます。
        </p>
        <p>
          引き続き「illusions」をご利用いただくにあたり、大変お手数ではございますが、以下のボタンよりデスクトップ版アプリのダウンロードをお願い申し上げます。
        </p>

        <h3 className="font-semibold text-foreground">■ ご案内と注意事項</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            現在ご利用中のアカウントやデータは、デスクトップ版にてログインしていただくことで、そのまま引き継いでご利用いただけます。
          </li>
          <li>
            Web版のサービス終了日（2027年1月1日）以降は、ブラウザからのアクセスができなくなりますので、お早めの移行をお願いいたします。
          </li>
        </ul>

        <p>
          ユーザーの皆様には多大なるご迷惑とご不便をおかけいたしますことを、深くお詫び申し上げます。
        </p>
        <p>
          今後とも皆様にご満足いただけるサービスの提供に努めてまいりますので、引き続き「illusions」をよろしくお願い申し上げます。
        </p>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={close}
          className="rounded-lg px-4 py-2 text-sm font-medium text-foreground-secondary hover:bg-hover transition-colors"
        >
          閉じる
        </button>
        <DesktopAppDownloadButton label="デスクトップ版をダウンロード" />
      </div>
    </GlassDialog>
  );
}
