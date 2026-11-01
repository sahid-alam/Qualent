import type { campaignReport, leadSummary } from "../lib/reports.ts";
import { buttonClass, cx, Empty, formatMinutes, inputClass, money, Pill, Stat, TableWrap } from "./ui";

type Report = Awaited<ReturnType<typeof campaignReport>>;
type Summary = Awaited<ReturnType<typeof leadSummary>>;

const cardClass = "rounded-tile border border-line bg-card px-5.5 py-5";

export function DateRange({ from, to }: { from: string; to: string }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-xs text-fg-muted">From<input type="date" name="from" defaultValue={from} className={inputClass} /></label>
      <label className="grid gap-1 text-xs text-fg-muted">To<input type="date" name="to" defaultValue={to} className={inputClass} /></label>
      <button className={buttonClass()}>Apply</button>
    </form>
  );
}

const dayLabel = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(new Date(date));

/** One column per day. Short ranges name each day and print its count; long ones label every seventh. */
export function DayBars({ days, height = "h-52", values }: { days: Summary["days"]; height?: string; values?: boolean }) {
  const most = Math.max(1, ...days.map((day) => day.leads));
  const short = days.length <= 14;
  const description = days.filter((day) => day.leads).map((day) => `${dayLabel(day.date, { day: "numeric", month: "short" })}: ${day.leads}`).join(", ");
  return (
    <div role="img" aria-label={`Leads per day. ${description || "None in this range."}`} className={cx("flex items-end", short ? "gap-2.5" : "gap-0.5", height)}>
      {days.map((day, index) => (
        <div key={day.date} title={`${dayLabel(day.date, { weekday: "short", day: "numeric", month: "short" })}: ${day.leads} ${day.leads === 1 ? "lead" : "leads"}`} className="flex h-full min-w-0 flex-1 flex-col items-center gap-2">
          <div className={cx("flex min-h-0 w-full flex-1 flex-col items-center justify-end gap-2", values && short && "pt-5")}>
            {values && short && <span className="font-mono text-2xs text-fg-muted tabular-nums">{day.leads}</span>}
            <div className={cx("min-h-1 w-full rounded-t-tight rounded-b-xs", day.leads ? "bg-(image:--gradient-bar)" : "bg-line-strong")} style={{ height: `${(day.leads / most) * 100}%` }} />
          </div>
          <span className="h-4 text-2xs whitespace-nowrap text-fg-muted">
            {short ? dayLabel(day.date, { weekday: "short" }) : index % 7 === 0 ? dayLabel(day.date, { day: "numeric", month: "short" }) : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

const TEMPERATURES = [
  { key: "hot", label: "Hot", fill: "bg-(image:--gradient-hot)", dot: "bg-hot" },
  { key: "warm", label: "Warm", fill: "bg-warm", dot: "bg-warm" },
  { key: "cold", label: "Cold", fill: "bg-cold", dot: "bg-cold" },
  { key: "unscored", label: "Not scored", fill: "bg-line-hover", dot: "bg-line-hover" },
] as const;

/** A labeled bar row, used for campaigns and the stage funnel. */
export function BarRow({ label, value, share }: { label: string; value: string | number; share: number }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex justify-between gap-2.5 text-xs">
        <span className="truncate text-fg-soft">{label}</span>
        <span className="shrink-0 font-medium tabular-nums">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-control">
        <div className="h-full rounded-full bg-(image:--gradient-bar-h)" style={{ width: `${Math.max(share * 100, share ? 2 : 0)}%` }} />
      </div>
    </div>
  );
}

/** The same numbers for staff and for the client, so nobody sees a different story. */
export function CampaignReport({ report, summary, currency }: { report: Report; summary: Summary; currency: string }) {
  const traced = report.campaigns.filter((row) => !row.manual);
  const manual = report.campaigns.find((row) => row.manual);
  const sum = (key: "spend" | "leads" | "qualified" | "won") => traced.reduce((total, row) => total + row[key], 0);
  const spend = sum("spend");
  const qualified = sum("qualified");
  const rowCurrency = traced.find((row) => row.currency)?.currency ?? currency;
  const mostLeads = Math.max(1, ...traced.map((row) => row.leads));
  const scored = TEMPERATURES.map((item) => ({ ...item, count: summary.temperature[item.key] }));

  if (!report.campaigns.length) {
    return <Empty title="No results in these dates" body="Results appear once leads arrive and ad spend syncs from Meta." />;
  }

  return (
    <div className="grid gap-3.5">
      <div className="grid grid-cols-2 gap-3.5 desk:grid-cols-4">
        <Stat label="Cost per qualified lead" value={qualified ? money(spend / qualified, rowCurrency) : "—"} note={`${qualified} qualified`} emphasis />
        <Stat label="Ad spend" value={money(spend, rowCurrency)} />
        <Stat label="Leads" value={sum("leads") + (manual?.leads ?? 0)} note={manual ? `${manual.leads} typed in` : undefined} />
        <Stat label="Deals" value={sum("won") + (manual?.won ?? 0)} note={spend && sum("won") ? `${money(spend / sum("won"), rowCurrency)} per deal` : undefined} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3.5 desk:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section className={cardClass}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-medium">Leads per day</h2>
            <span className="font-mono text-2xs text-fg-muted uppercase">{summary.total} total</span>
          </div>
          <div className="mt-5"><DayBars days={summary.days} values /></div>
        </section>

        <section className={cardClass}>
          <h2 className="text-base font-medium">Lead temperature</h2>
          <div className="mt-4.5 flex h-2.5 gap-0.75 overflow-hidden rounded-full bg-control">
            {scored.filter((item) => item.count).map((item) => (
              <div key={item.key} className={cx("rounded-full", item.fill)} style={{ width: `${(item.count / Math.max(1, summary.total)) * 100}%` }} />
            ))}
          </div>
          <ul className="mt-4.5 grid gap-2.75">
            {scored.map((item) => (
              <li key={item.key} className="flex items-center gap-2.25 text-sm">
                <span aria-hidden className={cx("size-1.75 rounded-full", item.dot)} />
                <span className="flex-1 text-fg-muted">{item.label}</span>
                <span className="font-medium tabular-nums">{item.count}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4.5 border-t border-line pt-3.5 text-xs text-fg-muted">
            Median first reply: <b className="font-medium text-fg">{formatMinutes(summary.medianReplyMinutes)}</b> after the lead arrives.
          </p>
        </section>
      </div>

      {!!traced.length && (
        <section className={cardClass}>
          <h2 className="text-base font-medium">By campaign</h2>
          <div className="mt-4 grid gap-3.25">
            {traced.map((row) => (
              <BarRow key={row.campaignId} label={row.name} value={`${row.leads} leads${row.costPerQualified === null ? "" : `, ${money(row.costPerQualified, rowCurrency)} per qualified`}`} share={row.leads / mostLeads} />
            ))}
          </div>
        </section>
      )}

      <TableWrap>
        <thead>
          <tr>
            <th>Campaign</th>
            <th className="num">Spend</th>
            <th className="num">Leads</th>
            <th className="num">Per lead</th>
            <th className="num">Qualified</th>
            <th className="num">Per qualified</th>
            <th className="num">Deals</th>
          </tr>
        </thead>
        <tbody>
          {traced.map((row) => (
            <tr key={row.campaignId}>
              <td className="font-medium">{row.name}</td>
              <td className="num">{money(row.spend, row.currency ?? rowCurrency)}</td>
              <td className="num">{row.leads}</td>
              <td className="num">{row.costPerLead === null ? "—" : money(row.costPerLead, rowCurrency)}</td>
              <td className="num">{row.qualified}</td>
              <td className="num font-semibold text-accent">{row.costPerQualified === null ? "—" : money(row.costPerQualified, rowCurrency)}</td>
              <td className="num">{row.won}</td>
            </tr>
          ))}
          {manual && (
            <tr>
              <td className="text-fg-soft">Manual entries <Pill>Not tied to a campaign</Pill></td>
              <td className="num">—</td>
              <td className="num">{manual.leads}</td>
              <td className="num">—</td>
              <td className="num">{manual.qualified}</td>
              <td className="num">—</td>
              <td className="num">{manual.won}</td>
            </tr>
          )}
        </tbody>
      </TableWrap>
    </div>
  );
}
