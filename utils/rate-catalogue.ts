import { DEFAULT_AWNING_RATES, GLAZING_ORDER } from '@utils/awning-costing-rates';
import { defaultPricingData } from '@utils/glass-rates';
import { AWNING_GLASS_FROM_LIST, AWNING_RATES_FROM_OTHER_LISTS, WINDOW_GLASS_FROM_LIST } from '@utils/shared-rates';
import { DEFAULT_WINDOW_RATES } from '@utils/window-costing-rates';

export type RateKind = 'money' | 'percent' | 'minutes' | 'quantity' | 'factor';
export type RateTone = 'error' | 'warning';
export type BlankRule = 'fine' | 'gap' | 'block';
export type ZeroRule = 'fine' | 'warn' | 'block';

export interface SharedRate {
  list: string;
  href: string;
}

export interface RateEntry {
  path: string;
  section: string;
  group: string;
  groupKey: string;
  label: string;
  unit: string;
  kind: RateKind;
  blank: BlankRule;
  zero: ZeroRule;
  shared?: SharedRate;
  cell?: { row: string; column: string };
}

export interface RateSection {
  key: string;
  title: string;
  note: string;
  grid?: { corner: string; columns: string[] };
}

export interface RateCatalogue {
  name: string;
  sections: RateSection[];
  entries: RateEntry[];
}

export interface RateIssue {
  path: string;
  label: string;
  tone: RateTone;
  badge: string;
  message: string;
}

const GLASS_LIST: SharedRate = { list: 'the glass price list', href: '/settings' };
const WINDOW_LIST: SharedRate = { list: 'the window rates', href: '/settings/windows' };
const OWNING_LIST: Record<'glass' | 'window', SharedRate> = { glass: GLASS_LIST, window: WINDOW_LIST };

export function rateAt(document: unknown, path: string): number | null {
  let node: unknown = document;
  for (const segment of path.split('.')) {
    if (node == null || typeof node !== 'object') {
      return null;
    }
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'number' ? node : null;
}

export function withRate<T>(document: T, path: string, value: number | null): T {
  const next = structuredClone(document);
  const segments = path.split('.');
  let node = next as unknown as Record<string, unknown>;
  for (const segment of segments.slice(0, -1)) {
    if (node[segment] == null || typeof node[segment] !== 'object') {
      node[segment] = {};
    }
    node = node[segment] as Record<string, unknown>;
  }
  node[segments[segments.length - 1]] = value;
  return next;
}

export function rateEntry(catalogue: RateCatalogue, path: string): RateEntry {
  const entry = catalogue.entries.find((candidate) => candidate.path === path);
  if (!entry) {
    throw new Error(`No ${catalogue.name} rate at ${path}.`);
  }
  return entry;
}

export function parseRate(entry: RateEntry, text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') {
    return null;
  }
  const typed = Number(trimmed);
  if (!Number.isFinite(typed)) {
    return undefined;
  }
  return entry.kind === 'percent' ? Number((typed / 100).toFixed(6)) : typed;
}

export function formatRate(entry: RateEntry, value: number | null): string {
  if (value == null) {
    return '';
  }
  return String(entry.kind === 'percent' ? Number((value * 100).toFixed(4)) : value);
}

export function findRates(catalogue: RateCatalogue, query: string): RateEntry[] {
  const wanted = query.trim().toLowerCase();
  if (!wanted) {
    return catalogue.entries;
  }
  const titles = new Map(catalogue.sections.map((section) => [section.key, section.title]));
  return catalogue.entries.filter((entry) => `${titles.get(entry.section)} ${entry.group} ${entry.label} ${entry.path}`.toLowerCase().includes(wanted));
}

