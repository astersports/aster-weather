import { type EngineOptions } from "../provenance.js";
import type { Coords } from "../types.js";
/** One grid value over `[start, end)`. `value` is `null` when NWS gave none. */
export interface GridBlock {
    start: number;
    end: number;
    value: number | null;
}
/**
 * Blocks of one grid layer, sorted by start. Anything that is not an object
 * with a `values` array gives `[]`. An entry whose interval does not parse is
 * skipped; a non-finite value becomes `null`.
 */
export declare function parseGridLayer(layer: unknown): GridBlock[];
/** The value of the block with `start <= t < end`; `null` when none contains `t`. */
export declare function gridValueAt(blocks: GridBlock[], t: number): number | null;
/**
 * The forecast grid for a coordinate, layer by layer, or `null` when the point
 * is outside coverage or the grid could not be read. Never throws.
 */
export declare function getGrid(coords: Coords, opts?: EngineOptions): Promise<Record<string, GridBlock[]> | null>;
/** Test hook: clear every cached grid. */
export declare function clearGridCache(): void;
//# sourceMappingURL=grid.d.ts.map