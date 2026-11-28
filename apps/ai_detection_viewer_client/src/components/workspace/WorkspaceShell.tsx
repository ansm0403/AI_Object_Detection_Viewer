import type { ReactNode } from 'react';

// Height of the timeline row on wide screens. Shared by the real Timeline and
// the loading skeleton so the panes above it do not move when data arrives.
export const TIMELINE_ROW_HEIGHT_CLASS = 'lg:h-[84px]';

type WorkspaceShellProps = {
  topBar: ReactNode;
  filterBar: ReactNode;
  /** Left column: object list. */
  list: ReactNode;
  /** Centre: the 3D view (main view, Immutable Rule #5). */
  main: ReactNode;
  /** Right column, top: the camera image + 2D boxes. */
  camera: ReactNode;
  /**
   * (F6) Right column, between the camera image and the details: the row of
   * camera thumbnails. Optional — a dataset with one camera (COCO) passes
   * nothing and the column is exactly as before. The row sizes itself (its
   * height follows the column width); the details panel takes what is left.
   */
  cameraStrip?: ReactNode;
  /** Right column, bottom: selected object + analytics. */
  details: ReactNode;
  /** Bottom row: frame timeline. */
  timeline: ReactNode;
  /**
   * (F7.5) Something laid OVER the list and the 3D view (wide screens: the
   * same grid cells, on top; narrow screens: above everything). The zones
   * underneath stay mounted — the 3D canvas is not re-created when this opens
   * or closes. Used for the evaluation report.
   */
  overlay?: ReactNode;
  /**
   * (F8) What the overlay is, for assistive technology and for tests
   * (`section[aria-label=…]`). Default "Report" (the evaluation report).
   */
  overlayLabel?: string;
  /**
   * (F8) How far the overlay reaches on wide screens:
   *  - `'list+main'` (default) — over the list AND the 3D view;
   *  - `'list'` — over the list only, so the 3D view next to it stays visible.
   */
  overlaySpan?: 'list+main' | 'list';
  /**
   * (F8) Give the list column and the 3D column the same width on wide screens
   * (instead of 240 / 272 px for the list). Used together with
   * `overlaySpan="list"`: the overlay then gets half of the room and the 3D
   * view the other half. Only the WIDTH of the 3D cell changes — it stays the
   * same grid item in the same place, so its canvas is resized, not re-created.
   */
  evenColumns?: boolean;
  /**
   * (F8) The list cell holds nothing right now (the box editor lies over it
   * and the list is not drawn). On the fixed layout the cell keeps its place;
   * on a narrow window, where the cells are stacked, an empty cell 60% of the
   * window tall would sit between the timeline and the panel with the
   * numbers — there it is left out.
   */
  listEmpty?: boolean;
  /**
   * Width / height of the camera cell. The shell sizes the cell; the viewer
   * inside only fills it. nuScenes photos are 16:9; COCO photos vary, so 4:3.
   */
  cameraAspect: number;
};

/**
 * The workspace frame (F3). It only defines WHERE each zone sits and how big it
 * is; it holds no state and computes nothing. Every zone's content is passed in.
 *
 * Wide screens (lg, ≥1024px): a fixed full-viewport grid. The page itself never
 * scrolls; only panels with overflowing content (list, details) scroll inside.
 *
 *   [ topBar                                  ]
 *   [ filterBar                               ]
 *   [ list | main (3D)          | camera      ]
 *   [      |                    | details     ]
 *   [ timeline                                ]
 *
 * Narrow screens: zones stack in one column and the page scrolls. The 3D view
 * comes first (Rule #5). `order-*` sets that stacking order; on wide screens
 * every zone is placed explicitly, so `order` has no effect there.
 *
 * Very short windows: the frame keeps a 640px minimum height, so the page
 * scrolls a little instead of squashing the panes.
 */