export function checkRate(entry: RateEntry, value: number | null): RateIssue | null {
  const issue = (tone: RateTone, badge: string, message: string): RateIssue => ({
    path: entry.path,
    label: entry.group ? `${entry.group} / ${entry.label}` : entry.label,
    tone,
    badge,
    message: entry.shared && tone === 'error' ? `${message} Set it in ${entry.shared.list}.` : message,
  });

  if (value == null) {
    if (entry.blank === 'block') {
      return issue('error', 'blank', 'Blank. A costing would read it as zero.');
    }
    return entry.blank === 'gap' ? issue('warning', 'not priced', 'Not priced; charged as nil.') : null;
  }
  if (value < 0) {
    return issue('error', 'below zero', 'Below zero.');
  }
  if (entry.kind === 'percent' && value > 1) {
    return issue('warning', 'over 100%', 'Above 100 percent. Check it is meant.');
  }
  if (value === 0 && entry.zero === 'block') {
    return issue('error', 'zero', 'Zero. Every costing that uses it comes out short.');
  }
  if (value === 0 && entry.zero === 'warn') {
    return issue('warning', 'free of charge', 'Zero = supplied free. Blank = not priced.');
  }
  return null;
}

export function listIssues(catalogue: RateCatalogue, document: unknown): RateIssue[] {
  return catalogue.entries.map((entry) => checkRate(entry, rateAt(document, entry.path))).filter((issue): issue is RateIssue => issue !== null);
}

export function blockingIssues(issues: RateIssue[]): RateIssue[] {
  return issues.filter((issue) => issue.tone === 'error');
}

export interface SectionSummary {
  key: string;
  title: string;
  rates: number;
  toFix: number;
  toCheck: number;
}

export function summariseSections(catalogue: RateCatalogue, document: unknown): SectionSummary[] {
  const tones = new Map(listIssues(catalogue, document).map((issue) => [issue.path, issue.tone]));

  return catalogue.sections
    .map((section) => {
      const entries = catalogue.entries.filter((entry) => entry.section === section.key);
      return {
        key: section.key,
        title: section.title,
        rates: entries.length,
        toFix: entries.filter((entry) => tones.get(entry.path) === 'error').length,
        toCheck: entries.filter((entry) => tones.get(entry.path) === 'warning').length,
      };
    })
    .filter((line) => line.rates > 0);
}

export function keepBrokenSectionsOpen(opened: Record<string, boolean>, summary: SectionSummary[]): Record<string, boolean> {
  const broken = summary.filter((line) => line.toFix > 0 && !opened[line.key]);
  return broken.length ? { ...opened, ...Object.fromEntries(broken.map((line) => [line.key, true])) } : opened;
}

export interface SharedLine extends SharedRate {
  count: number;
}

export function sharedByList(entries: RateEntry[]): SharedLine[] {
  const lines = new Map<string, SharedLine>();
  for (const entry of entries) {
    if (entry.shared) {
      const line = lines.get(entry.shared.href) ?? { ...entry.shared, count: 0 };
      lines.set(entry.shared.href, { ...line, count: line.count + 1 });
    }
  }
  return Array.from(lines.values());
}

const GLASS_OTHER: Array<{ key: keyof typeof defaultPricingData.otherPrices; group: string; label: string; unit: string; kind: RateKind }> = [
  { key: 'holePrice4to6', group: 'Holes', label: '4-6 mm', unit: '$ per hole', kind: 'money' },
  { key: 'holePrice8to12', group: 'Holes', label: '8-12 mm', unit: '$ per hole', kind: 'money' },
  { key: 'shapeSimple4to6', group: 'Shape complexity', label: 'Simple shape, 4-6 mm', unit: '$ per piece', kind: 'money' },
  { key: 'shapeSimple8to12', group: 'Shape complexity', label: 'Simple shape, 8-12 mm', unit: '$ per piece', kind: 'money' },
  { key: 'shapeComplex4to6', group: 'Shape complexity', label: 'Complex shape, 4-6 mm', unit: '$ per piece', kind: 'money' },
  { key: 'shapeComplex8to12', group: 'Shape complexity', label: 'Complex shape, 8-12 mm', unit: '$ per piece', kind: 'money' },
  { key: 'ceramicBanding', group: 'Additional services', label: 'Ceramic banding', unit: '$ per piece', kind: 'money' },
  { key: 'scanning', group: 'Additional services', label: 'Scanning service', unit: '$ per piece', kind: 'money' },
  { key: 'minCharge', group: 'Minimum charge', label: 'Minimum charge per piece', unit: '$ per piece', kind: 'money' },
  { key: 'minAreaSqm', group: 'Minimum charge', label: 'Minimum area charged', unit: 'm²', kind: 'quantity' },
];

