import React, { useState } from 'react';

interface DailyPoint {
  date: string;
  label: string;
  scans: number;
}

interface ScanVolumeChartProps {
  series: DailyPoint[];
}

export const ScanVolumeChart: React.FC<ScanVolumeChartProps> = ({ series }) => {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const width = 760;
  const height = 240;
  const padLeft = 40;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 30;

  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const maxScans = Math.max(10, ...series.map((d) => d.scans));
  const niceMax = Math.ceil(maxScans / 5) * 5;
  const step = plotWidth / Math.max(1, series.length);
  const barWidth = Math.max(14, Math.min(32, step * 0.56));

  const activePoint =
    (hoveredDate ? series.find((d) => d.date === hoveredDate) : null) ??
    series[series.length - 1];

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div className="text-xs text-slate-500">
          Daily QR scans across all routes (last 14 days)
        </div>
        {activePoint && (
          <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
            <span className="text-slate-600">{activePoint.date}</span>
            <span aria-hidden="true" className="text-slate-300">|</span>
            <span className="font-semibold text-sky-700">{activePoint.scans} scans</span>
          </div>
        )}
      </div>

      <div className="mt-3 w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[520px] h-auto select-none"
          role="img"
          aria-label="14-day QR scan volume bar chart"
        >
          {ticks.map((ratio) => {
            const y = padTop + plotHeight * (1 - ratio);
            const val = Math.round(niceMax * ratio);
            return (
              <g key={ratio}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-500 text-[10px] font-mono tabular-nums"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {series.map((point, idx) => {
            const cx = padLeft + idx * step + step / 2;
            const barH = (point.scans / niceMax) * plotHeight;
            const barY = padTop + plotHeight - barH;
            const isHovered = hoveredDate === point.date;

            return (
              <g
                key={point.date}
                onMouseEnter={() => setHoveredDate(point.date)}
                onMouseLeave={() => setHoveredDate(null)}
                className="cursor-pointer"
              >
                <rect
                  x={padLeft + idx * step}
                  y={padTop}
                  width={step}
                  height={plotHeight}
                  fill={isHovered ? '#f1f5f9' : 'transparent'}
                />
                <rect
                  x={cx - barWidth / 2}
                  y={barY}
                  width={barWidth}
                  height={Math.max(2, barH)}
                  rx={2}
                  fill={isHovered ? '#0369a1' : '#0284c7'}
                  opacity={isHovered ? 1 : 0.88}
                />
                {idx % 2 === 0 && (
                  <text
                    x={cx}
                    y={height - 10}
                    textAnchor="middle"
                    className={`text-[10px] font-mono tabular-nums ${
                      isHovered ? 'fill-slate-900 font-semibold' : 'fill-slate-500'
                    }`}
                  >
                    {point.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
