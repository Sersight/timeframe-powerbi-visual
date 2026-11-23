/*
 * Tiny DOM helpers. The visual builds its markup with createElement/textContent only:
 * innerHTML is forbidden by the Power BI certification lint rules (XSS surface).
 */

/**
 * Creates an element with a class and optional text.
 * @param tag Tag name.
 * @param className Space-separated classes.
 * @param text Optional text content (set via textContent, never parsed as HTML).
 */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) {
        element.textContent = text;
    }
    return element;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** A stroke with its own width (a zero-length stroke with a wide round cap draws a dot). */
interface IconStroke {
    d: string;
    width?: number;
}

// Stroke icons on a 16x16 grid. A string is a single path at the default stroke width.
const ICONS: Record<string, string | IconStroke[]> = {
    left: "M10 3.5 5.5 8l4.5 4.5",
    right: "M6 3.5 10.5 8 6 12.5",
    down: "M3.5 6 8 10.5 12.5 6",
    calendar: "M4 3h8a1.5 1.5 0 0 1 1.5 1.5v7.5a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 12V4.5A1.5 1.5 0 0 1 4 3zM2.5 6.5h11M5.5 1.5v3M10.5 1.5v3",
    check: "M3.5 8.5 6.5 11.5 12.5 4.5",
    close: "M4.5 4.5l7 7M11.5 4.5l-7 7",
    // Lightning bolt: "quick" periods.
    quick: "M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z",
    // Language-neutral "start" and "end" markers (●━ and ━●), echoing the range band
    // drawn in the calendar, so the From/To rows need no translated labels.
    rangeStart: [{ d: "M3.5 8h0", width: 5 }, { d: "M6.5 8h7" }],
    rangeEnd: [{ d: "M2.5 8h7" }, { d: "M12.5 8h0", width: 5 }],
};

export type IconName = "left" | "right" | "down" | "calendar" | "check" | "close" | "quick" | "rangeStart" | "rangeEnd";

/**
 * Inline SVG icon (stroke uses currentColor so it follows the theme).
 * @param name Icon name.
 */
export function icon(name: IconName): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("drs-icon");
    const definition = ICONS[name];
    const strokes = typeof definition === "string" ? [{ d: definition }] : definition;
    for (const stroke of strokes) {
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("d", stroke.d);
        if (stroke.width) {
            // Presentation attribute on the path wins over the width inherited from CSS.
            path.setAttribute("stroke-width", String(stroke.width));
        }
        svg.append(path);
    }
    return svg;
}

/**
 * Icon-only button with an accessible label (also shown as tooltip).
 * @param name Icon name.
 * @param label Accessible name.
 * @param onClick Click handler.
 */
export function iconButton(name: IconName, label: string, onClick: () => void): HTMLButtonElement {
    const button = el("button", "drs-icon-button");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.append(icon(name));
    button.addEventListener("click", onClick);
    return button;
}

/**
 * From this radius (px) small round things (day numbers, menu entries, arrow buttons)
 * become fully round; below it they share the boxes' radius, so a square report
 * (0 px) has no stray circles.
 */
const PILL_FROM_RADIUS = 6;

/**
 * Applies the format pane's corner radius through the stylesheet's variables.
 * @param element Root of the visual or of the dialog.
 * @param radius Radius in px (clamped to 0 or more).
 */
export function applyCornerRadius(element: HTMLElement, radius: number): void {
    const px = Math.max(0, Number.isFinite(radius) ? radius : 0);
    element.style.setProperty("--drs-radius", `${px}px`);
    element.style.setProperty("--drs-pill", px >= PILL_FROM_RADIUS ? "999px" : `${px}px`);
}
