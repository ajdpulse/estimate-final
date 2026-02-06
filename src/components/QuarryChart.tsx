import React, { useState, useRef } from 'react';
import { Stage, Layer, Line, Circle, Rect, Text, Transformer, Arrow } from 'react-konva';
import Konva from 'konva';
import jsPDF from 'jspdf';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface QuarryChartProps {
  isOpen: boolean;
  onClose: () => void;
  worksId: string;        // chart is specific to this works_id
}

type Tool =
  | 'select'
  | 'free-line'
  | 'straight-line'
  | 'polyline'
  | 'arrow'
  | 'node-circle'
  | 'node-square'
  | 'text'
  | 'table'
  | 'eraser';

type ShapeKind = 'line' | 'arrow' | 'node-circle' | 'node-square' | 'text' | 'table';

interface BaseShape {
  id: string;
  worksId: string;
  kind: ShapeKind;
}

interface LineShape extends BaseShape {
  kind: 'line';
  points: number[];
}

interface NodeCircleShape extends BaseShape {
  kind: 'node-circle';
  x: number;
  y: number;
  radius: number;
}

interface NodeSquareShape extends BaseShape {
  kind: 'node-square';
  x: number;
  y: number;
  size: number;
}

interface TextShape extends BaseShape {
  kind: 'text';
  x: number;
  y: number;
  text: string;
}

interface ArrowShape extends BaseShape {
  kind: 'arrow';
  points: number[];
}

interface TableShape extends BaseShape {
  kind: 'table';
  x: number;
  y: number;
  rows: number;
  cols: number;
  cellWidth: number;
  cellHeight: number;
  data: string[][];
}

type QuarryShape = LineShape | ArrowShape | NodeCircleShape | NodeSquareShape | TextShape | TableShape;