const GLASS_THICKNESSES = Array.from(new Set(Object.values(defaultPricingData.basePrices).flatMap((prices) => Object.keys(prices)))).sort((a, b) => Number(a) - Number(b));
const EDGEWORK_RANGES = Array.from(new Set(Object.values(defaultPricingData.edgeworkPrices).flatMap((prices) => Object.keys(prices))));

export const GLASS_RATE_CATALOGUE: RateCatalogue = {
  name: 'glass',
  sections: [
    { key: 'basePrices', title: 'BASE GLASS PRICES', note: 'Price per m² by glass type and thickness.', grid: { corner: 'GLASS TYPE', columns: GLASS_THICKNESSES } },
    { key: 'edgeworkPrices', title: 'EDGEWORK PRICES', note: 'Price per metre of edge by thickness range.', grid: { corner: 'EDGEWORK TYPE', columns: EDGEWORK_RANGES } },
    { key: 'otherPrices', title: 'OTHER PRICING', note: 'Zero on a minimum means no minimum: exact area is charged.' },
  ],
  entries: [
    ...Object.entries(defaultPricingData.basePrices).flatMap(([type, prices]) =>
      Object.keys(prices).map(
        (mm): RateEntry => ({
          path: `basePrices.${type}.${mm}`,
          section: 'basePrices',
          group: '',
          groupKey: '',
          label: `${type} ${mm} mm`,
          unit: '$ per m²',
          kind: 'money',
          blank: 'block',
          zero: 'block',
          cell: { row: type, column: mm },
        })
      )
    ),
    ...Object.keys(defaultPricingData.edgeworkPrices).flatMap((type) =>
      EDGEWORK_RANGES.map(
        (range): RateEntry => ({
          path: `edgeworkPrices.${type}.${range}`,
          section: 'edgeworkPrices',
          group: '',
          groupKey: '',
          label: `${type} ${range} mm`,
          unit: '$ per m',
          kind: 'money',
          blank: 'block',
          zero: 'fine',
          cell: { row: type, column: range },
        })
      )
    ),
    ...GLASS_OTHER.map(
      (rate): RateEntry => ({
        path: `otherPrices.${rate.key}`,
        section: 'otherPrices',
        group: rate.group,
        groupKey: rate.group,
        label: rate.label,
        unit: rate.unit,
        kind: rate.kind,
        blank: 'block',
        zero: 'fine',
      })
    ),
  ],
};

const AWNING_SPINE = new Set(['labour.perHour', 'labour.eachMinutes', 'marginRate', 'quantities.anchorPlateM', 'quantities.fixingSets']);

const AWNING_RATES: Array<{ path: string; section: string; label: string; unit: string; kind: RateKind }> = [
  { path: 'parts.frame', section: 'parts', label: 'AFB035 frame', unit: '$ per m', kind: 'money' },
  { path: 'parts.anchorPlate', section: 'parts', label: 'Anchor plate', unit: '$ per m', kind: 'money' },
  { path: 'parts.rubberSeal', section: 'parts', label: 'Silicone rubber seal', unit: '$ per m', kind: 'money' },
  { path: 'parts.trackInfill', section: 'parts', label: 'T81 track infill', unit: '$ per m', kind: 'money' },
  { path: 'parts.winder', section: 'parts', label: 'Window winder', unit: '$ each', kind: 'money' },
  { path: 'parts.hinges', section: 'parts', label: 'Heavy duty hinges', unit: '$ per pair', kind: 'money' },
  { path: 'parts.winderMountPlate', section: 'parts', label: 'Winder mount plate', unit: '$ each', kind: 'money' },
  { path: 'parts.glassWinderPlate', section: 'parts', label: 'Glass winder plate', unit: '$ each', kind: 'money' },
  { path: 'parts.fixingSet', section: 'parts', label: 'M5 screw and lock nut', unit: '$ per set', kind: 'money' },
  { path: 'parts.sealant', section: 'parts', label: 'Sealant', unit: '$ each', kind: 'money' },
  { path: 'parts.flyscreen', section: 'parts', label: 'Flyscreen and clips', unit: '$ each', kind: 'money' },
  { path: 'quantities.anchorPlateM', section: 'quantities', label: 'Anchor plate per awning', unit: 'm', kind: 'quantity' },
  { path: 'quantities.fixingSets', section: 'quantities', label: 'Fixing sets per awning', unit: 'sets', kind: 'quantity' },
  { path: 'labour.setupMinutes', section: 'labour', label: 'Setup, shared across the run', unit: 'minutes', kind: 'minutes' },
  { path: 'labour.eachMinutes', section: 'labour', label: 'Per awning', unit: 'minutes', kind: 'minutes' },
  { path: 'labour.perHour', section: 'labour', label: 'Labour rate', unit: '$ per hour', kind: 'money' },
  ...GLAZING_ORDER.map((id) => ({ path: `glass.options.${id}.list`, section: 'glass', label: DEFAULT_AWNING_RATES.glass.options[id].label, unit: '$ per m²', kind: 'money' as const })),
  { path: 'glass.bandingSet', section: 'glass', label: 'Ceramic banding', unit: '$ per awning', kind: 'money' },
  { path: 'glass.flatPolishPerM', section: 'glass', label: 'Flat polish', unit: '$ per m', kind: 'money' },
  { path: 'marginRate', section: 'marginRate', label: 'Margin on cost', unit: '%', kind: 'percent' },
];

