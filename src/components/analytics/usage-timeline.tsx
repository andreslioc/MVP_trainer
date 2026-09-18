"use client";

import { useState } from "react";

type UsageDay = {
  day: string;
  trainingMinutes: number;
  pretrainingMinutes: number;
  totalMinutes: number;
};

const WIDTH = 720;
const HEIGHT = 220;
const LEFT = 42;
const RIGHT = 14;
const TOP = 14;
const BOTTOM = 30;

function dayLabel(day: string) {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${day}T12:00:00Z`))
    .replace(".", "");
}

function fullDayLabel(day: string) {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

/** Dos líneas comparables sobre la misma escala: estudiar y practicar. */
export function UsageTimeline({ data }: { data: UsageDay[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  if (data.length === 0) return null;
  const max = Math.max(...data.flatMap((day) => [day.trainingMinutes, day.pretrainingMinutes]), 1);
  const chartWidth = WIDTH - LEFT - RIGHT;
  const chartHeight = HEIGHT - TOP - BOTTOM;
  const x = (index: number) =>
    data.length === 1 ? LEFT + chartWidth / 2 : LEFT + (index / (data.length - 1)) * chartWidth;
  const y = (value: number) => TOP + chartHeight - (value / max) * chartHeight;
  const points = (field: "trainingMinutes" | "pretrainingMinutes") =>
    data.map((day, index) => `${x(index).toFixed(1)},${y(day[field]).toFixed(1)}`).join(" ");
  const labelIndexes = [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])];
  const band = (index: number) => {
    const start = index === 0 ? LEFT : (x(index - 1) + x(index)) / 2;
    const end = index === data.length - 1 ? WIDTH - RIGHT : (x(index) + x(index + 1)) / 2;
    return { start, width: end - start };
  };
  const active = activeIndex === null ? null : data[activeIndex];
  const activeX = activeIndex === null ? 0 : x(activeIndex);
  const activeY = active ? Math.min(y(active.trainingMinutes), y(active.pretrainingMinutes)) : 0;
  const tooltipOnRight = activeX > WIDTH * 0.76;
  const tooltipOnLeft = activeX < WIDTH * 0.24;

  return (
    <figure>
      <figcaption className="sr-only">
        Minutos diarios en Training y Pre-training durante el periodo
      </figcaption>
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-fg-muted">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-0.5 w-6 bg-primary" />
          Training
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-0.5 w-6 bg-mint-ink" />
          Pre-training
        </span>
      </div>
      <div className="relative">
        <svg
          aria-hidden="true"
          className="h-56 w-full overflow-visible"
          preserveAspectRatio="none"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        >
          {[0, 0.5, 1].map((ratio) => {
            const value = Math.round(max * (1 - ratio));
            const position = TOP + chartHeight * ratio;
            return (
              <g key={ratio}>
                <line
                  className="stroke-border"
                  strokeDasharray="3 5"
                  x1={LEFT}
                  x2={WIDTH - RIGHT}
                  y1={position}
                  y2={position}
                />
                <text
                  className="fill-fg-muted text-xs"
                  textAnchor="end"
                  x={LEFT - 7}
                  y={position + 4}
                >
                  {value}
                </text>
              </g>
            );
          })}
          {activeIndex === null ? null : (
            <rect
              className="fill-primary opacity-10"
              height={chartHeight}
              width={band(activeIndex).width}
              x={band(activeIndex).start}
              y={TOP}
            />
          )}
          <polyline
            className="stroke-primary"
            fill="none"
            points={points("trainingMinutes")}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            className="stroke-mint-ink"
            fill="none"
            points={points("pretrainingMinutes")}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
          />
          {data.map((day, index) => (
            <g key={day.day}>
              <circle
                className="fill-primary stroke-surface"
                cx={x(index)}
                cy={y(day.trainingMinutes)}
                r={activeIndex === index ? 5 : 3}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
              <circle
                className="fill-mint-ink stroke-surface"
                cx={x(index)}
                cy={y(day.pretrainingMinutes)}
                r={activeIndex === index ? 5 : 3}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
          {labelIndexes.map((index) => (
            <text
              className="fill-fg-muted text-xs"
              key={data[index]?.day}
              textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}
              x={x(index)}
              y={HEIGHT - 5}
            >
              {dayLabel(data[index]?.day ?? "")}
            </text>
          ))}
        </svg>
        <div
          className="absolute"
          style={{
            bottom: `${(BOTTOM / HEIGHT) * 100}%`,
            left: `${(LEFT / WIDTH) * 100}%`,
            right: `${(RIGHT / WIDTH) * 100}%`,
            top: `${(TOP / HEIGHT) * 100}%`,
          }}
        >
          {data.map((day, index) => {
            const dayBand = band(index);
            const detail = `${fullDayLabel(day.day)}: ${day.trainingMinutes} minutos en Training, ${day.pretrainingMinutes} en Pre-training, ${day.totalMinutes} en total`;
            return (
              <button
                aria-label={detail}
                className="absolute inset-y-0 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-primary"
                key={day.day}
                onBlur={() => setActiveIndex(null)}
                onClick={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onPointerEnter={() => setActiveIndex(index)}
                onPointerLeave={(event) => {
                  if (
                    event.pointerType === "mouse" &&
                    document.activeElement !== event.currentTarget
                  )
                    setActiveIndex(null);
                }}
                style={{
                  left: `${((dayBand.start - LEFT) / chartWidth) * 100}%`,
                  width: `${(dayBand.width / chartWidth) * 100}%`,
                }}
                title={detail}
                type="button"
              />
            );
          })}
        </div>
        {active ? (
          <div
            className="pointer-events-none absolute z-10 min-w-44 rounded-card border border-border-control bg-surface p-3 text-sm text-fg"
            role="tooltip"
            style={{
              left: `${(activeX / WIDTH) * 100}%`,
              top: `${Math.max((activeY / HEIGHT) * 100, 8)}%`,
              transform: `translate(${tooltipOnRight ? "-100%" : tooltipOnLeft ? "0" : "-50%"}, ${activeY > HEIGHT * 0.42 ? "-110%" : "12%"})`,
            }}
          >
            <p className="font-semibold capitalize">{fullDayLabel(active.day)}</p>
            <dl className="mt-2 space-y-1 tabular-nums">
              <div className="flex justify-between gap-5">
                <dt className="text-fg-muted">Training</dt>
                <dd className="font-semibold">{active.trainingMinutes} min</dd>
              </div>
              <div className="flex justify-between gap-5">
                <dt className="text-fg-muted">Pre-training</dt>
                <dd className="font-semibold">{active.pretrainingMinutes} min</dd>
              </div>
              <div className="flex justify-between gap-5 border-t border-border pt-1">
                <dt>Total</dt>
                <dd className="font-semibold">{active.totalMinutes} min</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </div>
      <ul className="sr-only">
        {data.map((day) => (
          <li key={day.day}>
            {dayLabel(day.day)}: {day.trainingMinutes} minutos en Training y{" "}
            {day.pretrainingMinutes} minutos en Pre-training
          </li>
        ))}
      </ul>
    </figure>
  );
}
