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
  info: "border-coral/40 bg-bg-3 text-ink",
  warning: "border-coral/40 bg-bg-3 text-ink",
  error: "border-loss-2/50 bg-[#FBE3E3] text-ink",
};

export default function FailureNotice({
  title,
  children,
  tone = "warning",
  actions,
}: FailureNoticeProps) {
  return (
    <div className={`rounded-c-md border-[1.5px] px-4 py-3 text-sm leading-6 ${TONE_CLASSES[tone]}`}>
      {title && (
        <div className="mb-1 font-mono-2 text-[10px] font-bold uppercase tracking-widest text-coral">
          {title}
        </div>
      )}
      <div>{children}</div>
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
