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
    <div className="dash-card">
      <div className="dash-header">
        <span className="dash-title">
          <span>{icon}</span> {title}
        </span>
        {viewAllHref && (
          <Link href={viewAllHref} className="dash-view-all">
            View all &rarr;
          </Link>
        )}
      </div>
      <div className="dash-body">{children}</div>
    </div>
  );
}
