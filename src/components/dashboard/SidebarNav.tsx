"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  BrainCircuit,
  CalendarCheck,
  ClipboardCheck,
  CreditCard,
  FileBarChart,
  GraduationCap,
  LayoutDashboard,
  Library,
  Settings,
  ShieldAlert,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };

export function SidebarNav({
  role,
  isSuperAdmin,
  onNavigate,
}: {
  role: string;
  isSuperAdmin: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const teacher = ["OWNER", "ADMIN", "TEACHER"].includes(role);
  const admin = ["OWNER", "ADMIN"].includes(role);

  const groups: { label: string; items: Item[] }[] = [];

  if (teacher) {
    groups.push({
      label: "Teaching",
      items: [
        { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
        { href: "/dashboard/courses", label: "Courses", icon: BookOpen },
        { href: "/dashboard/assessments", label: "Assessments", icon: ClipboardCheck },
        { href: "/dashboard/bank", label: "Question bank", icon: Library },
        { href: "/dashboard/grading", label: "Grading queue", icon: GraduationCap },
      ],
    });
    groups.push({
      label: "People & insight",
      items: [
        { href: "/dashboard/students", label: "Learners", icon: Users },
        { href: "/dashboard/attendance", label: "Attendance", icon: CalendarCheck },
        { href: "/dashboard/insights", label: "Success insights", icon: BrainCircuit },
        { href: "/dashboard/reporting", label: "Reporting", icon: FileBarChart },
        { href: "/dashboard/gradebook", label: "Gradebook", icon: BarChart3 },
      ],
    });
  } else {
    groups.push({
      label: "Learning",
      items: [
        { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
        { href: "/dashboard/courses", label: "My courses", icon: BookOpen },
        { href: "/dashboard/results", label: "My results", icon: BarChart3 },
      ],
    });
  }

  groups.push({
    label: "Workspace",
    items: [
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
      ...(admin
        ? [{ href: "/dashboard/billing", label: "Billing & plan", icon: CreditCard }]
        : []),
      ...(isSuperAdmin
        ? [{ href: "/admin", label: "Platform admin", icon: ShieldAlert }]
        : []),
    ],
  });

  return (
    <nav className="space-y-6">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-3 text-[10px] font-bold tracking-[0.12em] text-slate-400 uppercase">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  data-active={active}
                  className={cn("sidebar-link", active && "font-semibold")}
                >
                  <item.icon className="size-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function MobileNav({
  role,
  isSuperAdmin,
  tenantName,
  userName,
}: {
  role: string;
  isSuperAdmin: boolean;
  tenantName: string;
  userName: string;
}) {
  return (
    <details className="group relative lg:hidden">
      <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        </svg>
      </summary>
      <div className="absolute top-11 left-0 z-50 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
        <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2">
          <p className="truncate text-xs font-bold text-slate-900">{tenantName}</p>
          <p className="text-[10px] text-slate-500">
            {userName} · {role.toLowerCase()}
          </p>
        </div>
        <div
          onClick={() => {
            const el = document.querySelector("details.group");
            if (el instanceof HTMLDetailsElement) el.open = false;
          }}
        >
          <SidebarNav role={role} isSuperAdmin={isSuperAdmin} />
        </div>
        <div className="mt-3 border-t border-slate-100 pt-2">
          <Link href="/dashboard/billing" className="sidebar-link">
            <Wallet className="size-4" /> Plan & usage
          </Link>
        </div>
      </div>
    </details>
  );
}
