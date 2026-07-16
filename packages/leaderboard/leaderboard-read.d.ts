/**
 * The four time windows are ROLLING: each shows entries from the last `ms`
 * milliseconds (strictly nested — 24h ⊆ 7d ⊆ 30d ⊆ all), sorted by score.
 * `ms: null` is the all-time view (no time filter). `title` is the hover tooltip
 * that spells out the window. Exported so view layers (e.g. the
 * `<cozy-leaderboard>` element) can render the tab bar themselves.
 */
export const DURATIONS: {
    id: string;
    label: string;
    ms: number;
    title: string;
}[];
/**
 * Read-only leaderboard view: windows, sorting (via the adapter), and rendering.
 * Nothing here writes; the ranked value is a plain `score` displayed through an
 * injected formatter, and all query I/O is delegated to an injected adapter's
 * `listScores`. Safe to wire to a read-only / less-privileged backend instance.
 */
export class LeaderBoardReader {
    /**
     * @param {Object} options
     * @param {Object} options.adapter - storage backend; the READ side uses `listScores`
     * @param {'asc'|'desc'} [options.scoreOrder] - 'asc' = lower is better (e.g. time), 'desc' = higher is better
     * @param {(value: number) => string} [options.formatScore] - display formatter for a score
     * @param {Object} [options.labels] - optional tab-label overrides keyed by duration id
     * @param {Object} [options.tooltips] - optional tab hover-text overrides keyed by duration id
     * @param {string[]} [options.emptyMessages] - empty-state messages (one picked at random); localize here
     * @param {string} [options.loadingText] - shown while a window loads
     * @param {string} [options.errorText] - shown when a window fails to load
     * @param {string} [options.anonymousName] - fallback display name for entries without one
     */
    constructor(options?: {
        adapter: any;
        scoreOrder?: "asc" | "desc";
        formatScore?: (value: number) => string;
        labels?: any;
        tooltips?: any;
        emptyMessages?: string[];
        loadingText?: string;
        errorText?: string;
        anonymousName?: string;
    });
    adapter: any;
    scoreOrder: string;
    formatScore: (value: number) => string;
    labels: any;
    tooltips: any;
    emptyMessages: string[];
    loadingText: string;
    errorText: string;
    anonymousName: string;
    /**
     * Display label for a duration window (override-aware).
     * @param {{ id: String, label: String }} duration - a DURATIONS entry
     */
    label(duration: {
        id: string;
        label: string;
    }): any;
    /**
     * Hover tooltip for a duration window (override-aware).
     * @param {{ id: String, title: String }} duration - a DURATIONS entry
     */
    tooltip(duration: {
        id: string;
        title: string;
    }): any;
    /** One empty-state message, picked at random. */
    emptyMessage(): string;
    /**
     * Data-level query: the ranked entries for a category and duration window,
     * without any DOM. View layers that render themselves (e.g. the
     * `<cozy-leaderboard>` element) use this instead of {@link render}.
     * @param {String} category
     * @param {String} durationId - a DURATIONS id ('today' | 'week' | 'month' | 'all')
     * @returns {Promise<Object[]>}
     */
    list(category: string, durationId: string): Promise<any[]>;
    /**
     * Backend-neutral query descriptor for a category and time window. `since` is
     * the rolling cutoff (entries with `time_stamp >= since`); `null` means
     * all-time (no time filter). The adapter turns this into a real query.
     */
    _descriptor(category: any, duration: any): {
        category: any;
        since: Date;
        order: string;
        limit: number;
    };
    /**
     * Render the leaderboard for a category with a duration tab bar. When
     * `duration` is omitted the last-selected tab is reused (so switching game
     * category keeps the player on the same window), defaulting to "today".
     * Returns the wrapper element; tab clicks re-query in place.
     * @param {String} category
     * @param {String} title
     * @param {String} [duration]
     * @returns {Promise<HTMLDivElement>}
     */
    render(category: string, title: string, duration?: string): Promise<HTMLDivElement>;
    category: string;
    title: string;
    duration: any;
    _styleTab(tab: any, active: any): void;
    /**
     * Load a window's entries into the list area, showing a loading placeholder
     * and turning any failure (e.g. the backend being unreachable) into a
     * message instead of an unhandled rejection. Guards against races when the
     * player switches tabs quickly by tagging the in-flight request.
     */
    _loadList(listWrapper: any, category: any, duration: any): Promise<void>;
    _loadToken: any;
    _renderList(listWrapper: any, rows: any): void;
}
