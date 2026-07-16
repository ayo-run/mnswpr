/**
 * Generic, game- AND backend-agnostic leaderboard. Nothing here knows about
 * minesweeper or Firebase: the ranked value is a plain `score`, sorted in the
 * configured direction and displayed through an injected formatter, while all
 * storage I/O is delegated to an injected adapter (see adapters/).
 *
 * This is the COMBINED facade: it simply composes the two separable surfaces —
 * {@link LeaderBoardReader} (read/subscribe/render) and {@link LeaderBoardWriter}
 * (submit) — for consumers that want both in one object. Consumers who need only
 * one half import it directly and pull in nothing from the other:
 *
 *   import { LeaderBoardReader } from '@cozy-games/leaderboard/leaderboard-read.js'
 *   import { LeaderBoardWriter } from '@cozy-games/leaderboard/leaderboard-write.js'
 *
 * Public API is unchanged: `render()` (read) and `submit()` (write). The reader
 * and writer are also exposed as `.reader` / `.writer` for direct access. Reads
 * and writes may be wired to differently-privileged backend instances by passing
 * the surfaces different adapters (construct a Reader and Writer directly).
 *
 * An adapter implements:
 *   - getConfig(): Promise<Object|undefined>
 *   - listScores({ category, since, order, limit }): Promise<Object[]>   // read
 *   - addScore(category, entry): Promise<void>                            // write
 *   - archive(entry): Promise<void>   // optional personal history        // write
 */
export class LeaderBoardService {
    /**
     * @param {Object} options - see {@link LeaderBoardReader} and {@link LeaderBoardWriter} for the full set
     * @param {Object} options.adapter - storage backend (e.g. FirebaseAdapter, SupabaseAdapter)
     * @param {'asc'|'desc'} [options.scoreOrder]
     * @param {(value: number) => string} [options.formatScore]
     * @param {(entry: Object) => boolean} [options.qualifies]
     * @param {Object} [options.labels]
     * @param {Object} [options.tooltips]
     * @param {string[]} [options.emptyMessages]
     * @param {string} [options.loadingText]
     * @param {string} [options.errorText]
     * @param {string} [options.anonymousName]
     */
    constructor(options?: {
        adapter: any;
        scoreOrder?: "asc" | "desc";
        formatScore?: (value: number) => string;
        qualifies?: (entry: any) => boolean;
        labels?: any;
        tooltips?: any;
        emptyMessages?: string[];
        loadingText?: string;
        errorText?: string;
        anonymousName?: string;
    });
    adapter: any;
    reader: LeaderBoardReader;
    writer: LeaderBoardWriter;
    /**
     * Read surface — render the ranked list with a duration tab bar.
     * @see LeaderBoardReader#render
     */
    render(category: any, title: any, duration: any): Promise<HTMLDivElement>;
    /**
     * Write surface — submit a completed game (archive + ranked entry).
     * @see LeaderBoardWriter#submit
     */
    submit(entry: any): Promise<void>;
}
import { LeaderBoardReader } from './leaderboard-read.js';
import { LeaderBoardWriter } from './leaderboard-write.js';
