type GlassThickness = 4 | 5 | 6 | 8 | 10 | 12;
type GlassColor = 'Clear' | 'Green' | 'Grey' | 'Dark Grey' | 'Super Grey';

type Constraint = {
	id: string;
	type: 'length' | 'angle' | 'horizontal' | 'vertical';
	value: number;
	elements: string[];
};

type GlassType =
	| 'CLEAR'
	| 'TINTED'
	| 'BRONZE'
	| 'SUPER GREY'
	| 'WHITE PATTERNED'
	| 'DARK GREY';
type Treatment = 'TOUGHENED';
type EdgeworkType =
	| 'ROUGH ARRIS'
	| 'FLAT GRIND - STRAIGHT'
	| 'FLAT GRIND - CURVED'
	| 'FLAT POLISH - STRAIGHT'
	| 'FLAT POLISH - CURVED';
type ShapeType = 'RECTANGLE' | 'COMPLEX' | 'SIMPLE';
type ThicknessRange = '4-6' | '8-12';

const materials = [
	{ id: '1', name: 'Basic', costPerUnit: 10 },
	{ id: '2', name: 'Premium', costPerUnit: 20 },
	{ id: '3', name: 'Luxury', costPerUnit: 30 },
];

interface CostBreakdown {
	baseGlass: number;
	edgework: number;
	holes: number;
	shape: number;
	ceramic: number;
	total: number;
}

interface GlassPricingParams {
	widthMm: number;
	heightMm: number;
	thicknessMm: 4 | 5 | 6 | 8 | 10 | 12;
	glassType: GlassType;
	treatment?: Treatment;
	edgeworkType?: EdgeworkType;
	isCeramicFullCover?: boolean;
	shapeType?: ShapeType;
	customShape?: string;
	hasHoles?: boolean;
	numHoles?: number;
	ceramicBanding?: boolean;
}

const glassThicknesses: GlassThickness[] = [4, 5, 6, 8, 10, 12];
const glassColors: GlassColor[] = [
	'Clear',
	'Green',
	'Grey',
	'Dark Grey',
	'Super Grey',
];

const glassColorToRGB: Record<GlassColor, string> = {
	Clear: 'rgba(200, 200, 255, 0.2)',
	Green: 'rgba(0, 255, 0, 0.2)',
	Grey: 'rgba(128, 128, 128, 0.2)',
	'Dark Grey': 'rgba(64, 64, 64, 0.2)',
	'Super Grey': 'rgba(32, 32, 32, 0.2)',
};

const basePrices: Record<GlassType, Partial<Record<number, number>>> = {
	CLEAR: {
		4: 83.96,
		5: 87.59,
		6: 92.47,
		8: 200.63,
		10: 221.78,
		12: 270.74,
	},
	TINTED: {
		4: 102.19,
		5: 104.61,
		6: 109.5,
		8: 242.79,
		10: 267.62,
		12: 292.06,
	},
	BRONZE: {
		4: 115.36,
		10: 281.95,
	},
	'DARK GREY': {
		5: 128.97,
	},
	'SUPER GREY': {
		6: 198.12,
	},
	'WHITE PATTERNED': {
		5: 133.3,
		6: 154.43,
	},
};

const ceramicFullCoverPrices: Record<
	GlassType,
	Partial<Record<number, number>>
> = {
	CLEAR: {
		5: 179.91,
		6: 195.73,
	},
	TINTED: {
		5: 206.5,
		6: 222.63,
	},
	BRONZE: {
		6: 234.55,
	},
	'DARK GREY': {},
	'SUPER GREY': {},
	'WHITE PATTERNED': {},
};

const edgeworkPrices: Record<EdgeworkType, Record<ThicknessRange, number>> = {
	'ROUGH ARRIS': { '4-6': 0, '8-12': 0 },
	'FLAT GRIND - STRAIGHT': { '4-6': 4.31, '8-12': 7.59 },
	'FLAT GRIND - CURVED': { '4-6': 8.85, '8-12': 17.67 },
	'FLAT POLISH - STRAIGHT': { '4-6': 4.56, '8-12': 8.85 },
	'FLAT POLISH - CURVED': { '4-6': 12.66, '8-12': 25.27 },
};

