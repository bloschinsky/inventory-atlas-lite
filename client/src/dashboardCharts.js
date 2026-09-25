/*
  ApexCharts options of the Dashboard charts. Every color comes from Tabler's own custom properties,
  resolved for the active color mode, so the charts follow light, dark, and a live theme switch.
  Numbers are formatted by the caller-provided `format` in the active locale.
*/

// ApexCharts ships inside Tabler's distribution; it is loaded on demand so other pages never pay for it.
let apexCharts;
export const loadApexCharts = () => {
  apexCharts ||= import('@tabler/core/dist/libs/apexcharts/dist/apexcharts.min.js')
    .then(module => module.default || globalThis.ApexCharts);
  return apexCharts;
};

// The categorical order is fixed, so a condition keeps its color while the others change.
const CATEGORICAL = ['--tblr-primary', '--tblr-orange', '--tblr-teal', '--tblr-purple', '--tblr-pink'];
const TOKENS = {
  primary: '--tblr-primary',
  success: '--tblr-green',
  text: '--tblr-body-color',
  muted: '--tblr-secondary',
  border: '--tblr-border-color',
  surface: '--tblr-bg-surface',
  track: '--tblr-bg-surface-secondary',
  neutral: '--tblr-gray-400',
  // A second, quieter neutral so a blank value never looks like the Other bucket beside it.
  faint: 'light-dark(var(--tblr-gray-300), var(--tblr-gray-600))'
};

/*
  Tabler defines its colors with light-dark() and color-mix(), which ApexCharts cannot read. Each one
  is painted on a 1×1 canvas under the current color scheme and read back as plain hex.
*/
export function resolveChartTheme() {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  document.body.append(probe);
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const read = variable => {
    probe.style.color = variable.startsWith('--') ? `var(${variable})` : variable;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = getComputedStyle(probe).color;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
    return `#${[red, green, blue].map(value => value.toString(16).padStart(2, '0')).join('')}`;
  };
  const colors = Object.fromEntries(Object.entries(TOKENS).map(([name, variable]) => [name, read(variable)]));
  colors.categorical = CATEGORICAL.map(read);
  colors.mode = document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light';
  probe.remove();
  return colors;
}

// The shared frame: no toolbar, no animation, theme-aware text, tooltips, and a recessive grid.
const base = (colors, type, height, extra = {}) => ({
  ...extra,
  chart: {
    type,
    height,
    parentHeightOffset: 0,
    fontFamily: 'inherit',
    foreColor: colors.muted,
    background: 'transparent',
    toolbar: { show: false },
    zoom: { enabled: false },
    animations: { enabled: false },
    ...extra.chart
  },
  theme: { mode: colors.mode },
  tooltip: { theme: colors.mode, ...extra.tooltip },
  grid: { borderColor: colors.border, strokeDashArray: 4, padding: { top: 0, right: 0, bottom: 0, left: 0 }, ...extra.grid },
  legend: { show: false },
  dataLabels: { enabled: false, ...extra.dataLabels },
  states: { hover: { filter: { type: 'none' } }, active: { filter: { type: 'none' } } }
});

export const photoCoverageOptions = ({ colors, percentage, format }) => base(colors, 'radialBar', 170, {
  series: [percentage],
  labels: [''],
  colors: [colors.primary],
  plotOptions: {
    radialBar: {
      hollow: { size: '62%' },
      track: { background: colors.track, strokeWidth: '100%' },
      dataLabels: {
        name: { show: false },
        value: { show: true, offsetY: 8, fontSize: '1.5rem', fontWeight: 600, color: colors.text, formatter: value => `${format(value)}%` }
      }
    }
  },
  stroke: { lineCap: 'round' }
});

// One 100% stacked bar; the three segments are listed with their counts next to the chart.
export const placementOptions = ({ colors, segments, format }) => base(colors, 'bar', 44, {
  series: segments.map(segment => ({ name: segment.label, data: [segment.count] })),
  colors: [colors.primary, colors.success, colors.neutral],
  chart: { stacked: true, stackType: '100%', sparkline: { enabled: true } },
  plotOptions: { bar: { horizontal: true, barHeight: '100%', borderRadius: 4, borderRadiusApplication: 'end' } },
  stroke: { width: 2, colors: [colors.surface] },
  xaxis: { categories: [''] },
  tooltip: { y: { formatter: value => format(value) } }
});

export const recentActivityOptions = ({ colors, buckets, label, formatDate, format }) => base(colors, 'area', 48, {
  series: [{ name: label, data: buckets.map(bucket => bucket.count) }],
  colors: [colors.primary],
  chart: { sparkline: { enabled: true } },
  stroke: { width: 2, curve: 'straight' },
  fill: { type: 'solid', opacity: 0.16 },
  xaxis: { categories: buckets.map(bucket => bucket.date) },
  tooltip: {
    x: { formatter: (_value, { dataPointIndex }) => formatDate(buckets[dataPointIndex]?.date) },
    y: { formatter: value => format(value), title: { formatter: () => '' } },
    marker: { show: false }
  }
});

