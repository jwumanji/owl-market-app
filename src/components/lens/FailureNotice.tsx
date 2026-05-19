"use client";

import type { ReactNode } from "react";

type FailureNoticeTone = "info" | "warning" | "error";

type FailureNoticeProps = {
  title?: string;
  children: ReactNode;
  tone?: FailureNoticeTone;
  actions?: ReactNode;
};

const TONE_CLASSES: Record<FailureNoticeTone, string> = {
  info: "border-owl/40 bg-owl/10 text-text",
  warning: "border-owl/40 bg-owl/10 text-text",
  error: "border-loss/40 bg-loss/10 text-text",
};

export default function FailureNotice({
  title,
  children,
  tone = "warning",
  actions,
}: FailureNoticeProps) {
  return (
    <div className={`rounded-md border px-4 py-3 text-sm leading-6 ${TONE_CLASSES[tone]}`}>
      {title && (
        <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-widest text-owl">
          {title}
        </div>
      )}
      <div>{children}</div>
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
