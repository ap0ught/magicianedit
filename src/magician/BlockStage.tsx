import { useEffect, useRef, type MouseEvent } from "react";
import { levelWindow, type MagicianLevel } from "./document.ts";

function fillFor(index: number): string {
  const hue = (index * 47) % 360;
  const light = 22 + (index % 7) * 6;
  return `hsl(${hue} 42% ${light}%)`;
}

/** Block-index grid for one level window. Left click paints, right click picks. */
export function BlockStage({
  level,
  revision,
  onPaint,
  onPick,
  onHover,
}: {
  level: MagicianLevel;
  revision: number;
  onPaint: (x: number, y: number) => void;
  onPick: (index: number) => void;
  onHover: (text: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const view = levelWindow(level);
  const cell = view.cols > 48 ? 10 : 16;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = Math.max(1, view.cols * cell);
    canvas.height = Math.max(1, view.rows * cell);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0c0b09";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < view.rows; y++) {
      for (let x = 0; x < view.cols; x++) {
        const index = level.map.blocks[(view.y + y) * level.map.width + (view.x + x)];
        ctx.fillStyle = fillFor(index);
        ctx.fillRect(x * cell, y * cell, Math.max(1, cell - 1), Math.max(1, cell - 1));
      }
    }
  }, [level, view.cols, view.rows, view.x, view.y, cell, revision]);

  function at(event: MouseEvent<HTMLCanvasElement>): { x: number; y: number; index: number } | null {
    const canvas = ref.current;
    if (!canvas || view.cols === 0 || view.rows === 0) return null;
    const rect = canvas.getBoundingClientRect();
    const px = ((event.clientX - rect.left) * canvas.width) / rect.width;
    const py = ((event.clientY - rect.top) * canvas.height) / rect.height;
    const x = Math.floor(px / cell);
    const y = Math.floor(py / cell);
    if (x < 0 || y < 0 || x >= view.cols || y >= view.rows) return null;
    const index = level.map.blocks[(view.y + y) * level.map.width + (view.x + x)];
    return { x, y, index };
  }

  return (
    <canvas
      ref={ref}
      className="cross"
      onContextMenu={(event) => event.preventDefault()}
      onMouseLeave={() => onHover("")}
      onMouseDown={(event) => {
        const hit = at(event);
        if (!hit) return;
        if (event.button === 2) onPick(hit.index);
        else if (event.button === 0) onPaint(hit.x, hit.y);
      }}
      onMouseMove={(event) => {
        const hit = at(event);
        if (!hit) {
          onHover("");
          return;
        }
        onHover(`block ${view.x + hit.x},${view.y + hit.y} index ${hit.index}`);
        if ((event.buttons & 1) !== 0) onPaint(hit.x, hit.y);
      }}
    />
  );
}