function awningOwner(path: string): SharedRate | undefined {
  const option = path.startsWith('glass.options.') ? path.split('.')[2] : '';
  if (option in AWNING_GLASS_FROM_LIST) {
    return GLASS_LIST;
  }
  const owner = AWNING_RATES_FROM_OTHER_LISTS[path];
  return owner ? OWNING_LIST[owner] : undefined;
}

export const AWNING_RATE_CATALOGUE: RateCatalogue = {
  name: 'awning',
  sections: [
    { key: 'parts', title: 'PARTS', note: 'Parts list prices. The sheet’s 10% loading is included.' },
    { key: 'quantities', title: 'FIXED QUANTITIES', note: 'Fixed per awning, not derived from size.' },
    { key: 'labour', title: 'LABOUR', note: 'Setup is divided across the run.' },
    { key: 'glass', title: 'GLASS', note: 'The sheet priced Super Grey toughened only. Blank glass is reported as not priced.' },
    { key: 'marginRate', title: 'MARGIN', note: 'Markup on cost: 40 prices at cost × 1.4.' },
  ],
  entries: AWNING_RATES.map((rate) => ({
    ...rate,
    group: '',
    groupKey: '',
    blank: AWNING_SPINE.has(rate.path) ? 'block' : 'gap',
    zero: AWNING_SPINE.has(rate.path) ? 'block' : 'fine',
    shared: awningOwner(rate.path),
  })),
};

const WINDOW_SECTIONS: RateSection[] = [
  { key: 'labourPerHour', title: 'LABOUR RATE', note: '' },
  { key: 'suppliers', title: 'ALUMINIUM SUPPLIERS', note: '' },
  { key: 'extrusions', title: 'EXTRUSIONS', note: 'Price per metre = kg per metre x supplier $ per kg x (1 + loading) x (1 + offcut). Bar stock is priced per bar.' },
  { key: 'anodising', title: 'ANODISING & POWDER COAT', note: 'Price per metre = etch $ per square metre x the section factor. The minimum charge applies per window.' },
  { key: 'perMetre', title: 'MATERIALS BY THE METRE', note: '' },
  { key: 'each', title: 'FIXINGS & FITTINGS', note: '' },
  { key: 'glass', title: 'GLAZING', note: 'A loaded price carries the glass loading (20%, or 15% under Marine Window Service). Blank means not priced.' },
  { key: 'packingPerSqm', title: 'PACKING', note: '' },
  { key: 'labour', title: 'LABOUR MINUTES', note: 'Minutes per window: setup is divided by the batch quantity, then per each, then the area factor times the glass area.' },
  { key: 'margins', title: 'MARGIN & UPLIFT', note: 'Percent of cost.' },
];

