import type { GridJson } from "@/types/farm";

export interface TilePosition {
  row: number;
  col: number;
  screenX: number;   // top-left of hex bounding box
  screenY: number;
  centerX: number;   // hex center
  centerY: number;
  plotLabel: string;
  isActive: boolean;
  colour: number; // hex number for PixiJS
}

function hexStringToNumber(hex: string): number {
  const clean = hex.replace("#", "");
  return parseInt(clean, 16);
}

/**
 * Generates pointy-top hexagonal tile positions for the farm grid.
 * Returns tileWidth (hex width = √3·r) and tileHeight (hex height = 2·r).
 */
export function generateTilePositions(
  gridJson: GridJson,
  containerWidth: number,
  containerHeight: number
): { tiles: TilePosition[]; tileWidth: number; tileHeight: number } {
  const gridSize = gridJson.grid.length;
  const sqrt3 = Math.sqrt(3);

  // Calculate hex radius to fit the container with padding
  const maxW = containerWidth * 0.9;
  const maxH = containerHeight * 0.9;

  // Pointy-top hex layout:
  //   Total width  ≈ (gridSize + 0.5) × hexWidth
  //   Total height ≈ (1.5 × gridSize + 0.5) × r
  const rFromWidth = maxW / (sqrt3 * (gridSize + 0.5));
  const rFromHeight = maxH / (1.5 * gridSize + 0.5);
  const r = Math.min(rFromWidth, rFromHeight);

  const hexWidth = sqrt3 * r;
  const hexHeight = 2 * r;
  const vertSpacing = 1.5 * r;

  // Compute raw centre positions
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;

  const rawTiles: {
    row: number;
    col: number;
    cx: number;
    cy: number;
    plotLabel: string;
    isActive: boolean;
    colour: number;
  }[] = [];

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const label = gridJson.grid[row][col];
      const isActive = label !== "out";

      // Centre of this hex
      const cx = col * hexWidth + (row % 2 === 1 ? hexWidth / 2 : 0);
      const cy = row * vertSpacing;

      let colour = 0xcccccc;
      if (isActive && gridJson.plots[label]) {
        colour = hexStringToNumber(gridJson.plots[label].colour);
      }

      // Bounding box extremes
      minX = Math.min(minX, cx - hexWidth / 2);
      maxX = Math.max(maxX, cx + hexWidth / 2);
      minY = Math.min(minY, cy - r);
      maxY = Math.max(maxY, cy + r);

      rawTiles.push({ row, col, cx, cy, plotLabel: label, isActive, colour });
    }
  }

  // Centre the grid in the container
  const gridW = maxX - minX;
  const gridH = maxY - minY;
  const offsetX = (containerWidth - gridW) / 2 - minX;
  const offsetY = (containerHeight - gridH) / 2 - minY;

  const tiles: TilePosition[] = rawTiles.map((t) => ({
    row: t.row,
    col: t.col,
    screenX: t.cx + offsetX - hexWidth / 2,
    screenY: t.cy + offsetY - r,
    centerX: t.cx + offsetX,
    centerY: t.cy + offsetY,
    plotLabel: t.plotLabel,
    isActive: t.isActive,
    colour: t.colour,
  }));

  return { tiles, tileWidth: hexWidth, tileHeight: hexHeight };
}
