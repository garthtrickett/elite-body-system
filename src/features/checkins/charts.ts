import { html, svg, nothing } from "lit-html";
import type { Entry } from "./data.ts";
import { PRIORITY_MOVEMENT } from "./data.ts";
import { effectivenessAverage, fundamentalAverage } from "./analysis.ts";
export const formatWeek = (week: string) => new Date(`${week}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
type Series = Readonly<{ name: string; value: (entry: Entry) => number | null }>;
function chart(entries: readonly Entry[], title: string, unit: string, series: readonly Series[], fixed = false) {
  const chronological = [...entries].reverse();
  const values = chronological.flatMap(entry => series.map(line => line.value(entry))).filter((value): value is number => value !== null);
  if (!values.length) return html`<figure class="ci-chart"><figcaption class="ci-form-title">${title}</figcaption><p class="ci-muted">${fixed ? "No scores recorded yet." : "No measurements recorded yet."}</p></figure>`;
  const min = fixed ? 1 : Math.min(...values), max = fixed ? 10 : Math.max(...values), padding = fixed ? 0 : Math.max((max - min) * 0.15, 0.5);
  const low = min - padding, high = max + padding;
  const first = Date.parse(chronological[0]!.week), last = Date.parse(chronological.at(-1)!.week);
  const x = (entry: Entry) => first === last ? 156 : 28 + (Date.parse(entry.week) - first) / (last - first) * 256;
  const y = (value: number) => 112 - (value - low) / Math.max(high - low, 1) * 88;
  return html`<figure class="ci-chart"><figcaption class="ci-form-title">${title}${unit ? html` <span class="ci-muted">${unit}</span>` : nothing}</figcaption>
    <svg viewBox="0 0 312 144" role="img" aria-label=${`${title} across ${entries.length} check-ins; exact values in the data table below`}>
      ${[low, (low + high) / 2, high].map(value => svg`<line x1="28" x2="284" y1=${y(value)} y2=${y(value)} class="ci-gridline"/><text x="23" y=${y(value) + 3} text-anchor="end">${value.toFixed(fixed ? 0 : 1)}</text>`)}
      ${series.map((line, index) => {
        // Missing measurements break the line rather than inventing observations.
        let drawing = false;
        const path = chronological.map(entry => { const value = line.value(entry); if (value === null) { drawing = false; return ""; } const command = drawing ? "L" : "M"; drawing = true; return `${command}${x(entry)},${y(value)}`; }).join(" ");
        return svg`<path d=${path} class=${`ci-line ci-series-${index}`}/>${chronological.map(entry => { const value = line.value(entry); return value === null ? nothing : svg`<circle cx=${x(entry)} cy=${y(value)} r="3" class=${`ci-point ci-series-${index}`}><title>${formatWeek(entry.week)}: ${line.name} ${value}${unit ? ` ${unit}` : ""}</title></circle>`; })}`;
      })}
      <text x="28" y="137">${formatWeek(chronological[0]!.week)}</text><text x="284" y="137" text-anchor="end">${entries.length > 1 ? formatWeek(chronological.at(-1)!.week) : ""}</text>
    </svg>
    <div class="ci-legend">${series.map((line, index) => html`<span class=${`ci-series-${index}`}>${line.name}</span>`)}</div>
    <details class="ci-chart-data"><summary>View exact values</summary><div class="ci-table-scroll"><table><caption>${title}</caption><thead><tr><th>Week</th>${series.map(line => html`<th>${line.name}${unit ? ` (${unit})` : ""}</th>`)}</tr></thead><tbody>${entries.map(entry => html`<tr><th scope="row">${formatWeek(entry.week)}</th>${series.map(line => html`<td>${line.value(entry) ?? "—"}</td>`)}</tr>`)}</tbody></table></div></details>
  </figure>`;
}
/** Count reported improvements; an unchanged result stays level and missing data stays absent. */
export function priorityMovementChart(entries: readonly Entry[]) {
  let improvements = 0;
  const points = [...entries].reverse().map(entry => {
    const result = entry.answers.data.priorityMovement;
    if (result === "improved") improvements++;
    return { entry, result, total: result === null ? null : improvements };
  });
  if (!points.some(point => point.total !== null)) return html`<figure class="ci-chart ci-movement-chart"><figcaption class="ci-form-title">Priority Movement</figcaption><p class="ci-muted">Your graph will appear after you submit a Priority Movement result.</p></figure>`;
  const first = Date.parse(points[0]!.entry.week), last = Date.parse(points.at(-1)!.entry.week), max = Math.max(1, improvements);
  const x = (entry: Entry) => first === last ? 156 : 28 + (Date.parse(entry.week) - first) / (last - first) * 256;
  const y = (value: number) => 112 - value / max * 88;
  let drawing = false;
  const path = points.map(point => {
    if (point.total === null) { drawing = false; return ""; }
    const segment = drawing ? `H${x(point.entry)} V${y(point.total)}` : `M${x(point.entry)},${y(point.total)}`;
    drawing = true;
    return segment;
  }).join(" ");
  const label = (point: typeof points[number]) => point.result === null ? "Not recorded" : PRIORITY_MOVEMENT[point.result];
  const levels = [...new Set([0, Math.floor(max / 2), max])];
  return html`<figure class="ci-chart ci-movement-chart"><figcaption class="ci-form-title">Priority Movement</figcaption>
    <p class="ci-muted">Improved steps up. Unchanged stays level.</p>
    <svg viewBox="0 0 312 144" role="img" aria-label="Priority Movement: each Improved result adds a step; Unchanged stays level. Weekly results are available in the table below.">
      ${levels.map(value => svg`<line x1="28" x2="284" y1=${y(value)} y2=${y(value)} class="ci-gridline"/><text x="23" y=${y(value) + 3} text-anchor="end">${value}</text>`)}
      <path d=${path} class="ci-line ci-series-0"/>
      ${points.map(point => point.total === null ? nothing : svg`<circle cx=${x(point.entry)} cy=${y(point.total)} r="3" class="ci-point ci-series-0"><title>${formatWeek(point.entry.week)}: ${label(point)}</title></circle>`)}
      <text x="28" y="137">${formatWeek(points[0]!.entry.week)}</text><text x="284" y="137" text-anchor="end">${points.length > 1 ? formatWeek(points.at(-1)!.entry.week) : ""}</text>
    </svg>
    <p class="ci-muted">${improvements} improved ${improvements === 1 ? "week" : "weeks"} in this view</p>
    <details class="ci-chart-data"><summary>View weekly results</summary><div class="ci-table-scroll"><table><caption>Priority Movement</caption><thead><tr><th>Week</th><th>Result</th><th>Improved weeks</th></tr></thead><tbody>${[...points].reverse().map(point => html`<tr><th scope="row">${formatWeek(point.entry.week)}</th><td>${label(point)}</td><td>${point.total ?? "—"}</td></tr>`)}</tbody></table></div></details>
  </figure>`;
}
export function progressCharts(entries: readonly Entry[]) {
  return html`<div class="ci-progress-charts">${priorityMovementChart(entries)}
    ${chart(entries, "Muscle Gain", "cm", [{ name: "Priority muscle group", value: entry => entry.answers.data.muscle }])}
    <div class="ci-charts">
      ${chart(entries, "Weight", "kg", [{ name: "Weight", value: entry => entry.answers.data.weight }])}
      ${chart(entries, "Waist", "cm", [{ name: "Waist", value: entry => entry.answers.data.waist }])}
    </div>
  </div>`;
}

export function scoreAveragesChart(entries: readonly Entry[]) {
  return chart(entries, "Score averages", "", [{ name: "Fundamentals", value: fundamentalAverage }, { name: "Effectiveness", value: effectivenessAverage }], true);
}
