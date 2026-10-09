export function visiblePages(page: number, total: number, single: boolean): number[];
export function adjacentPage(page: number, total: number, single: boolean, direction: number): number;
export function isPreviousPageSwipe(startX: number, startY: number, endX: number, endY: number, minDistance?: number): boolean;
