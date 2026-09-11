'use client';

import * as React from 'react';

import Input from '@components/Input';
import Text from '@components/Text';

import { EdgeworkType, GlassSpecification, getAvailableGlassTypes, getAvailableThicknesses } from '@utils/calculations';
import { PricingData } from '@components/PricingProvider';

const EDGEWORK_OPTIONS: EdgeworkType[] = ['ROUGH ARRIS', 'FLAT GRIND - STRAIGHT', 'FLAT GRIND - CURVED', 'FLAT POLISH - STRAIGHT', 'FLAT POLISH - CURVED'];

function numberOrFallback(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

interface GlassSpecificationFieldsProps {
  spec: GlassSpecification;
  onChange: (next: GlassSpecification) => void;
  /** Which thicknesses the shop stocks. The glass price list decides. */
  basePrices: PricingData['basePrices'];
  disabled?: boolean;
  /**
   * Suffix for the input names, so two of these on one page do not collide. The glass calculator
   * leaves it off; the order editor passes the line's id.
   */
  namePrefix?: string;
}

/**
 * What a piece of glass is: size, glass, edge, shape and the extras that carry a charge.
 *
 * It says nothing about how many, what they cost or what they are called — those belong to the
 * quote line or the order line that holds the specification, not to the glass itself.
 */
export default function GlassSpecificationFields({ spec, onChange, basePrices, disabled = false, namePrefix = 'spec' }: GlassSpecificationFieldsProps) {
  const update = (patch: Partial<GlassSpecification>) => onChange({ ...spec, ...patch });

  return (
    <>
      <Text>GLASS THICKNESS (MM)</Text>
      <select
        value={String(spec.thickness)}
        disabled={disabled}
        onChange={(event) => {
          const thickness = Number(event.target.value) as GlassSpecification['thickness'];
          // Not every glass is stocked in every thickness, so the type follows the thickness.
          const available = getAvailableGlassTypes(thickness);
          update({ thickness, glassType: available.includes(spec.glassType) ? spec.glassType : available[0] });
        }}
      >
        {getAvailableThicknesses(spec.glassType, basePrices).map((thickness) => (
          <option key={thickness} value={thickness}>
            {thickness}
          </option>
        ))}
      </select>
      <br />

      <Text>GLASS TYPE</Text>
      <select value={spec.glassType} disabled={disabled} onChange={(event) => update({ glassType: event.target.value as GlassSpecification['glassType'] })}>
        {getAvailableGlassTypes(spec.thickness).map((glassType) => (
          <option key={glassType} value={glassType}>
            {glassType}
          </option>
        ))}
      </select>
      <br />

      <Input label="WIDTH (MM)" type="number" name={`${namePrefix}_width`} value={String(spec.width)} disabled={disabled} onChange={(event) => update({ width: Math.max(0, numberOrFallback(event.target.value, 0)) })} min="0" />
      <Input label="HEIGHT (MM)" type="number" name={`${namePrefix}_height`} value={String(spec.height)} disabled={disabled} onChange={(event) => update({ height: Math.max(0, numberOrFallback(event.target.value, 0)) })} min="0" />
      {spec.cadOutline ? (
        <Text>
          <span className="status-success">
            Read from {spec.cadOutline.fileName}: {spec.cadOutline.widthMm} × {spec.cadOutline.heightMm} mm, {spec.cadOutline.shapeLabel}.
          </span>
        </Text>
      ) : null}

      <Text>SHAPE</Text>
      <select value={spec.shape} disabled={disabled} onChange={(event) => update({ shape: event.target.value as GlassSpecification['shape'] })}>
        <option value="RECTANGLE">Rectangle</option>
        <option value="TRIANGLE">Triangle</option>
        <option value="SIMPLE">Simple Shape</option>
        <option value="COMPLEX">Complex Shape</option>
      </select>
      <br />

      <Text>EDGEWORK</Text>
      <select value={spec.edgework} disabled={disabled} onChange={(event) => update({ edgework: event.target.value as GlassSpecification['edgework'] })}>
        {EDGEWORK_OPTIONS.map((edgework) => (
          <option key={edgework} value={edgework}>
            {edgework}
          </option>
        ))}
      </select>
      <br />

      <Text>ADDITIONAL OPTIONS</Text>
      <label>
        <input type="checkbox" checked={spec.ceramicBand} disabled={disabled} onChange={(event) => update({ ceramicBand: event.target.checked })} /> Ceramic Banding
      </label>
      <br />
      <label>
        {/* Ticking starts at the commonest count rather than zero; clearing zeroes it, so a piece is
            never charged for holes it has none of. */}
        <input type="checkbox" checked={spec.holes} disabled={disabled} onChange={(event) => update({ holes: event.target.checked, numHoles: event.target.checked ? Math.max(1, spec.numHoles || 4) : 0 })} /> Include Holes
      </label>
      <br />
      <label>
        <input type="checkbox" checked={spec.scanning} disabled={disabled} onChange={(event) => update({ scanning: event.target.checked })} /> Scanning
      </label>
      <br />
      <label>
        <input type="checkbox" checked={spec.radiusCorners} disabled={disabled} onChange={(event) => update({ radiusCorners: event.target.checked })} /> Radius Corners
      </label>

      <Input
        label="NUMBER OF HOLES"
        type="number"
        name={`${namePrefix}_holes`}
        value={String(spec.numHoles)}
        disabled={disabled || !spec.holes}
        onChange={(event) => update({ numHoles: Math.max(0, numberOrFallback(event.target.value, 0)) })}
        min="0"
      />
    </>
  );
}
