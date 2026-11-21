import { useEffect, useRef } from "react";
import { useTheme } from "../../lib/theme.js";
import { cn } from "../../lib/utils.js";

interface CountSeries {
  label: string;
  values: readonly (number | null)[];
}

const number = new Intl.NumberFormat();

/** Bounded daily count series. Null values leave a gap in the plotted line. */
export function CountLineChart({
  className,
  label,
  dates,
  series
}: {
  className?: string;
  label: string;
  dates: readonly string[];
  series: readonly [CountSeries, CountSeries];
}): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const draw = (): void => drawChart(element, dates, series);
    draw();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, [dates, series, resolvedTheme]);

  return (
    <figure className={cn("flex min-w-0 flex-col gap-3", className)}>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="w-4 border-t-2 border-chart-2" />
          {series[0].label}
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="w-4 border-t-2 border-dashed border-foreground" />
          {series[1].label}
        </span>
      </figcaption>
      <div className="h-40 sm:h-48">
        <canvas ref={canvas} className="block size-full" role="img" aria-label={label} />
      </div>
    </figure>
  );
}

function drawChart(
  canvas: HTMLCanvasElement,
  dates: readonly string[],
  series: readonly [CountSeries, CountSeries]
): void {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0 || dates.length === 0) return;
  const context = canvas.getContext("2d");
  if (!context) return;

  const style = getComputedStyle(canvas);
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.scale(ratio, ratio);
  context.font = `11px ${style.fontFamily}`;
  const peak = Math.max(1, ...series.flatMap(({ values }) => values.map((value) => value ?? 0)));
  const step = Math.ceil(peak / 4);
  const steps = Math.ceil(peak / step);
  const left = Math.ceil(context.measureText(number.format(steps * step)).width) + 12;
  const right = width - 22;
  const top = 10;
  const bottom = height - 24;
  if (right <= left || bottom <= top) return;
  const x = (index: number): number =>
    left + (index / Math.max(1, dates.length - 1)) * (right - left);
  const y = (value: number): number => bottom - (value / (steps * step)) * (bottom - top);

  context.strokeStyle = style.getPropertyValue("--border").trim();
  context.fillStyle = style.getPropertyValue("--muted-foreground").trim();
  context.textBaseline = "middle";
  context.textAlign = "right";
  for (let index = 0; index <= steps; index += 1) {
    const value = index * step;
    const position = y(value);
    context.beginPath();
    context.moveTo(left, position);
    context.lineTo(right, position);
    context.stroke();
    context.fillText(number.format(value), left - 8, position);
  }
  context.textAlign = "center";
  const ticks = Math.max(1, Math.min(dates.length, Math.floor(width / 72), 7));
  for (let index = 0; index < ticks; index += 1) {
    const date = Math.round((index * (dates.length - 1)) / Math.max(1, ticks - 1));
    context.fillText(dates[date]!, x(date), height - 9);
  }

  for (const [index, dataset] of series.entries()) {
    const colour = style.getPropertyValue(index === 0 ? "--chart-2" : "--foreground").trim();
    context.strokeStyle = colour;
    context.fillStyle = colour;
    context.lineWidth = 2;
    context.setLineDash(index === 0 ? [] : [5, 4]);
    context.beginPath();
    let connected = false;
    dataset.values.forEach((value, day) => {
      if (value === null) {
        connected = false;
        return;
      }
      if (connected) context.lineTo(x(day), y(value));
      else context.moveTo(x(day), y(value));
      connected = true;
    });
    context.stroke();
    dataset.values.forEach((value, day) => {
      if (value === null || dataset.values[day - 1] != null || dataset.values[day + 1] != null)
        return;
      context.beginPath();
      context.arc(x(day), y(value), 2, 0, 2 * Math.PI);
      context.fill();
    });
  }
}