/*
  The whole inventory by category. With a filter active the selected category keeps the primary color
  and the others recede to neutral; Other is always neutral because it cannot be selected.
*/
export const categoryTreemapOptions = ({ colors, entries, label, format, onSelect }) => {
  const anySelected = entries.some(entry => entry.selected);
  return base(colors, 'treemap', 260, {
    series: [{ data: entries.map(entry => ({ x: entry.label, y: entry.count })) }],
    colors: entries.map(entry => (!entry.categoryId || (anySelected && !entry.selected) ? colors.neutral : colors.primary)),
    chart: {
      events: {
        dataPointSelection: (_event, _chart, { dataPointIndex }) => onSelect(entries[dataPointIndex]),
        dataPointMouseEnter: event => {
          event.target.style.cursor = 'pointer';
        }
      }
    },
    plotOptions: { treemap: { distributed: true, enableShades: false, borderRadius: 4 } },
    stroke: { width: 2, colors: [colors.surface] },
    dataLabels: { enabled: true, style: { fontSize: '13px', fontWeight: 500 }, formatter: (text, { value }) => [text, format(value)] },
    tooltip: { y: { formatter: value => format(value), title: { formatter: () => `${label}:` } } }
  });
};

// Blank and grouped conditions are neutral; named conditions take the categorical colors in order.
export const conditionColors = (colors, entries) => {
  let next = 0;
  return entries.map(entry => {
    if (entry.key === '__other__') return colors.neutral;
    if (entry.key === 'not-specified') return colors.faint;
    return colors.categorical[next++ % colors.categorical.length];
  });
};

export const conditionDonutOptions = ({ colors, entries, labels, total, totalLabel, format }) => base(colors, 'donut', 240, {
  series: entries.map(entry => entry.count),
  labels,
  colors: conditionColors(colors, entries),
  stroke: { width: 2, colors: [colors.surface] },
  plotOptions: {
    pie: {
      donut: {
        size: '68%',
        labels: {
          show: true,
          name: { show: true, color: colors.muted, offsetY: 18 },
          value: { show: true, color: colors.text, fontSize: '1.5rem', fontWeight: 600, offsetY: -14, formatter: value => format(Number(value)) },
          total: { show: true, showAlways: true, label: totalLabel, color: colors.muted, formatter: () => format(total) }
        }
      }
    }
  },
  tooltip: { y: { formatter: value => format(value) } }
});

export const fieldCoverageOptions = ({ colors, fields, labels, seriesName, format }) => base(colors, 'radar', 280, {
  series: [{ name: seriesName, data: fields.map(field => field.percentage) }],
  // Axis names break at spaces, so two-word names stay inside a narrow phone card.
  labels: labels.map(label => label.split(' ')),
  colors: [colors.primary],
  stroke: { width: 2 },
  fill: { opacity: 0.16 },
  markers: { size: 4, strokeWidth: 2, strokeColors: colors.surface },
  plotOptions: { radar: { polygons: { strokeColors: colors.border, connectorColors: colors.border, fill: { colors: ['transparent'] } } } },
  // The exact percentages are listed beside the chart, so the rings carry no labels of their own.
  yaxis: { show: false, min: 0, max: 100, tickAmount: 4 },
  xaxis: { labels: { style: { colors: labels.map(() => colors.muted), fontSize: '11px' } } },
  tooltip: {
    x: { formatter: (_value, { dataPointIndex }) => labels[dataPointIndex] },
    y: { formatter: (value, { dataPointIndex }) => `${format(value)}% (${format(fields[dataPointIndex].count)} / ${format(fields[dataPointIndex].total)})` }
  }
});

export const locationBarOptions = ({ colors, entries, labels, seriesName, format }) => base(colors, 'bar', Math.max(160, entries.length * 36 + 24), {
  series: [{ name: seriesName, data: entries.map(entry => entry.count) }],
  colors: entries.map(entry => (entry.key.startsWith('__') ? colors.neutral : colors.primary)),
  plotOptions: {
    bar: { horizontal: true, distributed: true, barHeight: '62%', borderRadius: 4, borderRadiusApplication: 'end', dataLabels: { position: 'top' } }
  },
  // Counts sit just past the end of each bar, in text color rather than on the bar fill.
  dataLabels: {
    enabled: true,
    textAnchor: 'start',
    offsetX: 8,
    style: { colors: [colors.text], fontWeight: 500 },
    formatter: value => format(value)
  },
  // Headroom past the longest bar keeps its count label inside the card.
  xaxis: {
    categories: labels,
    max: Math.ceil(Math.max(1, ...entries.map(entry => entry.count)) * 1.15),
    labels: { show: false },
    axisBorder: { show: false },
    axisTicks: { show: false }
  },
  yaxis: { labels: { maxWidth: 140, style: { colors: colors.muted } } },
  grid: { xaxis: { lines: { show: false } }, yaxis: { lines: { show: false } }, padding: { right: 40 } },
  tooltip: { y: { formatter: value => format(value), title: { formatter: () => `${seriesName}:` } } }
});
