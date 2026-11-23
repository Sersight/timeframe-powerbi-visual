/*
 * Short, one-shot animations that answer a user action (never Power BI's own updates).
 *
 * The visual rebuilds its DOM on every render, and Power BI calls `update()` again a
 * moment after each filter is applied. A plain CSS animation would therefore restart or
 * be cut off by that second render. Instead, the running animation is remembered with
 * its start time and, on each render, the root gets the matching `drs-anim-*` classes
 * plus a negative `animation-delay` (`--drs-anim-delay`) equal to the time already
 * elapsed: freshly built elements pick the animation up exactly where it was.
 *
 * Because only user actions start animations, exports and subscriptions (which render
 * without interaction) always capture the final state. The stylesheet also skips them
 * all when the reader's system asks for reduced motion.
 */
import { DateRange } from "./dateRange";

/**
 * - month: the calendar slides to the previous/next month.
 * - fill: the range band sweeps from the start day to the end day.
 * - dates: the start/end dates that changed slide in, briefly in the accent colour.
 * - landing: the product landing page builds up piece by piece.
 * - menu: the quick-periods menu opens with its entries rising in turn.
 * - bolt-fill / bolt-empty: the ⚡ fills up when the default period comes back and
 *   drains when the user moves away from it.
 */
export type MotionKind = "month" | "fill" | "dates" | "landing" | "bolt-fill" | "bolt-empty" | "menu";

const KINDS: MotionKind[] = ["month", "fill", "dates", "landing", "bolt-fill", "bolt-empty", "menu"];

/**
 * Longest time each animation can take, staggered delays included (ms). Past this the
 * classes are dropped, so later renders (resize, data refresh) never replay it.
 */
const DURATION_MS: Record<MotionKind, number> = {
    month: 300,
    fill: 600,
    dates: 450,
    landing: 1400,
    "bolt-fill": 650,
    "bolt-empty": 500,
    menu: 600,
};

/** Options for {@link Motion.start}. */
export interface MotionOptions {
    /** Direction of travel: -1 backwards (left), 1 forwards (right), 0 none (fade up). */
    dir?: number;
    /** Range shown before the action, to tell which dates actually changed. */
    previous?: DateRange | null;
}

/**
 * Tracks the animation started by the last user action.
 */
export class Motion {
    private readonly running = new Set<MotionKind>();
    private since = 0;
    private dir = 0;
    private before: DateRange | null = null;

    /**
     * Starts animations, replacing whatever was still running.
     * @param kinds Animations to play.
     * @param options Direction and the range shown before the action.
     */
    start(kinds: MotionKind[], { dir = 0, previous = null }: MotionOptions = {}): void {
        this.running.clear();
        kinds.forEach(kind => this.running.add(kind));
        this.since = performance.now();
        this.dir = Math.sign(dir);
        this.before = previous;
    }

    /**
     * Applies the running animations to the root before it is (re)built: classes on,
     * finished ones off, and the delay/direction variables the stylesheet reads.
     * @param root The visual's (or dialog's) root element.
     */
    apply(root: HTMLElement): void {
        const elapsed = performance.now() - this.since;
        for (const kind of KINDS) {
            if (this.running.has(kind) && elapsed >= DURATION_MS[kind]) {
                this.running.delete(kind);
            }
            root.classList.toggle(`drs-anim-${kind}`, this.running.has(kind));
        }
        root.style.setProperty("--drs-anim-delay", `${-Math.round(elapsed)}ms`);
        // Horizontal travel for ‹ › actions; other changes rise slightly instead.
        root.style.setProperty("--drs-anim-x", String(this.dir));
        root.style.setProperty("--drs-anim-y", this.dir === 0 ? "1" : "0");
    }

    /**
     * Whether an animation is still running (valid after {@link apply}).
     * @param kind Animation to check.
     */
    has(kind: MotionKind): boolean {
        return this.running.has(kind);
    }

    /** Range shown before the action that started the current animation. */
    get previous(): DateRange | null {
        return this.before;
    }
}
