import type { Rect } from "./ui";

// The station on a touch screen: the hex grid on the left at full height, and a tabbed panel on the right.
const MARGIN = 8;
const MIN_PANEL_WIDTH = 300; // five tabs wide enough for their labels
const MAX_HEX_SIZE = 36;
const STATUS_HEIGHT = 28;
const TAB_HEIGHT = 34;
const LAUNCH_HEIGHT = 38;
const GAP = 4;
const MUTE_SIZE = 28;
const END_RUN_WIDTH = 48;

// A radius-5 hex grid of pointy-top hexes is 17 sizes tall and 19 wide.
const GRID_HEIGHT_IN_SIZES = 17;
const GRID_WIDTH_IN_SIZES = 19;

export const STATION_TABS = ["parts", "ship", "supplies", "trip", "cargo"] as const;
export type StationTab = (typeof STATION_TABS)[number];

export type TouchStationLayout = {
  hexSize: number;
  grid: Rect;
  panel: Rect;
  status: Rect; // docked at, day and money
  mute: Rect; // at the right end of the status line
  endRun: Rect; // just left of the mute button
  tabs: Rect[]; // in STATION_TABS order
  body: Rect; // the chosen tab's content
  launch: Rect;
};

export function touchStationLayout(width: number, height: number): TouchStationLayout {
  const hexSize = Math.min(
    MAX_HEX_SIZE,
    (height - 2 * MARGIN) / GRID_HEIGHT_IN_SIZES,
    (width - 3 * MARGIN - MIN_PANEL_WIDTH) / GRID_WIDTH_IN_SIZES,
  );
  const grid = { x: MARGIN, y: MARGIN, w: hexSize * GRID_WIDTH_IN_SIZES, h: height - 2 * MARGIN };

  const panelX = grid.x + grid.w + MARGIN;
  const panel = { x: panelX, y: MARGIN, w: width - panelX - MARGIN, h: height - 2 * MARGIN };
  const mute = { x: panel.x + panel.w - MUTE_SIZE, y: panel.y, w: MUTE_SIZE, h: MUTE_SIZE };
  const endRun = { x: mute.x - MARGIN - END_RUN_WIDTH, y: panel.y, w: END_RUN_WIDTH, h: MUTE_SIZE };
  const status = { x: panel.x, y: panel.y, w: endRun.x - MARGIN - panel.x, h: STATUS_HEIGHT };

  const tabsY = status.y + status.h + GAP;
  const tabWidth = panel.w / STATION_TABS.length;
  const tabs = STATION_TABS.map((_, i) => ({ x: panel.x + i * tabWidth, y: tabsY, w: tabWidth, h: TAB_HEIGHT }));

  const launch = { x: panel.x, y: panel.y + panel.h - LAUNCH_HEIGHT, w: panel.w, h: LAUNCH_HEIGHT };
  const bodyY = tabsY + TAB_HEIGHT + GAP;
  const body = { x: panel.x, y: bodyY, w: panel.w, h: launch.y - GAP - bodyY };

  return { hexSize, grid, panel, status, mute, endRun, tabs, body, launch };
}