const calculateGlassPrice = ({
	widthMm,
	heightMm,
	thicknessMm,
	glassType,
	treatment = 'TOUGHENED',
	edgeworkType = 'FLAT GRIND - STRAIGHT',
	isCeramicFullCover = false,
	shapeType = 'RECTANGLE',
	customShape = null,
	hasHoles = false,
	numHoles = 0,
	ceramicBanding = false,
}: GlassPricingParams): CostBreakdown => {
	// Convert dimensions to square meters
	const areaSqM = (widthMm * heightMm) / 1000000;

	// Initialize cost breakdown
	const costs: CostBreakdown = {
		baseGlass: 0,
		edgework: 0,
		holes: 0,
		shape: 0,
		ceramic: 0,
		total: 0,
	};

	// Calculate base glass cost
	const priceTable = isCeramicFullCover ? ceramicFullCoverPrices : basePrices;
	const basePrice = priceTable[glassType]?.[thicknessMm];

	if (!basePrice) {
		throw new Error(
			`Invalid combination of glass_type (${glassType}) and thickness (${thicknessMm}mm)`
		);
	}

	costs.baseGlass = basePrice * areaSqM;

	// Calculate edgework cost
	const perimeter = (2 * (widthMm + heightMm)) / 1000; // Convert to meters
	const thicknessRange: ThicknessRange = thicknessMm <= 6 ? '4-6' : '8-12';
	costs.edgework = edgeworkPrices[edgeworkType][thicknessRange] * perimeter;

	// Calculate holes cost
	if (hasHoles) {
		const holePrice = thicknessMm <= 6 ? 6.33 : 8.85;
		costs.holes = holePrice * numHoles;
	}

	// Calculate shape cost
	if (shapeType === 'COMPLEX') {
		costs.shape = thicknessMm <= 6 ? 12.65 : 25.27;
	} else if (shapeType === 'SIMPLE') {
		costs.shape = thicknessMm <= 6 ? 7.59 : 12.65;
	}

	// Add ceramic banding if requested
	if (ceramicBanding) {
		costs.ceramic = areaSqM <= 1.5 ? 63.68 : 63.68 * areaSqM;
	}

	// Calculate total
	costs.total =
		Object.values(costs).reduce((sum, cost) => sum + cost, 0) - costs.total;

	return costs;
};

const calculateCost = () => {
	const boundingBox = getBoundingBox();
	if (!boundingBox) return 0;

	// Map our glass color to the pricing calculator's glass type
	const glassTypeMap: Record<GlassColor, GlassType> = {
		Clear: 'CLEAR',
		Green: 'TINTED',
		Grey: 'TINTED',
		'Dark Grey': 'DARK GREY',
		'Super Grey': 'SUPER GREY',
	};

	// Determine shape type based on number of points and lines
	let shapeType: ShapeType = 'RECTANGLE';
	if (points.length > 4) {
		shapeType = points.length > 6 ? 'COMPLEX' : 'SIMPLE';
	}

	// Calculate total perimeter for edgework
	const perimeter = lines.reduce(
		(sum, line) => sum + getLineLength(line.start, line.end),
		0
	);

	try {
		const costs = calculateGlassPrice({
			widthMm: boundingBox.width,
			heightMm: boundingBox.height,
			thicknessMm: glassThickness,
			glassType: glassTypeMap[glassColor],
			treatment: 'TOUGHENED',
			edgeworkType: polishedEdge
				? 'FLAT POLISH - STRAIGHT'
				: 'FLAT GRIND - STRAIGHT',
			isCeramicFullCover: false,
			shapeType: shapeType,
			hasHoles: holes,
			numHoles: holes ? 4 : 0, // Assuming 4 holes when holes option is enabled
			ceramicBanding: ceramicBand,
		});

		return costs.total;
	} catch (error) {
		console.error('Error calculating price:', error);
		return 0;
	}
};
