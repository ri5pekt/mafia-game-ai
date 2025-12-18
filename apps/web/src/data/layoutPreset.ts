export type Coord = { top: string; left: string };
export type CoordMap = Record<string, Coord>;

export type LayoutPresetV1 = {
  version: 1;
  units: "percent";
  avatarPositions: CoordMap;
  tagPositions: CoordMap;
};

// Captured via the in-app drag editor (Edit Layout -> Copy Coords).
export const DEFAULT_LAYOUT_PRESET: LayoutPresetV1 = {
  version: 1,
  units: "percent",
  avatarPositions: {
    p1: { top: "82.6448255964654%", left: "30.039613306133415%" },
    host: { top: "84.88491979514961%", left: "49.90909090909091%" },
    p10: { top: "81.29044289870437%", left: "70.7785685120484%" },
    p9: { top: "70.52610993623529%", left: "85.84307178630786%" },
    p2: { top: "70.79698647578752%", left: "14.156928213692154%" },
    p3: { top: "45.810980573600105%", left: "8.468213673477095%" },
    p4: { top: "25.927921728735793%", left: "19.59915594334048%" },
    p5: { top: "15.164526239962342%", left: "38.76757511256696%" },
    p6: { top: "14.893649700410133%", left: "58.777879432887566%" },
    p7: { top: "23.083718063437598%", left: "78.03720769302312%" },
    p8: { top: "45.40466576427178%", left: "88.80451359925017%" }
  },
  tagPositions: {
    p1: { top: "77.22729480542125%", left: "32.948704215224325%" },
    p10: { top: "76.68554172631684%", left: "66.77856851204838%" },
    p9: { top: "67.68190627093713%", left: "79.11579905903514%" },
    p2: { top: "69.03628896869816%", left: "20.611473668237608%" },
    p3: { top: "55.15622118815126%", left: "17.83185003711346%" },
    p4: { top: "44.07664987873368%", left: "27.32642867061321%" },
    p5: { top: "39.00166172055658%", left: "41.76757511256696%" },
    p6: { top: "39.13709999033268%", left: "58.141515796523926%" },
    p7: { top: "46.108223925375206%", left: "71.49175314756859%" },
    p8: { top: "54.20815329971852%", left: "79.98633178106836%" }
  }
};


