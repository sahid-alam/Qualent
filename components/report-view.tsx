import type { campaignReport } from "../lib/reports.ts";
import { buttonClass, Empty, inputClass, money, Pill, Stat, TableWrap } from "./ui";

type Report = Awaited<ReturnType<typeof campaignReport>>;

export function DateRange({ from, to }: { from: string; to: string }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-xs text-fg-muted">From<input type="date" name="from" defaultValue={from} className={inputClass} /></label>
      <label className="grid gap-1 text-xs text-fg-muted">To<input type="date" name="to" defaultValue={to} className={inputClass} /></label>
      <button className={buttonClass()}>Apply</button>
    </form>
  );
}

/** The same numbers for staff and for the client, so nobody sees a different story. */
export function CampaignReport({ report, currency }: { report: Report; currency: string }) {
  const traced = report.campaigns.filter((row) => !row.manual);
  const manual = report.campaigns.find((row) => row.manual);
  const sum = (key: "spend" | "leads" | "qualified" | "won") => traced.reduce((total, row) => total + row[key], 0);
  const spend = sum("spend");
  const qualified = sum("qualified");
  const rowCurrency = traced.find((row) => row.currency)?.currency ?? currency;

  if (!report.campaigns.length) {
    return <Empty title="No results in these dates" body="Results appear once leads arrive and ad spend syncs from Meta." />;
  }

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-2.5 desk:grid-cols-4">
        <Stat label="Ad spend" value={money(spend, rowCurrency)} />
        <Stat label="Leads" value={sum("leads")} />
        <Stat label="Cost per qualified lead" value={qualified ? money(spend / qualified, rowCurrency) : "—"} note={`${qualified} qualified`} emphasis />
        <Stat label="Deals" value={sum("won") + (manual?.won ?? 0)} note={spend && sum("won") ? `${money(spend / sum("won"), rowCurrency)} per deal` : undefined} />
      </div>
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
