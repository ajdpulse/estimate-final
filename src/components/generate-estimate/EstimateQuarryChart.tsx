import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Stage, Layer, Line, Circle, Rect, Text, Arrow } from 'react-konva';

interface QuarryShape {
  id: string;
  worksId: string;
  kind: 'line' | 'arrow' | 'node-circle' | 'node-square' | 'text' | 'table';
  points?: number[];
  x?: number;
  y?: number;
  radius?: number;
  size?: number;
  text?: string;
  rows?: number;
  cols?: number;
  cellWidth?: number;
  cellHeight?: number;
  data?: string[][];
}

interface EstimateQuarryChartProps {
  workName: string;
  village: string;
  grampanchayat: string;
  taluka: string;
  worksId: string;
  PageHeader: React.FC<{ pageNumber: number }>;
  PageFooter: React.FC<{ pageNumber: number }>;
  startPageNumber: number;
}

export const EstimateQuarryChart: React.FC<EstimateQuarryChartProps> = ({
  workName,
  village,
  grampanchayat,
  taluka,
  worksId,
  PageHeader,
  PageFooter,
  startPageNumber
}) => {
  const [shapes, setShapes] = useState<QuarryShape[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQuarryChart();
  }, [worksId]);

  const fetchQuarryChart = async () => {
    try {
      const { data, error } = await supabase
        .schema('estimate')
        .from('quarry_charts')
        .select('shapes')
        .eq('works_id', worksId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching quarry chart:', error);
      }

      if (data && data.shapes) {
        setShapes(data.shapes as QuarryShape[]);
      }
    } catch (error) {
      console.error('Error in fetchQuarryChart:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderShape = (shape: QuarryShape) => {
    switch (shape.kind) {
      case 'line':
        return (
          <Line
            key={shape.id}
            points={shape.points || []}
            stroke="#111827"
            strokeWidth={2}
            lineCap="round"
            lineJoin="round"
          />
        );
      case 'arrow':
        return (
          <Arrow
            key={shape.id}
            points={shape.points || []}
            stroke="#111827"
            strokeWidth={2}
            pointerLength={15}
            pointerWidth={15}
          />
        );
      case 'node-circle':
        return (
          <Circle
            key={shape.id}
            x={shape.x || 0}
            y={shape.y || 0}
            radius={shape.radius || 10}
            fill="#e5e7eb"
            stroke="#111827"
            strokeWidth={2}
          />
        );
      case 'node-square':
        return (
          <Rect
            key={shape.id}
            x={shape.x || 0}
            y={shape.y || 0}
            width={shape.size || 20}
            height={shape.size || 20}
            fill="#e5e7eb"
            stroke="#111827"
            strokeWidth={2}
          />
        );
      case 'text':
        return (
          <Text
            key={shape.id}
            x={shape.x || 0}
            y={shape.y || 0}
            text={shape.text || ''}
            fontSize={12}
            fontFamily="Arial"
            fill="#111827"
          />
        );
      case 'table':
        // Render table as grid of rectangles
        const cells = [];
        const cellW = shape.cellWidth || 30;
        const cellH = shape.cellHeight || 30;
        for (let r = 0; r < (shape.rows || 0); r++) {
          for (let c = 0; c < (shape.cols || 0); c++) {
            cells.push(
              <Rect
                key={`${shape.id}-cell-${r}-${c}`}
                x={(shape.x || 0) + c * cellW}
                y={(shape.y || 0) + r * cellH}
                width={cellW}
                height={cellH}
                stroke="#111827"
                strokeWidth={1}
                fill="white"
              />
            );
            if (shape.data && shape.data[r] && shape.data[r][c]) {
              cells.push(
                <Text
                  key={`${shape.id}-text-${r}-${c}`}
                  x={(shape.x || 0) + c * cellW + 5}
                  y={(shape.y || 0) + r * cellH + 5}
                  text={shape.data[r][c]}
                  fontSize={10}
                  fontFamily="Arial"
                  fill="#111827"
                />
              );
            }
          }
        }
        return <React.Fragment key={shape.id}>{cells}</React.Fragment>;
      default:
        return null;
    }
  };

  return (
    <div className="pdf-page bg-white p-6 min-h-[297mm] flex flex-col" style={{ fontFamily: 'Arial, sans-serif', pageBreakAfter: 'always' }}>
      <PageHeader pageNumber={startPageNumber} />
      <div className="flex-1">
        <div className="text-center mb-6">
          <h3 className="text-lg font-bold mb-2">QUARRY CHART / ROUTE DIAGRAM</h3>
          <h4 className="text-base font-semibold">Name of Work :- {workName}</h4>
          <p className="text-sm">at {village || 'N/A'}, G.P. {grampanchayat || 'N/A'}, Ta.: {taluka || 'N/A'}</p>
        </div>

        {loading ? (
          <div className="border-2 border-gray-800 min-h-[200mm] bg-gray-50 flex items-center justify-center">
            <p className="text-sm text-gray-500">Loading quarry chart...</p>
          </div>
        ) : shapes.length > 0 ? (
          <div className="border-2 border-gray-800 bg-gray-50">
            <Stage width={800} height={500} style={{ margin: '0 auto' }}>
              <Layer>
                {shapes.map(renderShape)}
              </Layer>
            </Stage>
          </div>
        ) : (
          <div className="border-2 border-gray-800 min-h-[200mm] bg-gray-50 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <p className="text-sm mb-2">No Quarry Chart Data</p>
              <p className="text-xs">Please use the Quarry Chart tool in the Subworks page to create and save the diagram.</p>
            </div>
          </div>
        )}

        <div className="mt-4 text-xs text-gray-600">
          <p className="font-semibold mb-2">Instructions:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Shows route from work site to quarry/material source</li>
            <li>Indicates villages, roads, and distances along the route</li>
            <li>Marks quarry locations and depot positions</li>
            <li>Use the interactive Quarry Chart tool to create detailed diagrams</li>
          </ol>
        </div>
      </div>
      <PageFooter pageNumber={startPageNumber} />
    </div>
  );
};
