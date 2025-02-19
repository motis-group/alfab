export type GlassType = 'Clear' | 'Green' | 'Grey' | 'Dark Grey' | 'Super Grey';
export type EdgeworkType = 'ROUGH ARRIS' | 'FLAT GRIND - STRAIGHT' | 'FLAT GRIND - CURVED' | 'FLAT POLISH - STRAIGHT' | 'FLAT POLISH - CURVED';
export type GlassThickness = 4 | 5 | 6 | 8 | 10 | 12;
export type ShapeType = 'RECTANGLE' | 'TRIANGLE' | 'COMPLEX' | 'SIMPLE';

export interface CostBreakdown {
  baseGlass: number;
  edgework: number;
  holes: number;
  shape: number;
  ceramic: number;
  scanning: number;
  total: number;
}

export interface GlassSpecification {
  width: number;
  height: number;
  thickness: GlassThickness;
  glassType: GlassType;
  edgework: EdgeworkType;
  ceramicBand: boolean;
  shape: ShapeType;
  holes: boolean;
  numHoles: number;
  radiusCorners: boolean;
  scanning: boolean;
}

// Glass colors/types mapped to their RGB values for UI
export const glassTypeToRGB: Record<GlassType, string> = {
  Clear: 'rgba(200, 200, 255, 0.2)',
  Green: 'rgba(0, 255, 0, 0.2)',
  Grey: 'rgba(128, 128, 128, 0.2)',
  'Dark Grey': 'rgba(64, 64, 64, 0.2)',
  'Super Grey': 'rgba(32, 32, 32, 0.2)',
};

// Base glass prices per m² based on type and thickness
const basePrices: Record<GlassType, Partial<Record<GlassThickness, number>>> = {
  Clear: {
    4: 83.96,
    5: 87.59,
    6: 92.47,
    8: 200.63,
    10: 221.78,
    12: 270.74,
  },
  Green: {
    4: 102.19,
    5: 104.61,
    6: 109.5,
    8: 242.79,
    10: 267.62,
    12: 292.06,
  },
  Grey: {
    4: 102.19,
    5: 104.61,
    6: 109.5,
    8: 242.79,
    10: 267.62,
    12: 292.06,
  },
  'Dark Grey': {
    5: 128.97,
  },
  'Super Grey': {
    6: 198.12,
  },
};

// Edgework prices per meter based on thickness range
const edgeworkPrices: Record<EdgeworkType, Record<'4-6' | '8-12', number>> = {
  'ROUGH ARRIS': { '4-6': 0, '8-12': 0 },
  'FLAT GRIND - STRAIGHT': { '4-6': 4.31, '8-12': 7.59 },
  'FLAT GRIND - CURVED': { '4-6': 8.85, '8-12': 17.67 },
  'FLAT POLISH - STRAIGHT': { '4-6': 4.56, '8-12': 8.85 },
  'FLAT POLISH - CURVED': { '4-6': 12.66, '8-12': 25.27 },
};

// Get available glass types for a given thickness
export function getAvailableGlassTypes(thickness: GlassThickness): GlassType[] {
  // Based on the Rust code's get_available_colors function
  switch (thickness) {
    case 4:
      return ['Clear', 'Green', 'Grey'];
    case 5:
      return ['Clear', 'Green', 'Grey', 'Dark Grey'];
    case 6:
      return ['Clear', 'Green', 'Grey', 'Super Grey'];
    case 8:
    case 10:
    case 12:
      return ['Clear', 'Green', 'Grey'];
    default:
      return ['Clear'];
  }
}

// Get available thicknesses for a given glass type
export function getAvailableThicknesses(glassType: GlassType): GlassThickness[] {
  return Object.keys(basePrices[glassType]).map(Number) as GlassThickness[];
}

export function calculateArea(width: number, height: number, shape: ShapeType): number {
  const areaInMm = shape === 'TRIANGLE' ? (width * height) / 2 : width * height;
  return areaInMm / 1_000_000; // Convert to m²
}

export function calculatePerimeter(width: number, height: number, shape: ShapeType): number {
  let perimeterInMm = 0;
  if (shape === 'TRIANGLE') {
    const hypotenuse = Math.sqrt(width ** 2 + height ** 2);
    perimeterInMm = width + height + hypotenuse;
  } else {
    perimeterInMm = 2 * (width + height);
  }
  return perimeterInMm / 1_000; // Convert to meters
}

export function calculateCost(spec: GlassSpecification): CostBreakdown {
  const area = calculateArea(spec.width, spec.height, spec.shape);
  const perimeter = calculatePerimeter(spec.width, spec.height, spec.shape);

  // Initialize cost breakdown
  const costs: CostBreakdown = {
    baseGlass: 0,
    edgework: 0,
    holes: 0,
    shape: 0,
    ceramic: 0,
    scanning: 0,
    total: 0,
  };

  // Calculate base glass cost
  const basePrice = basePrices[spec.glassType]?.[spec.thickness];
  if (!basePrice) {
    throw new Error(`Invalid combination of glass type (${spec.glassType}) and thickness (${spec.thickness}mm)`);
  }
  costs.baseGlass = basePrice * area;

  // Calculate edgework cost
  const thicknessRange = spec.thickness <= 6 ? '4-6' : '8-12';
  costs.edgework = edgeworkPrices[spec.edgework][thicknessRange] * perimeter;

  // Calculate holes cost
  if (spec.holes) {
    const holePrice = spec.thickness <= 6 ? 6.33 : 8.85;
    costs.holes = holePrice * spec.numHoles;
  }

  // Calculate shape cost
  if (spec.shape === 'COMPLEX') {
    costs.shape = spec.thickness <= 6 ? 12.65 : 25.27;
  } else if (spec.shape === 'SIMPLE') {
    costs.shape = spec.thickness <= 6 ? 7.59 : 12.65;
  }

  // Calculate ceramic banding cost
  if (spec.ceramicBand) {
    costs.ceramic = area <= 1.5 ? 63.68 : 63.68 * area;
  }

  // Calculate scanning cost
  if (spec.scanning) {
    costs.scanning = 90;
  }

  // Calculate total
  costs.total = Object.values(costs).reduce((sum, cost) => sum + cost, 0) - costs.total;

  return costs;
}

// Add these types
export interface SavedCalculation {
  id: string;
  name: string;
  client: string;
  specification: GlassSpecification;
  cost: CostBreakdown;
  date: string;
}

// Add helper function to generate ID
export function generateCalculationId(): string {
  return Math.random().toString(36).substring(2, 15);
}