const WINDOW_TERMS: Record<string, string> = {
  labourPerHour: 'Labour rate',
  packingPerSqm: 'Packing',
  capral: 'Capral',
  james: 'G. James',
  perKg: 'Price per kg',
  loading: 'Loading',
  loadingMws: 'Loading, Marine Window Service',
  hollowSurcharge: 'Hollow section surcharge',
  kgPerM: 'Weight',
  offcut: 'Offcut allowance',
  barPrice: 'Bar price',
  barLength: 'Bar length',
  flat40x3: 'Flat 40 x 3',
  flat80x3: 'Flat 80 x 3',
  tSection25: 'T section 25',
  bar40x10: 'Bar 40 x 10',
  bar25x12: 'Bar 25 x 12',
  L25x3: 'L 25 x 3',
  etchPerSqm: 'Etch anodising',
  etchMin: 'Etch minimum charge',
  powderPerM: 'Powder coat',
  factor: 'Section factor',
  trimEtch: 'Trim etch',
  caravan1146: 'Glazing rubber 1146',
  rubber1206: 'Glazing rubber 1206',
  infill1249: 'Infill rubber 1249',
  foamTape4708: 'Foam tape 11 x 6 (4708)',
  puTrack2209: 'Flock rubber 2209/2',
  glazing1256: 'Glazing rubber 1256',
  puTrack2339: 'PU track 2339',
  foamK30: 'Foam sealant K30',
  sealantHopper: 'Hopper sealant',
  wedgeA174: 'Wedge A174',
  channelC5: 'Glazing plastic C5',
  trackInfillMP024: 'Track infill MP024',
  screwCover163: 'Infill plastic 163',
  trackT81: 'Track T81',
  clipSchlegal: 'Clip channel (Schlegal)',
  screwCoverP364: 'Screw cover P364',
  infillW115: 'Infill W115',
  sikaflex: 'Sikaflex sealant',
  wipeBlack: 'Wipe bars, black',
  wipeDouble: 'Wipe bars, double',
  wipe1000: 'Wipe bars 1000',
  felt: 'Felt',
  sTapper: 'S tapper',
  mThread: 'M thread fixing',
  nyloc: '5/32 nyloc nut',
  lockComb: 'Comb lock',
  lockPlunger: 'Plunger lock',
  hingeNylon: 'Nylon pivot hinge',
  hingeOffset: 'Offset hinges, pair',
  staysFlat: 'Stays, flat',
  staysMed: 'Stays, medium',
  staysHeavy: 'Stays, heavy',
  hingeStainless: 'Stainless steel hinge',
  strutGas: 'Gas strut',
  strutManual: 'Manual strut',
  handleVitus: 'Vitus handle',
  staysRestrictor: 'Restrictor stays',
  sboltWoodstock: 'Woodstock S/bolts and keepers, set',
  sboltParkes: 'Parkes S/bolts, set',
  keeperSaddle: 'Keeper (saddle)',
  mullionFit1000: 'Mullion fitting 1000',
  mullionFitRivi: 'Mullion fitting Rivi',
  'ap5-6': 'Processing, 5-6 mm A/P',
  'ap8-12': 'Processing, 8-12 mm A/P',
  laminate: 'Processing, laminate',
  acrylic: 'Processing, acrylic and polycarb',
  shape: 'Shaping',
  holes: 'Holes',
  cview: 'C/View holes',
  flatSmooth: 'Flat smooth edge',
  flatGround: 'Flat ground edge',
  develop: 'Develop',
  window: 'Window',
  trim: 'Trim',
  weld: 'Weld',
  weldSimple: 'Weld',
  mullion: 'Mullion',
  reo: 'Reinforcement',
  mullionBar: 'Mullion bar',
  transom: 'Transom',
  sillFlat: 'Flat sill',
  wipeSingle: 'Single wipe',
  hingeEach: 'Per hinge',
  boltSetEach: 'Per bolt set',
  noStaysCredit: 'Credit with no stays',
  staysEach: 'Per stay',
  square: 'square',
  offSquare: 'off square',
  round: 'round',
  setup: 'setup',
  each: 'each',
  perSqm: 'per sqm of glass',
  areaK: 'area factor',
  fixedQty: 'setup shared across',
  offSquareExtra: 'extra when shaped',
  extraOverOne: 'extra when more than one',
  margin: 'Margin',
  marginMws: 'Margin, Marine Window Service',
  uplift: 'Uplift',
};

const WINDOW_PERCENT = /^suppliers\.[^.]+\.loading$|^extrusions\.[^.]+\.offcut$|^glass\.loading(Mws)?$|^margins\.[^.]+\.(margin|marginMws|uplift)$/;
const WINDOW_SPINE = /^labourPerHour$|^suppliers\.[^.]+\.perKg$|^glass\.options\.[^.]+\.list$|^anodising\.etchPerSqm$/;
const WINDOW_DIVISOR = /\.barLength$|\.fixedQty$/;
const WINDOW_BLANK_IS_NORMAL = /\.marginMws$|^glass\.processing\.(?!laminate\.)[^.]+\.flatGround$/;

