"use client";

import { BarChart3, CalendarCheck, ChevronsUpDown, LogOut, Menu, Moon, Search, Settings2, Sun, Table2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { Avatar, cx, initials } from "./ui";

const ICONS: Record<string, LucideIcon> = {
  today: CalendarCheck,
  leads: Table2,
  reports: BarChart3,
  setup: Settings2,
  more: Menu,
};

/** `also` lists the other pages that belong to this item, shown as tabs inside it. */
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; also?: string[]; badge?: number; urgent?: boolean; primary?: boolean; compactOnly?: boolean };

function isActive(pathname: string, item: NavItem) {
  return [item.href, ...(item.also ?? [])].some((href) => pathname === href || pathname.startsWith(`${href}/`));
}

const iconButton = "grid size-7 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-hover hover:text-fg pointer-coarse:size-11";

export function Sidebar({
  items,
  tenants,
  currentTenant,
  clientName,
  userName,
  userRole,
  theme,
  toggleTheme,
  signOut,
}: {
  items: NavItem[];
  tenants: { id: string; name: string }[];
  currentTenant: string;
  clientName: string;
  userName: string;
  userRole: string;
  theme: string;
  toggleTheme: () => Promise<void>;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        // The box is hidden on a narrow sidebar, so go to the search on Leads instead.
        if (search.current?.offsetParent) search.current.focus();
        else router.push(`/c/${currentTenant}/leads`);
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [currentTenant, router]);

  return (
    <aside className="sticky top-2.5 hidden h-[calc(100dvh-1.25rem)] w-(--w-rail) shrink-0 flex-col rounded-panel border border-line bg-sidebar px-2.5 py-3.5 sm:flex full:w-(--w-sidebar)">
      <div className="flex flex-col items-center justify-center gap-2.5 full:flex-row full:justify-start full:px-1">
        <Link href={`/c/${currentTenant}/today`} title={clientName} className="grid size-8.5 shrink-0 place-items-center rounded-control bg-(image:--gradient-accent) text-sm font-bold text-on-accent shadow-glow">
          {initials(clientName)}
          <span className="sr-only">{clientName}, go to Today</span>
        </Link>
        <div className="hidden min-w-0 flex-1 leading-tight full:block">
          {tenants.length > 1 ? (
            <label className="relative block">
              <span className="sr-only">Client</span>
              <select
                value={currentTenant}
                onChange={(event) => router.push(`/c/${event.target.value}/today`)}
                className="w-full appearance-none truncate rounded-dense bg-transparent pe-5 text-sm font-semibold text-fg"
              >
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id} className="bg-panel">
                    {tenant.name}
                  </option>
                ))}
              </select>
              <ChevronsUpDown size={13} aria-hidden className="pointer-events-none absolute end-0 top-1 text-fg-muted" />
            </label>
          ) : (
            <p className="truncate text-sm font-semibold">{clientName}</p>
          )}
          <p className="text-2xs text-fg-muted">Qualent</p>
        </div>
      </div>

      <form action={`/c/${currentTenant}/leads`} role="search" className="mt-3 hidden h-9.5 shrink-0 items-center gap-2.5 rounded-control border border-line bg-control px-3.5 full:flex">
        <Search size={14} aria-hidden className="shrink-0 text-fg-muted" />
        <label className="sr-only" htmlFor="nav-search">Search leads</label>
        <input ref={search} id="nav-search" name="q" type="search" placeholder="Search leads…" className="min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-muted" />
      </form>

      <nav aria-label="Main" className="relative mt-4 grid min-h-0 flex-1 content-start gap-0.75 overflow-x-hidden overflow-y-auto">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={item.label}
              className={cx(
                "relative h-(--control-lg) items-center justify-center gap-2.75 rounded-control border px-3.5 text-base transition duration-(--dur-fast) full:justify-start",
                item.compactOnly ? "flex full:hidden" : "flex",
                active
                  ? "border-accent-line bg-(image:--gradient-accent) font-medium text-on-accent shadow-nav full:bg-(image:--gradient-nav) full:text-fg"
                  : "border-transparent text-fg-muted hover:bg-hover hover:text-fg",
              )}
            >
              <Icon size={17} aria-hidden className="shrink-0" />
              <span className="sr-only full:not-sr-only full:flex-1">{item.label}</span>
              {!!item.badge && (
                <>
                  <span className={cx("sr-only full:not-sr-only full:shrink-0 full:text-2xs full:tabular-nums", item.urgent ? "full:rounded-full full:bg-(image:--gradient-accent) full:px-2 full:py-0.5 full:font-semibold full:text-on-accent" : "full:text-fg-muted")}>{item.badge}</span>
                  <span aria-hidden className="absolute end-1.5 top-1.5 size-1.75 rounded-full bg-accent shadow-glow full:hidden" />
                </>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-2.5 flex flex-col items-center gap-1 rounded-card bg-card p-1.5 full:flex-row full:gap-1.5 full:rounded-control">
        <span title={userName}><Avatar name={userName || "?"} size="sm" /></span>
        <div className="hidden min-w-0 flex-1 leading-tight full:block">
          <p className="truncate text-sm font-medium">{userName}</p>
          <p className="truncate text-2xs text-fg-muted">{userRole}</p>
        </div>
        <form action={toggleTheme}>
          <button className={iconButton} title="Switch theme">
            {theme === "dark" ? <Sun size={15} aria-hidden /> : <Moon size={15} aria-hidden />}
            <span className="sr-only">Switch theme</span>
          </button>
        </form>
        <form action={signOut}>
          <button className={iconButton} title="Sign out">
            <LogOut size={15} aria-hidden />
            <span className="sr-only">Sign out</span>
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
          const active = isActive(pathname, item);
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
  const pathname = usePathname();
  // The lead page draws its own panels: queue, timeline and detail.
  if (/\/leads\/[^/]+$/.test(pathname)) {
    return <main id="main" className="min-w-0 flex-1 pb-24 sm:pb-0">{children}</main>;
  }
  return (
    <main
      id="main"
      className={cx(
        "grid min-w-0 flex-1 grid-cols-[minmax(0,var(--w-content))] content-start justify-center gap-5 rounded-panel border border-line bg-panel bg-no-repeat p-4 pb-24 sm:px-7.5 sm:pt-7 sm:pb-10",
        pathname.endsWith("/today") ? "bg-(image:--wash-hero) bg-size-[100%_22.5rem] sm:pt-8.5" : "bg-(image:--wash-soft) bg-size-[100%_15rem]",
      )}
    >
      {children}
    </main>
  );
}
