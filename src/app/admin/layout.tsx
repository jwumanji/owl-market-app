import type { ReactNode } from "react";
import "./admin.css";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin-page">
      <div className="admin-container">{children}</div>
    </div>
  );
}
