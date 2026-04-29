"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AtlasChat } from "@/components/atlas-chat";
import {
  Home,
  UtensilsCrossed,
  FlaskConical,
  TrendingUp,
  Droplets,
  Dumbbell,
  Pill,
  Brain,
  LineChart,
} from "lucide-react";

const navItems = [
  {
    group: "Today",
    items: [
      { href: "/dashboard", label: "Home", icon: Home },
      { href: "/dashboard/meals", label: "Meals", icon: UtensilsCrossed },
      { href: "/dashboard/workouts", label: "Workouts", icon: Dumbbell },
      { href: "/dashboard/progress", label: "Progress", icon: TrendingUp },
    ],
  },
  {
    group: "Review",
    items: [
      { href: "/dashboard/analytics", label: "Analytics", icon: LineChart },
      { href: "/dashboard/nutrients", label: "Nutrients", icon: FlaskConical },
      { href: "/dashboard/bloodwork", label: "Blood Work", icon: Droplets },
    ],
  },
  {
    group: "Configure",
    items: [
      { href: "/dashboard/supplements", label: "Supplements", icon: Pill },
      { href: "/dashboard/memory", label: "Memory", icon: Brain },
    ],
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="fixed left-0 top-0 z-30 flex h-screen w-64 flex-col border-r border-surface-border bg-surface-dark">
        <div className="flex h-16 items-center gap-3 border-b border-surface-border px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neon-green/10">
            <span className="text-sm font-bold text-neon-green">F</span>
          </div>
          <span className="text-lg font-bold tracking-tight text-white">
            Fit<span className="text-neon-green">AI</span>
          </span>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto p-4">
          {navItems.map((section) => (
            <div key={section.group} className="space-y-1">
              <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {section.group}
              </p>
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-l-2 border-neon-green bg-neon-green/5 text-neon-green"
                        : "text-gray-400 hover:bg-surface-light hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-surface-border p-4">
          <div className="rounded-lg bg-surface p-3">
            <p className="text-xs font-medium text-gray-400">Atlas AI Trainer</p>
            <p className="mt-1 text-xs text-neon-green">Ready to assist</p>
          </div>
        </div>
      </aside>

      <main className="ml-64 flex-1 p-6">{children}</main>

      <AtlasChat />
    </div>
  );
}
