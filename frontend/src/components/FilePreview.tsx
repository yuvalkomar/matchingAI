import { FileUploadResponse } from '../types';

interface FilePreviewProps {
  file: FileUploadResponse;
  /** When true, render only the scrollable table (no card, no title). Used inside UploadOrPreview. */
  embedded?: boolean;
}

const FilePreview = ({ file, embedded = false }: FilePreviewProps) => {
  const { sample_data, columns } = file;

  const numRows =
    columns.length > 0 && sample_data && sample_data[columns[0]]
      ? sample_data[columns[0]].length
      : 0;

  const table = (
    <div className={embedded ? 'h-full overflow-auto min-h-0' : 'flex-1 overflow-auto min-h-0'}>
      <div className="min-w-max inline-block align-middle">
        <table className="min-w-full divide-y divide-gray-200 text-xs">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-2 py-1.5 text-left text-xs font-medium text-text-primary uppercase tracking-wider border-r border-gray-200 last:border-r-0 min-w-[120px] whitespace-nowrap"
                  title={col}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {Array.from({ length: numRows }).map((_, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-gray-50">
                {columns.map((col) => (
                  <td
                    key={`${col}-${rowIndex}`}
                    className="px-2 py-1.5 text-text-secondary border-r border-gray-100 last:border-r-0 min-w-[120px] max-w-[240px]"
                    title={String(sample_data?.[col]?.[rowIndex] ?? '')}
                  >
                    <div className="truncate">
                      {sample_data?.[col]?.[rowIndex] ?? ''}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {numRows === 0 && (
        <p className="text-xs text-text-secondary text-center py-4">No preview data available</p>
      )}
    </div>
  );

  if (embedded) {
    return table;
  }

  return (
    <div className="card p-4 h-full flex flex-col">
      <h3 className="text-xs font-semibold text-text-primary mb-2">Preview</h3>
      {table}
    </div>
  );
};

export default FilePreview;
