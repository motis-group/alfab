'use client';

import * as React from 'react';

interface TableColumnProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  children?: React.ReactNode;
}

const TableColumn: React.FC<TableColumnProps> = ({ children, style, ...props }) => {
  return (
    <td style={style} {...props}>
      {children}
    </td>
  );
};

TableColumn.displayName = 'TableColumn';

export default TableColumn;
