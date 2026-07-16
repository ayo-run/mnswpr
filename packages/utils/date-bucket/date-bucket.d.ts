export function dayKey(date: Date): string;
export function monthKey(date: Date): string;
export function weekKey(date: Date): string;
export function buckets(date: Date): {
    day: string;
    week: string;
    month: string;
};
