import type { GridJson } from "@/types/farm";

export interface TilePosition {
  row: number;
  col: number;
  screenX: number;
  screenY: number;
  plotLabel: string;
  isActive: boolean;
  colour: number; // hex number for PixiJS
}

function hexStringToNumber(hex: string): number {
  const clean = hex.replace("#", "");
  return parseInt(clean, 16);
}

export function generateTilePositions(
  gridJson: GridJson,
  containerWidth: number,
  containerHeight: number
): { tiles: TilePosition[]; tileWidth: number; tileHeight: number } {
  const gridSize = gridJson.grid.length;

  // Calculate tile dimensions to fit the container
  // The isometric grid spans: width = gridSize * tileWidth, height = gridSize * tileHeight/2
  // We want the grid to fit nicely with some padding
  const maxGridWidth = containerWidth * 0.85;
  const maxGridHeight = containerHeight * 0.85;

  // In isometric view, total width = gridSize * tileWidth, total height ≈ gridSize * tileHeight/2 + tileHeight
  let tileWidth = maxGridWidth / gridSize;
  let tileHeight = tileWidth * 0.5;

  // Check if height fits
  const totalHeight = gridSize * (tileHeight / 2) + tileHeight;
  if (totalHeight > maxGridHeight) {
    tileHeight = (maxGridHeight * 2) / (gridSize + 2);
    tileWidth = tileHeight * 2;
  }

  // Calculate bounding box of the isometric grid to centre it
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;

  const rawTiles: {
    row: number;
    col: number;
    x: number;
    y: number;
    plotLabel: string;
    isActive: boolean;
    colour: number;
  }[] = [];

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const label = gridJson.grid[r][c];
      const isActive = label !== "out";

      // Isometric projection
      const x = (c - r) * (tileWidth / 2);
      const y = (c + r) * (tileHeight / 2);

      // Diamond corners for bounding box
      const top = { x: x + tileWidth / 2, y: y };
      const right = { x: x + tileWidth, y: y + tileHeight / 2 };
      const bottom = { x: x + tileWidth / 2, y: y + tileHeight };
      const left = { x: x, y: y + tileHeight / 2 };

      minX = Math.min(minX, left.x);
      maxX = Math.max(maxX, right.x);
      minY = Math.min(minY, top.y);
      maxY = Math.max(maxY, bottom.y);

      let colour = 0xcccccc;
      if (isActive && gridJson.plots[label]) {
        colour = hexStringToNumber(gridJson.plots[label].colour);
      }

      rawTiles.push({ row: r, col: c, x, y, plotLabel: label, isActive, colour });
    }
  }

  // Centre offset
  const gridWidth = maxX - minX;
  const gridHeight = maxY - minY;
  const offsetX = (containerWidth - gridWidth) / 2 - minX;
  const offsetY = (containerHeight - gridHeight) / 2 - minY;

  const tiles: TilePosition[] = rawTiles.map((t) => ({
    row: t.row,
    col: t.col,
    screenX: t.x + offsetX,
    screenY: t.y + offsetY,
    plotLabel: t.plotLabel,
    isActive: t.isActive,
    colour: t.colour,
  }));

  return { tiles, tileWidth, tileHeight };
}