const QuarryChart: React.FC<QuarryChartProps> = ({ isOpen, onClose, worksId }) => {
  const [title, setTitle] = useState('Quarry Chart');
  const [rows, setRows] = useState(25);
  const [cols, setCols] = useState(40);
  const [tool, setTool] = useState<Tool>('select');
  const [textLabel, setTextLabel] = useState('');
  const [strokeColor, setStrokeColor] = useState('#111827');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);

  const [shapes, setShapes] = useState<QuarryShape[]>([]);
  const [history, setHistory] = useState<QuarryShape[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const stageRef = useRef<Konva.Stage | null>(null);
  const trRef = useRef<Konva.Transformer | null>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);

  const width = cols * 20;
  const height = rows * 20;

  const snapshot = () => {
    setHistory(prev => [...prev, JSON.parse(JSON.stringify(shapes))].slice(-50));
  };

  const handleUndo = () => {
    setHistory(prev => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      setShapes(last);
      return prev.slice(0, -1);
    });
  };

  const filteredShapes = shapes.filter(s => s.worksId === worksId);

  const handleMouseDown = (e: any) => {
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;

    if (tool === 'select') {
      const clickedOnEmpty = e.target === stage;
      if (clickedOnEmpty) setSelectedId(null);
      setIsDrawing(false);
      return;
    }

    snapshot();
    setIsDrawing(true);

    if (tool === 'free-line') {
      const id = `line-${Date.now()}`;
      const newLine: LineShape = {
        id,
        worksId,
        kind: 'line',
        points: [pos.x, pos.y, pos.x, pos.y]
      };
      setShapes(prev => [...prev, newLine]);
    } else if (tool === 'straight-line' || tool === 'polyline') {
      startPointRef.current = { x: pos.x, y: pos.y };
      const id = `line-${Date.now()}`;
      const newLine: LineShape = {
        id,
        worksId,
        kind: 'line',
        points: [pos.x, pos.y, pos.x, pos.y]
      };
      setShapes(prev => [...prev, newLine]);
    } else if (tool === 'arrow') {
      startPointRef.current = { x: pos.x, y: pos.y };
      const id = `arrow-${Date.now()}`;
      const newArrow: ArrowShape = {
        id,
        worksId,
        kind: 'arrow',
        points: [pos.x, pos.y, pos.x, pos.y]
      };
      setShapes(prev => [...prev, newArrow]);
    } else if (tool === 'node-circle') {
      const id = `nodec-${Date.now()}`;
      const node: NodeCircleShape = {
        id,
        worksId,
        kind: 'node-circle',
        x: pos.x,
        y: pos.y,
        radius: 4
      };
      setShapes(prev => [...prev, node]);
    } else if (tool === 'node-square') {
      const id = `nodes-${Date.now()}`;
      const node: NodeSquareShape = {
        id,
        worksId,
        kind: 'node-square',
        x: pos.x,
        y: pos.y,
        size: 8
      };
      setShapes(prev => [...prev, node]);
    } else if (tool === 'text') {
      if (!textLabel.trim()) return;
      const id = `text-${Date.now()}`;
      const t: TextShape = {
        id,
        worksId,
        kind: 'text',
        x: pos.x,
        y: pos.y,
        text: textLabel
      };
      setShapes(prev => [...prev, t]);
    } else if (tool === 'table') {
      const id = `table-${Date.now()}`;
      const emptyData: string[][] = Array(tableRows).fill(null).map(() => Array(tableCols).fill(''));
      const table: TableShape = {
        id,
        worksId,
        kind: 'table',
        x: pos.x,
        y: pos.y,
        rows: tableRows,
        cols: tableCols,
        cellWidth: 80,
        cellHeight: 30,
        data: emptyData
      };
      setShapes(prev => [...prev, table]);
    } else if (tool === 'eraser') {
      const target = e.target;
      const id = target?.attrs?.id;
      if (!id) return;
      setShapes(prev => prev.filter(s => s.id !== id));
    }
  };

  const handleMouseMove = () => {
    if (!isDrawing) return;
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;

    setShapes(prev => {
      const next = [...prev];

      if (tool === 'arrow') {
        const idx = next.findIndex(
          s => s.worksId === worksId && s.kind === 'arrow' && s.id === next[next.length - 1].id
        );
        if (idx === -1) return prev;
        const last = next[idx] as ArrowShape;
        const sp = startPointRef.current;
        if (!sp) return prev;
        const updated: ArrowShape = {
          ...last,
          points: [sp.x, sp.y, pos.x, pos.y]
        };
        next[idx] = updated;
        return next;
      }

      const idx = next.findIndex(
        s => s.worksId === worksId && s.kind === 'line' && s.id === next[next.length - 1].id
      );
      if (idx === -1) return prev;
      const last = next[idx] as LineShape;

      if (tool === 'free-line') {
        const updated: LineShape = {
          ...last,
          points: [...last.points, pos.x, pos.y]
        };
        next[idx] = updated;
      } else if (tool === 'straight-line') {
        const sp = startPointRef.current;
        if (!sp) return prev;
        const updated: LineShape = {
          ...last,
          points: [sp.x, sp.y, pos.x, pos.y]
        };
        next[idx] = updated;
      } else if (tool === 'polyline') {
        const updated: LineShape = {
          ...last,
          points: [...last.points.slice(0, -2), pos.x, pos.y]
        };
        next[idx] = updated;
      }
      return next;
    });
  };

  const handleMouseUp = () => {
    if (tool === 'polyline' && startPointRef.current) {
      // keep polyline open; click again to extend
    } else {
      setIsDrawing(false);
      startPointRef.current = null;
    }
  };

  const handleStageDblClick = () => {
    if (tool === 'polyline') {
      setIsDrawing(false);
      startPointRef.current = null;
    }
  };

  const handleDragShape = (id: string, dx: number, dy: number) => {
    setShapes(prev =>
      prev.map(s => {
        if (s.id !== id) return s;
        if (s.kind === 'node-circle') {
          return { ...s, x: dx, y: dy };
        }
        if (s.kind === 'node-square') {
          return { ...s, x: dx, y: dy };
        }
        if (s.kind === 'text') {
          return { ...s, x: dx, y: dy };
        }
        if (s.kind === 'table') {
          return { ...s, x: dx, y: dy };
        }
        return s;
      })
    );
  };

  const attachTransformer = (nodeId: string | null) => {
    const stage = stageRef.current;
    const tr = trRef.current;
    if (!stage || !tr) return;
    if (!nodeId) {
      tr.nodes([]);
      return;
    }
    const node = stage.findOne(`#${nodeId}`);
    if (node) {
      tr.nodes([node as any]);
    } else {
      tr.nodes([]);
    }
  };

  const handleExportPDF = () => {
    const stage = stageRef.current;
    if (!stage) return;

    const dataURL = stage.toDataURL({ pixelRatio: 2 }); // sharper export[web:93]
    const pdf = new jsPDF('l', 'px', [stage.width(), stage.height()]); // landscape[web:94][web:95]
    pdf.addImage(
      dataURL,
      'PNG',
      0,
      0,
      stage.width(),
      stage.height()
    );
    pdf.save(`quarry-chart-${worksId}.pdf`);
  };

  const saveQuarryChart = async () => {
    try {
      const shapesToSave = filteredShapes;
      
      // Check if chart already exists for this work
      const { data: existing, error: fetchError } = await supabase
        .schema('estimate')
        .from('quarry_charts')
        .select('id')
        .eq('works_id', worksId)
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Error checking existing chart:', fetchError);
        return;
      }

      if (existing) {
        // Update existing
        const { error: updateError } = await supabase
          .schema('estimate')
          .from('quarry_charts')
          .update({
            title,
            shapes: shapesToSave,
            updated_at: new Date().toISOString()
          })
          .eq('works_id', worksId);

        if (updateError) {
          console.error('Error updating quarry chart:', updateError);
        }
      } else {
        // Insert new
        const { error: insertError } = await supabase
          .schema('estimate')
          .from('quarry_charts')
          .insert([{
            works_id: worksId,
            title,
            shapes: shapesToSave,
            created_at: new Date().toISOString()
          }]);

        if (insertError) {
          console.error('Error saving quarry chart:', insertError);
        }
      }
    } catch (error) {
      console.error('Error in saveQuarryChart:', error);
    }
  };

  const handleInternalClose = async () => {
    setIsDrawing(false);
    // Save before closing
    await saveQuarryChart();
    onClose();
  };

  React.useEffect(() => {
    attachTransformer(selectedId);
  }, [selectedId, filteredShapes.length]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-11/12 max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Quarry Chart / Route Diagram
            </h2>
            <p className="text-xs text-gray-500">
              Draw quarry routes with freehand lines, straight segments, nodes and text. Work ID: {worksId}
            </p>
          </div>
          <button
            onClick={handleInternalClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls */}
        <div className="px-6 py-3 border-b bg-gray-50 flex flex-wrap gap-4 items-end">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Chart Title
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1 text-xs w-60"
            />
          </div>

          {/* Grid size */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Grid (rows × cols)
            </label>
            <div className="flex items-center gap-1 text-xs">
              <input
                type="number"
                min={10}
                max={60}
                value={rows}
                onChange={e => setRows(Number(e.target.value || 10))}
                className="border border-gray-300 rounded-md px-2 py-1 w-16"
              />
              <span>×</span>
              <input
                type="number"
                min={20}
                max={100}
                value={cols}
                onChange={e => setCols(Number(e.target.value || 20))}
                className="border border-gray-300 rounded-md px-2 py-1 w-16"
              />
            </div>
          </div>

          {/* Tools */}
          <div className="flex flex-col gap-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Tool
            </label>
            <div className="flex flex-wrap gap-1 text-xs">
              <button
                onClick={() => setTool('select')}
                className={`px-3 py-1 rounded-md border ${
                  tool === 'select'
                    ? 'bg-slate-800 text-white border-slate-900'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                Select / Move
              </button>
              <button
                onClick={() => setTool('free-line')}
                className={`px-3 py-1 rounded-md border ${
                  tool === 'free-line'
                    ? 'bg-emerald-600 text-white border-emerald-700'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                Free line
              </button>
              <button
                onClick={() => setTool('straight-line')}
                className={`px-3 py-1 rounded-md border ${
                  tool === 'straight-line'
                    ? 'bg-emerald-600 text-white border-emerald-700'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                Straight line
              </button>
              <button
                onClick={() => setTool('polyline')}
                className={`px-3 py-1 rounded-md border ${
                  tool === 'polyline'
                    ? 'bg-emerald-600 text-white border-emerald-700'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                Route (polyline)
              </button>
              <button
                onClick={() => setTool('arrow')}
                className={`px-3 py-1 rounded-md border ${
                  tool === 'arrow'
                    ? 'bg-emerald-600 text-white border-emerald-700'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                Arrow →
              </button>
              <button
                onClick={() => setTool('node-circle')}
                className={`px-3 py-1 rounded-md border ${
                  tool === 'node-circle'
                    ? 'bg-blue-600 text-white border-blue-700'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                Node ●
              </button>
              <button
                onClick={() => setTool('node-square')}
                className={`px-3 py-1 rounded-md border ${
                  tool === 'node-square'
                    ? 'bg-blue-600 text-white border-blue-700'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                Depot ■
              </button>
              <button
                onClick={() => setTool('text')}
                className={`px-3 py-1 rounded-md border ${
                  tool === 'text'
                    ? 'bg-sky-600 text-white border-sky-700'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                Text label
              </button>
              <button
                onClick={() => setTool('table')}
                className={`px-3 py-1 rounded-md border ${
                  tool === 'table'
                    ? 'bg-amber-600 text-white border-amber-700'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                Table ⊞
              </button>
              <button
                onClick={() => setTool('eraser')}
                className={`px-3 py-1 rounded-md border ${
                  tool === 'eraser'
                    ? 'bg-rose-600 text-white border-rose-700'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                Eraser
              </button>
            </div>
          </div>

          {/* Text config */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Text to place
            </label>
            <input
              type="text"
              value={textLabel}
              onChange={e => setTextLabel(e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1 text-xs w-48"
              placeholder="Village, quarry, distance..."
            />
          </div>

          {/* Table config */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Table size (rows × cols)
            </label>
            <div className="flex items-center gap-1 text-xs">
              <input
                type="number"
                min={1}
                max={10}
                value={tableRows}
                onChange={e => setTableRows(Number(e.target.value || 1))}
                className="border border-gray-300 rounded-md px-2 py-1 w-14"
              />
              <span>×</span>
              <input
                type="number"
                min={1}
                max={10}
                value={tableCols}
                onChange={e => setTableCols(Number(e.target.value || 1))}
                className="border border-gray-300 rounded-md px-2 py-1 w-14"
              />
            </div>
          </div>

          {/* Style */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Stroke
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={strokeColor}
                onChange={e => setStrokeColor(e.target.value)}
                className="w-8 h-6 border border-gray-300 rounded"
              />
              <input
                type="number"
                min={1}
                max={8}
                value={strokeWidth}
                onChange={e => setStrokeWidth(Number(e.target.value || 1))}
                className="border border-gray-300 rounded-md px-2 py-1 text-xs w-14"
              />
            </div>
          </div>

          {/* Undo / Export */}
          <div className="ml-auto flex flex-col gap-1 items-end">
            <button
              onClick={handleUndo}
              disabled={history.length === 0}
              className="px-3 py-1 rounded-md border border-gray-300 text-xs font-medium text-gray-700 bg-white hover:bg-gray-100 disabled:opacity-40"
            >
              Undo
            </button>
            <button
              onClick={handleExportPDF}
              className="px-3 py-1 rounded-md border border-emerald-600 text-xs font-medium text-emerald-700 bg-white hover:bg-emerald-50"
            >
              Export PDF
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="px-6 pt-3 flex-1 overflow-auto">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">
            {title}
          </h3>

          <div className="inline-block bg-white border border-gray-300 rounded-md shadow-inner">
            <Stage
              width={width}
              height={height}
              ref={stageRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onDblClick={handleStageDblClick}
            >
              <Layer>
                {/* grid */}
                {Array.from({ length: rows + 1 }).map((_, i) => (
                  <Line
                    key={`h-${i}`}
                    points={[0, i * 20, width, i * 20]}
                    stroke="#e5e7eb"
                    strokeWidth={1}
                  />
                ))}
                {Array.from({ length: cols + 1 }).map((_, i) => (
                  <Line
                    key={`v-${i}`}
                    points={[i * 20, 0, i * 20, height]}
                    stroke="#e5e7eb"
                    strokeWidth={1}
                  />
                ))}

                {/* shapes for this work */}
                {filteredShapes.map(s => {
                  if (s.kind === 'line') {
                    return (
                      <Line
                        key={s.id}
                        id={s.id}
                        points={s.points}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        lineCap="round"
                        lineJoin="round"
                        draggable={tool === 'select'}
                        onClick={() => setSelectedId(s.id)}
                        onDragEnd={e => {
                          const dx = e.target.x();
                          const dy = e.target.y();
                          setShapes(prev =>
                            prev.map(sh => {
                              if (sh.id !== s.id || sh.kind !== 'line') return sh;
                              const movedPoints: number[] = [];
                              for (let i = 0; i < (sh as LineShape).points.length; i += 2) {
                                movedPoints.push(
                                  (sh as LineShape).points[i] + dx,
                                  (sh as LineShape).points[i + 1] + dy
                                );
                              }
                              return { ...(sh as LineShape), points: movedPoints };
                            })
                          );
                          e.target.position({ x: 0, y: 0 });
                        }}
                      />
                    );
                  }
                  if (s.kind === 'arrow') {
                    return (
                      <Arrow
                        key={s.id}
                        id={s.id}
                        points={s.points}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        fill={strokeColor}
                        pointerLength={10}
                        pointerWidth={10}
                        draggable={tool === 'select'}
                        onClick={() => setSelectedId(s.id)}
                        onDragEnd={e => {
                          const dx = e.target.x();
                          const dy = e.target.y();
                          setShapes(prev =>
                            prev.map(sh => {
                              if (sh.id !== s.id || sh.kind !== 'arrow') return sh;
                              const movedPoints: number[] = [];
                              for (let i = 0; i < (sh as ArrowShape).points.length; i += 2) {
                                movedPoints.push(
                                  (sh as ArrowShape).points[i] + dx,
                                  (sh as ArrowShape).points[i + 1] + dy
                                );
                              }
                              return { ...(sh as ArrowShape), points: movedPoints };
                            })
                          );
                          e.target.position({ x: 0, y: 0 });
                        }}
                      />
                    );
                  }
                  if (s.kind === 'node-circle') {
                    return (
                      <Circle
                        key={s.id}
                        id={s.id}
                        x={s.x}
                        y={s.y}
                        radius={s.radius}
                        fill={strokeColor}
                        draggable={tool === 'select'}
                        onClick={() => setSelectedId(s.id)}
                        onDragEnd={e =>
                          handleDragShape(s.id, e.target.x(), e.target.y())
                        }
                      />
                    );
                  }
                  if (s.kind === 'node-square') {
                    return (
                      <Rect
                        key={s.id}
                        id={s.id}
                        x={s.x - s.size / 2}
                        y={s.y - s.size / 2}
                        width={s.size}
                        height={s.size}
                        fill={strokeColor}
                        draggable={tool === 'select'}
                        onClick={() => setSelectedId(s.id)}
                        onDragEnd={e =>
                          handleDragShape(s.id, e.target.x() + s.size / 2, e.target.y() + s.size / 2)
                        }
                      />
                    );
                  }
                  if (s.kind === 'text') {
                    return (
                      <Text
                        key={s.id}
                        id={s.id}
                        x={s.x}
                        y={s.y}
                        text={s.text}
                        fontSize={11}
                        fontFamily="monospace"
                        fill={strokeColor}
                        draggable={tool === 'select'}
                        onClick={() => setSelectedId(s.id)}
                        onDragEnd={e =>
                          handleDragShape(s.id, e.target.x(), e.target.y())
                        }
                      />
                    );
                  }
                  if (s.kind === 'table') {
                    const tableElements: React.ReactNode[] = [];
                    for (let r = 0; r < s.rows; r++) {
                      for (let c = 0; c < s.cols; c++) {
                        const cellX = s.x + c * s.cellWidth;
                        const cellY = s.y + r * s.cellHeight;
                        tableElements.push(
                          <Rect
                            key={`${s.id}-cell-${r}-${c}`}
                            x={cellX}
                            y={cellY}
                            width={s.cellWidth}
                            height={s.cellHeight}
                            stroke={strokeColor}
                            strokeWidth={1}
                            fill="white"
                          />
                        );
                        if (s.data[r] && s.data[r][c]) {
                          tableElements.push(
                            <Text
                              key={`${s.id}-text-${r}-${c}`}
                              x={cellX + 5}
                              y={cellY + s.cellHeight / 2 - 6}
                              text={s.data[r][c]}
                              fontSize={10}
                              fill={strokeColor}
                            />
                          );
                        }
                      }
                    }
                    return (
                      <React.Fragment key={s.id}>
                        {tableElements}
                      </React.Fragment>
                    );
                  }
                  return null;
                })}

                <Transformer ref={trRef} rotateEnabled enabledAnchors={['top-left','top-right','bottom-left','bottom-right']} />
              </Layer>
            </Stage>
          </div>

          <p className="mt-2 text-[11px] text-gray-500">
            Use free lines or straight lines for roads and haul routes, nodes for quarries/depots, and text labels for village names and distances.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t bg-gray-50 flex justify-between">
          <button
            onClick={() => {
              snapshot();
              setShapes(prev => prev.filter(s => s.worksId !== worksId));
              setSelectedId(null);
            }}
            className="px-4 py-1.5 rounded-md border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-100"
          >
            Clear this work
          </button>
          <button
            onClick={handleInternalClose}
            className="px-4 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuarryChart;