export function WorkspaceShell({
  topBar,
  filterBar,
  list,
  main,
  camera,
  cameraStrip,
  details,
  timeline,
  overlay,
  overlayLabel = 'Report',
  overlaySpan = 'list+main',
  evenColumns = false,
  listEmpty = false,
  cameraAspect,
}: WorkspaceShellProps) {
  // The overlay lies over the whole 3D cell (and not just over the list).
  const covered = Boolean(overlay) && overlaySpan === 'list+main';
  return (
    <div className="flex flex-col min-h-screen lg:h-screen lg:min-h-[640px]">
      {/* Wide: fixed bar heights so the grid below never shifts. Narrow: the
          bars may wrap onto two lines, so their height is left to the content. */}
      <div className="flex-none lg:h-11">{topBar}</div>
      <div className="flex-none lg:h-10">{filterBar}</div>

      <main
        className={[
          'flex flex-col gap-2 p-2',
          'lg:flex-1 lg:min-h-0 lg:grid lg:gap-2',
          // (F8) Whole class names in both branches: Tailwind only generates
          // classes it can read as complete strings in the source.
          evenColumns
            ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px] min-[1400px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_400px]'
            : 'lg:grid-cols-[240px_minmax(0,1fr)_360px] min-[1400px]:grid-cols-[272px_minmax(0,1fr)_400px]',
          'lg:grid-rows-[minmax(0,1fr)_auto]',
        ].join(' ')}
      >
        {/* Centre — the 3D view. Narrow: 4:3 box. Wide: fills the grid cell.
            (F8) `isolate`: the name tag of a selected 3D box is an HTML element
            that the 3D library gives a very large z-index. Without a stacking
            context of its own it showed THROUGH whatever was laid over this
            cell (the "car" tag floated on the top-view editor). Isolated, the
            tag is ordered inside this cell only. */}
        <section
          aria-label="3D view"
          className={[
            'isolate order-1 aspect-[4/3] lg:aspect-auto lg:col-start-2 lg:row-start-1 min-h-0 min-w-0',
            // (F8) While something is laid over this whole cell (wide screens),
            // the cell is not painted. It stays mounted and laid out — the
            // canvas is NOT re-created and keeps its size — but the browser
            // no longer has to composite a 3D picture nobody can see under
            // the overlay (measured in software GL: 41-43 fps with the editor
            // open over it, 60 with the cell hidden).
            covered ? 'lg:invisible' : '',
          ].join(' ')}
        >
          {main}
        </section>

        {/* Right column. Narrow: `contents` lets camera + details join the
            outer column so they can be ordered on their own. */}
        <div className="contents lg:flex lg:flex-col lg:gap-2 lg:col-start-3 lg:row-start-1 lg:min-h-0">
          {/* min-h-0 + overflow-hidden make the aspect ratio binding: without
              them a box with `aspect-ratio` grows to fit its content, and a
              portrait COCO photo stretched the cell to 400×600. */}
          <section
            aria-label="Camera image"
            className="order-2 flex-none min-h-0 overflow-hidden"
            style={{ aspectRatio: String(cameraAspect) }}
          >
            {camera}
          </section>
          {/* (F6) Same `order` as the camera image, so on narrow screens the
              thumbnails stay right under the photo they switch. */}
          {cameraStrip && (
            <section aria-label="Camera thumbnails" className="order-2 flex-none min-w-0">
              {cameraStrip}
            </section>
          )}
          <section
            aria-label="Details"
            className="order-5 lg:flex-1 lg:min-h-0"
          >
            {details}
          </section>
        </div>

        {/* Left column — object list. Narrow: capped height, scrolls inside. */}
        <section
          aria-label="Objects"
          className={`order-4 h-[60vh] lg:h-auto lg:col-start-1 lg:row-start-1 min-h-0 ${
            listEmpty ? 'hidden lg:block' : ''
          }`}
        >
          {list}
        </section>

        <section
          aria-label="Frames"
          className={`order-3 lg:col-span-3 lg:row-start-2 min-w-0 ${TIMELINE_ROW_HEIGHT_CLASS}`}
        >
          {timeline}
        </section>

        {/* (F7.5) Over the list and the 3D view. Later in the DOM and a higher
            z-index than the two cells it shares, so it covers them. */}
        {overlay && (
          <section
            aria-label={overlayLabel}
            className={[
              'order-first relative z-20 min-h-0 min-w-0 lg:order-none lg:col-start-1 lg:row-start-1',
              overlaySpan === 'list' ? 'lg:col-span-1' : 'lg:col-span-2',
            ].join(' ')}
          >
            {overlay}
          </section>
        )}
      </main>
    </div>
  );
}