function term(key: string): string {
  return WINDOW_TERMS[key] ?? key;
}

function windowUnit(segments: string[]): { unit: string; kind: RateKind } {
  const [section, second] = segments;
  const leaf = segments[segments.length - 1];
  const money = (unit: string) => ({ unit, kind: 'money' as const });

  if (WINDOW_PERCENT.test(segments.join('.'))) {
    return { unit: '%', kind: 'percent' };
  }
  switch (section) {
    case 'labourPerHour':
      return money('$ per hour');
    case 'packingPerSqm':
      return money('$ per sqm');
    case 'suppliers':
      return money('$ per kg');
    case 'extrusions':
      return leaf === 'kgPerM' ? { unit: 'kg per metre', kind: 'quantity' } : leaf === 'barLength' ? { unit: 'metres', kind: 'quantity' } : money('$ per bar');
    case 'anodising':
      if (second === 'factor') {
        return { unit: 'sqm per metre', kind: 'factor' };
      }
      return money(leaf === 'etchPerSqm' ? '$ per sqm' : leaf === 'etchMin' ? '$ minimum' : '$ per metre');
    case 'perMetre':
      return money('$ per metre');
    case 'each':
      return money('$ each');
    case 'glass':
      return money(second === 'options' ? '$ per sqm' : leaf === 'flatSmooth' || leaf === 'flatGround' ? '$ per metre' : '$ each');
    default:
      if (leaf === 'areaK') {
        return { unit: 'factor', kind: 'factor' };
      }
      if (leaf === 'fixedQty') {
        return { unit: 'windows', kind: 'quantity' };
      }
      return { unit: leaf === 'perSqm' ? 'minutes per sqm' : 'minutes', kind: 'minutes' };
  }
}

function windowNaming(segments: string[]): { group: string; groupKey: string; label: string } {
  const [section, second, ...rest] = segments;
  if (segments.length === 1) {
    return { group: '', groupKey: '', label: term(section) };
  }
  if (segments.length === 2) {
    return { group: '', groupKey: '', label: term(second) };
  }
  if (section === 'glass' && second === 'options') {
    const option = DEFAULT_WINDOW_RATES.glass.options[rest[0] as keyof typeof DEFAULT_WINDOW_RATES.glass.options];
    return { group: 'Glass list prices', groupKey: 'options', label: option.label };
  }
  if (section === 'glass') {
    return { group: term(rest[0]), groupKey: rest[0], label: term(rest[1]) };
  }
  return { group: term(second), groupKey: second, label: rest.map(term).join(', ') };
}

function windowEntries(node: unknown, segments: string[], out: RateEntry[]): RateEntry[] {
  if (typeof node === 'number' || node === null) {
    const path = segments.join('.');
    if (segments[segments.length - 1] === 'mm') {
      return out;
    }
    const divisor = WINDOW_DIVISOR.test(path);
    const option = path.startsWith('glass.options.') ? segments[2] : '';
    out.push({
      path,
      section: segments[0],
      ...windowNaming(segments),
      ...windowUnit(segments),
      blank: divisor ? 'block' : WINDOW_BLANK_IS_NORMAL.test(path) ? 'fine' : node === null ? 'gap' : 'block',
      zero: divisor ? 'block' : node === 0 ? 'fine' : WINDOW_SPINE.test(path) ? 'block' : 'warn',
      shared: option in WINDOW_GLASS_FROM_LIST ? GLASS_LIST : undefined,
    });
    return out;
  }
  if (node && typeof node === 'object') {
    for (const [key, child] of Object.entries(node)) {
      if (segments.length === 0 && key === 'asAt') {
        continue;
      }
      windowEntries(child, [...segments, key], out);
    }
  }
  return out;
}

export const WINDOW_RATE_CATALOGUE: RateCatalogue = {
  name: 'window',
  sections: WINDOW_SECTIONS,
  entries: windowEntries(DEFAULT_WINDOW_RATES, [], []),
};
