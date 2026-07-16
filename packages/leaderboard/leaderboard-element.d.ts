/**
 * Configure the backend + defaults for all <cozy-leaderboard> elements. Call
 * once at startup, after building your adapter (Firebase/Supabase/…). User-facing
 * strings (labels, emptyMessages, loadingText, errorText, anonymousName) can be
 * passed here to localize without changing the package.
 * @param {Object} options - { adapter, scoreOrder?, format?, formatScore?, qualifies?, labels?, emptyMessages?, loadingText?, errorText?, anonymousName? }
 */
export function configureLeaderboard(options?: any): void;
export class CozyLeaderboard extends WebComponent {
    static props: {
        category: string;
        title: string;
        duration: string;
        scoreOrder: string;
        format: string;
    };
    _view: {
        board: boolean;
    };
    _activeDuration: any;
    _connected: boolean;
    _token: number;
    /**
     * WCB change hook — `property` is the camelCase prop name (WCB ≥5). A title
     * change needs no re-query: the heading reads `this.props.title`, so the base
     * class's own render already updated it. score-order/format changes rebuild
     * the service so the new config actually takes effect.
     */
    onChanges({ property }: {
        property: any;
    }): void;
    _svc: LeaderBoardService;
    _service(): LeaderBoardService;
    /**
     * (Re)mount the board. The first mount honors the author's `duration`
     * attribute; later mounts keep the selected duration (so switching category
     * keeps the selected tab) unless a duration is passed explicitly.
     */
    _mount(durationArg: any): void;
    _selectTab(id: any): void;
    /**
     * Query one duration window and project the result into view state: a
     * loading message immediately, then rows / a random empty message / the
     * error text. The token guards against a stale response (quick tab or
     * category switches) overwriting a newer one.
     */
    _load(service: any, durationId: any): Promise<void>;
    /**
     * Render the current view state through WCB. WCB's render() replaces the
     * whole subtree (no diffing yet), which would drop focus from a clicked
     * duration tab — the one behavior the base class can't preserve for us — so
     * focus is handed to the replacement tab explicitly.
     */
    _paint(): void;
    /**
     * Submit a finished game through this element's service — keeps score
     * submission a one-liner from the host app.
     * @param {Object} entry
     */
    submit(entry: any): Promise<void>;
}
import { WebComponent } from 'web-component-base';
import { LeaderBoardService } from './leader-board.js';
