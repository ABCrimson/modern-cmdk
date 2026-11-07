// The palette's data contract (design-final.md C4). PaletteDemo.vue renders PaletteEntry rows; the
// home hero feeds it HERO_ITEMS and the 404 finder feeds it the site's page list.

/** The kind shown right-aligned on a row. */
export type PaletteKind = 'Guide' | 'API' | 'Example' | 'Recipe' | 'Action' | 'Page';

export interface PaletteEntry {
  /** Unique within one palette. */
  readonly id: string;
  readonly label: string;
  /** Group heading text; rows with the same text share one heading. */
  readonly group: string;
  readonly kind: PaletteKind;
  /** Site path without base or extension ('/guide/frecency') or an absolute https URL. */
  readonly href?: string;
  readonly keywords?: readonly string[];
  /** A core shortcut string such as 'Alt+Shift+C'; runs only while focus is inside the panel. */
  readonly shortcut?: string;
  readonly action?: 'copy-install' | 'toggle-dark';
}

/** A plain link rendered as <a href> before the engine loads (server render and no-JS). */
export interface PaletteLink {
  /** Visible link text. */
  readonly text: string;
  /** Site path without base or extension, or an absolute https URL; usePageHref() resolves it. */
  readonly href: string;
  readonly kind: PaletteKind;
}
