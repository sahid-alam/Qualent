"use client";

import { BarChart3, CalendarCheck, Inbox, KanbanSquare, LogOut, Menu, Moon, Radio, Settings2, Sun, Table2, Zap, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "./ui";

const ICONS: Record<string, LucideIcon> = {
  today: CalendarCheck,
  inbox: Inbox,
  pipeline: KanbanSquare,
  leads: Table2,
  automations: Zap,
  reports: BarChart3,
  meta: Radio,
  setup: Settings2,
  more: Menu,
};

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number; primary?: boolean; compactOnly?: boolean; sidebarOnly?: boolean };

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  items,
  tenants,
  currentTenant,
  userName,
  theme,
  toggleTheme,
  signOut,
}: {
  items: NavItem[];
  tenants: { id: string; name: string }[];
  currentTenant: string;
  userName: string;
  theme: string;
  toggleTheme: () => Promise<void>;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <aside className="sticky top-2.5 hidden h-[calc(100dvh-1.25rem)] w-(--w-rail) shrink-0 flex-col gap-4 rounded-panel border border-line bg-sidebar p-3 sm:flex desk:w-(--w-sidebar)">
      <div className="grid gap-2">
        <p className="hidden ps-2 pt-1 text-md font-semibold tracking-tight desk:block">Qualent</p>
        <p className="grid size-10 place-items-center rounded-full bg-(image:--gradient-accent) font-semibold text-on-accent desk:hidden" aria-hidden>Q</p>
        <label className="hidden desk:block">
          <span className="sr-only">Client</span>
          <select
            value={currentTenant}
            onChange={(event) => router.push(`/c/${event.target.value}/today`)}
            className="h-(--control-sm) w-full rounded-full border border-line-control bg-transparent px-3 text-sm text-fg"
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id} className="bg-panel">
                {tenant.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <nav aria-label="Main" className="grid gap-1">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={item.label}
              className={cx(
                "relative h-(--control-sm) items-center justify-center gap-2.5 rounded-full px-3 text-base transition duration-(--dur-fast) desk:justify-start",
                item.compactOnly ? "flex desk:hidden" : "flex",
                active ? "bg-accent-soft text-accent" : "text-fg-soft hover:bg-hover hover:text-fg",
              )}
            >
              <Icon size={17} aria-hidden className="shrink-0" />
              <span className="hidden desk:inline">{item.label}</span>
              {!!item.badge && (
                <span className="absolute end-1 top-0.5 rounded-full bg-accent-soft px-1.5 font-mono text-2xs text-accent tabular-nums desk:static desk:ms-auto">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto grid gap-1">
        <p className="hidden truncate ps-3 text-xs text-fg-muted desk:block">{userName}</p>
        <form action={toggleTheme}>
          <button className="flex h-(--control-sm) w-full items-center justify-center gap-2.5 rounded-full px-3 text-base text-fg-soft hover:bg-hover hover:text-fg desk:justify-start" title="Switch theme">
            {theme === "dark" ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
            <span className="hidden desk:inline">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
            <span className="sr-only desk:hidden">Switch theme</span>
          </button>
        </form>
        <form action={signOut}>
          <button className="flex h-(--control-sm) w-full items-center justify-center gap-2.5 rounded-full px-3 text-base text-fg-soft hover:bg-hover hover:text-fg desk:justify-start" title="Sign out">
            <LogOut size={17} aria-hidden />
            <span className="hidden desk:inline">Sign out</span>
            <span className="sr-only desk:hidden">Sign out</span>
          </button>
        </form>
      </div>
    </aside>
  );
}

export function BottomBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-line bg-sidebar pb-[env(safe-area-inset-bottom)] sm:hidden">
      {items
        .filter((item) => item.primary)
        .map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item.href);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cx("flex h-14 min-w-14 flex-col items-center justify-center gap-0.5 text-2xs", active ? "text-accent" : "text-fg-muted")}>
              <Icon size={19} aria-hidden />
              {item.label}
            </Link>
          );
        })}
    </nav>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <main id="main" className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-5 rounded-panel border border-line bg-panel p-4 pb-24 sm:p-6 sm:pb-6">{children}</main>;
}
