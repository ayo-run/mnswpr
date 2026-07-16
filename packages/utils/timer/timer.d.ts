export class TimerService {
    loggerService: LoggerService;
    time: number;
    rendered: any;
    initialize(el: any): void;
    display: any;
    startTime: number;
    start(): void;
    running: boolean;
    stop(): number;
    id: number;
    /**
     * Recompute the elapsed time and schedule the next frame.
     * Driven by requestAnimationFrame so it aligns with the browser's paint
     * cadence and pauses automatically when the tab is hidden — instead of the
     * old fixed 1ms interval that fired ~1000 times a second.
     */
    tick(): void;
    /**
     * Write to the DOM only when the visible value actually changes. The display
     * has 100ms (tenths-of-a-second) resolution, so most frames are a no-op and
     * cost no reflow.
     */
    render(): void;
    pretty(duration: any): string;
    clean(str: any, separator: any): string;
}
import { LoggerService } from '../logger/logger';
