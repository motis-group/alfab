/**
 * The window costing keeps the legacy sheet's vocabulary, which assumes the reader already knows
 * the trade. These are the terms a new estimator has to be told, written plainly.
 *
 * Where the sheet itself does not record what a charge covers, this says so rather than guessing.
 */

export interface GlossaryEntry {
  term: string;
  definition: string;
  /** Where the term shows up. */
  where: string;
}

export type GlossaryGroup = 'price' | 'quantity' | 'labour' | 'finish' | 'glazing';

export const GLOSSARY_GROUP_LABELS: Record<GlossaryGroup, string> = {
  price: 'HOW THE PRICE IS BUILT',
  quantity: 'QUANTITIES',
  labour: 'LABOUR',
  finish: 'FINISH',
  glazing: 'GLAZING',
};

export const WINDOW_COSTING_GLOSSARY: Record<GlossaryGroup, GlossaryEntry[]> = {
  price: [
    {
      term: 'Subtotal',
      definition: 'What the window costs to make: materials, plus labour minutes at the hourly rate, plus the glazing.',
      where: 'Price card, and the top of the printed sheet.',
    },
    {
      term: 'Margin',
      definition: 'The mark-up added to the cost to get the selling price. 40 percent on most window types, 35 percent on the T5836, T8610 and sash and frame. It is a percentage of the cost, not of the final price.',
      where: 'Price card. Set per window type under Margin & uplift.',
    },
    {
      term: 'Packing',
      definition: 'A flat charge for packing the window, at $2.50 for each square metre of glass, rounded to 10 cents. The AFB008 slider uses a flat $2 instead. A window with a reinforcing bar or mullion is charged for the bar in place of packing.',
      where: 'Price card, added after the margin.',
    },
    {
      term: 'Uplift',
      definition: 'The last step: 7.5 percent added to everything above, or 10 percent on the T4633. The sheet applied it to every window but never recorded what it covers. Confirm what it is for before changing it.',
      where: 'Price card. Set per window type under Margin & uplift.',
    },
    {
      term: 'Loading',
      definition: 'A supplier mark-up on the raw metal price, before any offcut. Capral is loaded 20 percent and G. James 33.3 percent. Held as a fraction, so 0.2 means 20 percent.',
      where: 'Aluminium suppliers. Applied to every extrusion from that supplier.',
    },
    {
      term: 'Offcut',
      definition: 'The waste allowance for a section, because a bar is rarely cut with nothing left over. A 20 percent offcut prices 1.2 metres of metal for every metre in the window.',
      where: 'Extrusions, one per section.',
    },
    {
      term: 'Minimum charge',
      definition: 'The least the anodiser will invoice for one window. When the metre rate comes to less than the minimum, the window is charged the minimum.',
      where: 'Anodising. The minimum doubles on the two window types that anodise two frames.',
    },
    {
      term: 'Not priced',
      definition: 'A rate the legacy sheet never held. The costing charges the line as nil and says so, so the quote is short by whatever that item really costs.',
      where: 'Not priced card, and the rates editor in yellow.',
    },
  ],
  quantity: [
    {
      term: 'Made to size (square)',
      definition: 'A rectangular window, cut to a given size. Quicker to set up and to make than a shaped window.',
      where: 'Window card. The quantity is the batch of identical windows.',
    },
    {
      term: 'Shaped (off square)',
      definition: 'A window that is not a plain rectangle, so it takes longer to set up, weld and trim. The costing uses the off square minutes for the whole batch.',
      where: 'Window card.',
    },
    {
      term: 'Per pair',
      definition: 'The price covers two windows made together, not one. The costing doubles everything except the uplift, which is applied to the pair.',
      where: 'Window card, and the price label reads Per Pair.',
    },
    {
      term: 'Batch',
      definition: 'The quantity made to size plus the quantity shaped. Setup minutes are shared across the batch, which is why the price for each window falls as the batch grows.',
      where: 'Batch price card.',
    },
    {
      term: 'Mullion, transom, reinforcing bar',
      definition: 'Bars that divide or stiffen a window. A mullion runs vertically, a transom horizontally, and a reinforcing bar stiffens the frame without dividing the glass. Each is priced as its own small assembly with its own labour.',
      where: 'Window card, on the types that take them.',
    },
  ],
  labour: [
    {
      term: 'Setup minutes',
      definition: 'The minutes spent getting ready to make a run, counted once for the batch and then divided across it.',
      where: 'Labour minutes, the setup figure in each table.',
    },
    {
      term: 'Per each minutes',
      definition: 'The minutes to make one window, charged in full for every window in the batch.',
      where: 'Labour minutes.',
    },
    {
      term: 'Area factor',
      definition: 'Extra minutes for each square metre of glass, because a bigger window takes longer to handle. Multiplied by the glass area.',
      where: 'Labour minutes, the minutes per square metre figure.',
    },
    {
      term: 'Development labour',
      definition: 'The minutes for working out a window that has not been made before: drawings, jigs and first-off checks. Turn it off for a window already in production.',
      where: 'Finish and labour card.',
    },
    {
      term: 'Sundry labour',
      definition: 'Extra minutes for this window only, entered by hand for anything the tables do not cover.',
      where: 'Finish and labour card.',
    },
  ],
  finish: [
    {
      term: 'Mill finish',
      definition: 'Bare aluminium, as it comes from the supplier. Nothing is charged for finishing.',
      where: 'Finish and labour card.',
    },
    {
      term: 'Etch anodised',
      definition: 'The standard anodised finish, charged per metre of frame with a minimum charge for each window.',
      where: 'Finish and labour card.',
    },
    {
      term: 'Black anodising as an extra',
      definition: 'The window is quoted etched, and the difference to black is shown separately so the customer can decide. The difference is priced with the margin and the uplift on it.',
      where: 'Add for card.',
    },
    {
      term: 'Trims required, or as an extra',
      definition: 'Required puts the trim into the price. As an extra prices the trim separately, so the customer sees what the trim adds.',
      where: 'Finish and labour card, and the Add for card.',
    },
    {
      term: 'Marine Window Service',
      definition: 'A pricing basis the sheet used for marine work: a lower margin on three window types and a lower glass loading on all of them.',
      where: 'Finish and labour card. Confirm it is still in use before relying on it.',
    },
  ],
  glazing: [
    {
      term: 'Glass loading',
      definition: 'A mark-up on the glass list price, 20 percent normally and 15 percent for Marine Window Service. The sheet applied it to 8 to 12 mm glass, laminate and the processing charges, but not to 5 and 6 mm toughened or to acrylic.',
      where: 'Glazing rates.',
    },
    {
      term: 'A/P',
      definition: 'Armour plate: toughened safety glass.',
      where: 'Glazing material list.',
    },
    {
      term: 'Rough arris',
      definition: 'The sharp edge of cut glass taken off, without polishing. The plain edge finish.',
      where: 'Glazing card, on laminate.',
    },
    {
      term: 'Flat smooth, flat ground',
      definition: 'Ground edge finishes, charged by the metre of edge worked, and dearer than a rough arris.',
      where: 'Glazing card.',
    },
    {
      term: 'C/view hole',
      definition: 'A countersunk hole, drilled so a fixing sits flush with the glass. Charged for each hole and dearer than a plain hole.',
      where: 'Glazing card.',
    },
    {
      term: 'Shape cutting',
      definition: 'A charge for each piece of glass cut to anything other than a rectangle.',
      where: 'Glazing lines, counted for you on the slider types.',
    },
    {
      term: 'Second choice glazing',
      definition: 'A different glass priced against the same window, so the customer can compare. Only the difference is shown, with margin and uplift on it.',
      where: 'Glazing card, and the Add for card.',
    },
  ],
};

export const GLOSSARY_GROUP_ORDER: GlossaryGroup[] = ['price', 'quantity', 'labour', 'finish', 'glazing'];
