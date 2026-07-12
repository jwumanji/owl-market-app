import Link from "next/link";
import { ReactNode } from "react";

interface Props {
  icon: string;
  title: string;
  viewAllHref?: string;
  children: ReactNode;
}

export default function DashboardWidget({ icon, title, viewAllHref, children }: Props) {
  return (
    <div className="c-widget">
      <div className="c-widget-head">
        <span className="c-widget-title">
          <span className="c-widget-icon">{icon}</span> {title}
        </span>
        {viewAllHref && (
          <Link href={viewAllHref} className="c-widget-all" prefetch={false}>
            View all &rarr;
          </Link>
        )}
      </div>
      <div className="c-widget-body">{children}</div>
    </div>
  );
}
