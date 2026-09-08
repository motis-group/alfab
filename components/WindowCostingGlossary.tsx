'use client';

import Accordion from '@components/Accordion';
import Text from '@components/Text';

import { GLOSSARY_GROUP_LABELS, GLOSSARY_GROUP_ORDER, GlossaryGroup, WINDOW_COSTING_GLOSSARY } from '@utils/window-costing-glossary';

interface WindowCostingGlossaryProps {
  /** Groups to show, in order. Defaults to all of them. */
  groups?: GlossaryGroup[];
  /** Group left open. */
  openGroup?: GlossaryGroup;
}

/** Plain definitions of the terms the legacy costing sheet assumed the reader already knew. */
export default function WindowCostingGlossary({ groups = GLOSSARY_GROUP_ORDER, openGroup }: WindowCostingGlossaryProps) {
  return (
    <>
      {groups.map((group) => (
        <Accordion key={group} title={GLOSSARY_GROUP_LABELS[group]} defaultValue={group === openGroup}>
          {WINDOW_COSTING_GLOSSARY[group].map((entry) => (
            <div key={entry.term} style={{ marginBottom: 'calc(var(--font-size) * var(--theme-line-height-base))' }}>
              <Text>
                <strong>{entry.term}</strong>
              </Text>
              <Text>{entry.definition}</Text>
              <Text>
                <span style={{ color: 'var(--theme-overlay)' }}>{entry.where}</span>
              </Text>
            </div>
          ))}
        </Accordion>
      ))}
    </>
  );
}
