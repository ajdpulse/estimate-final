
import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import {
  Work,
  SubWork,
  SubworkItem,
  ItemMeasurement,
  ItemLead,
  ItemMaterial,
  RecapCalculations,
  TaxEntry,
} from "../../types";

import LoadingSpinner from "../common/LoadingSpinner";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

import {
  X,
  Download,
  Settings,
  Eye,
  Printer,
  Save,
  Plus,
  Trash2,
  Calendar,
  FileText,
  Loader2,
} from "lucide-react";

import WorksRecapSheet from "../WorksRecapSheet";
import { EstimateRateAnalysis } from "./EstimateRateAnalysis";
import { EstimateLeadStatement } from "./EstimateLeadStatement";
import { EstimateQuarryChart } from "./EstimateQuarryChart";

interface RoyaltyMeasurement {
  sr_no: number;
  subwork_id: number;
  subwork_item_id: number;
  measurement: number;
  metal_factor: number;
  hb_metal: number;
  murum_factor: number;
  murum: number;
  sand_factor: number;
  sand: number;
}

interface TestingMeasurement {
  sr_no: number;
  subwork_id: number;
  subwork_item_id: number;
  quantity: number;
  description: string;
  required_tests: number;
  total: number;
}

interface RateAnalysis {
  sr_no: number;
  subwork_item_id: number;
  entries: any[];
  created_at: string;
}

interface LeadStatementItem {
  id: string;
  works_id: string;
  sr_no: number;
  material: string;
  material_type?: string;
  reference: string;
  lead_in_km: number;
  lead_charges: number;
  total_rate: number;
  unit: string;
  unit_from_lead_chart?: string;
}

interface EstimateData {
  work: Work;
  subworks: SubWork[];
  subworkItems: Record<string, SubworkItem[]>;
  measurements: Record<string, ItemMeasurement[]>;
  leads: Record<string, ItemLead[]>;
  materials: Record<string, ItemMaterial[]>;
  royaltyMeasurements: Record<string, RoyaltyMeasurement[]>;
  testingMeasurements: Record<string, TestingMeasurement[]>;
  rateAnalysis: Record<string, RateAnalysis>;
  subworkTotals: Record<string, { regular: number; royalty: number; testing: number }>;
  leadStatements: LeadStatementItem[];
}

interface DocumentSettings {
  header: {
    zilla: string;
    division: string;
    subDivision: string;
    title: string;
  };
  footer: {
    preparedBy: string;
    designation: string;
  };
  pageSettings: {
    showPageNumbers: boolean;
    pageNumberPosition: "top" | "bottom";
    marginTop: number;
    marginBottom: number;
  };
}

interface EstimatePDFGeneratorProps {
  workId: string;
  isOpen: boolean;
  onClose: () => void;
  savedCalculations?: RecapCalculations | null;
  savedTaxes?: TaxEntry[] | null;
}

interface Photo {
  id: string;
  photo_url: string;
  photo_name?: string;
  description?: string;
}

export const EstimatePDFGenerator: React.FC<EstimatePDFGeneratorProps> = ({
  workId,
  isOpen,
  onClose,
  savedCalculations,
  savedTaxes,
}) => {
  const user = useAuth();

  const [loading, setLoading] = useState(false);
  const [estimateData, setEstimateData] = useState<EstimateData | null>(null);

  const [showPreview, setShowPreview] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [itemRatesMap, setItemRatesMap] = React.useState<Record<string, ItemRate[]>>({});
  const [currentPage, setCurrentPage] = useState(1);

  const printRef = useRef<HTMLDivElement | null>(null);

  const [photosMap, setPhotosMap] = useState<Record<string, Photo[]>>({});
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  const [documentSettings, setDocumentSettings] = useState<DocumentSettings>({
    header: {
      zilla: "",
      division: "",
      subDivision: "",
      title: "ESTIMATE",
    },
    footer: {
      preparedBy: "",
      designation: "",
    },
    pageSettings: {
      showPageNumbers: true,
      pageNumberPosition: "bottom",
      marginTop: 20,
      marginBottom: 20,
    },
  });

  React.useEffect(() => {
    if (isOpen && workId) {
      fetchEstimateData();
    }
  }, [isOpen, workId]);

  const fetchEstimateData = async () => {
    try {
      setLoading(true);

      // 1️⃣ Fetch work details (only existing columns)
      const { data: work, error: workError } = await supabase
        .schema("estimate")
        .from("works")
        .select("works_id, work_name, division, sub_division, fund_head, major_head, minor_head, service_head, departmental_head, sanctioning_authority, total_estimated_cost, village, grampanchayat, taluka")
        .eq("works_id", workId)
        .single();

      if (workError) throw workError;

      if (work) {
        setDocumentSettings((prev) => ({
          ...prev,
          header: {
            ...prev.header,
            division: work.division || "",
            subDivision: work.sub_division || "",
          },
        }));
      }

      // 2️⃣ Fetch all subworks in one call
      const { data: subworks, error: subworksError } = await supabase
        .schema("estimate")
        .from("subworks")
        .select("subworks_id, subworks_name, works_id")
        .eq("works_id", workId)
        .order("sr_no");

      if (subworksError) throw subworksError;

      if (!subworks?.length) {
        setEstimateData({
          work,
          subworks: [],
          subworkItems: {},
          measurements: {},
          leads: {},
          materials: {},
          royaltyMeasurements: {},
          testingMeasurements: {},
          rateAnalysis: {},
          subworkTotals: {},
          leadStatements: [],
        });
        return;
      }

      // 3️⃣ Fetch all subwork_items (only needed columns except rate related)
      const subworkIds = subworks.map((sw) => sw.subworks_id).filter(Boolean);
      const { data: allItems, error: itemsError } = await supabase
        .schema("estimate")
        .from("subwork_items")
        .select("sr_no, subwork_id, description_of_item, ssr_quantity, ssr_unit, ssr_rate, total_item_amount, category, item_number")
        .in("subwork_id", subworkIds)
        .order("sr_no");

      if (itemsError) throw itemsError;

      // 4️⃣ Fetch all rates for subwork_items from item_rates
      const itemSrNos = allItems.map((it) => it.sr_no).filter(Boolean);
      const { data: allRates, error: rateError } = await supabase
        .schema("estimate")
        .from("item_rates")
        .select("subwork_item_sr_no, description, ssr_unit, rate, ssr_quantity, rate_total_amount")
        .in("subwork_item_sr_no", itemSrNos);

      if (rateError) throw rateError;

      // 5️⃣ Build subworkItems: each item gets a 'rates' array (may be empty)
      const subworkItems: Record<string, SubworkItem[]> = {};
      subworks.forEach((sw) => {
        subworkItems[sw.subworks_id] = (allItems || [])
          .filter(it => it.subwork_id === sw.subworks_id)
          .map(item => ({
            ...item,
            rates: (allRates || []).filter(rt => rt.subwork_item_sr_no === item.sr_no)
          }));
      });

      // 6️⃣ Fetch all measurements for these items
      const { data: allMeasurements, error: measureError } = await supabase
        .schema("estimate")
        .from("item_measurements")
        .select("sr_no, subwork_item_id, description_of_items, no_of_units, length, width_breadth, height_depth, calculated_quantity, unit")
        .in("subwork_item_id", itemSrNos);

      if (measureError) throw measureError;

      // 7️⃣ Map measurements using sr_no
      const measurements: Record<string, ItemMeasurement[]> = {};
      allItems.forEach(item => {
        const related = (allMeasurements || []).filter(
          m => m.subwork_item_id === item.sr_no
        );
        measurements[item.sr_no] = related;
      });

      // 8️⃣ Fetch royalty measurements
      const subworkSrNos = subworks.map(sw => sw.sr_no).filter(Boolean);
      const { data: allRoyaltyMeasurements, error: royaltyError } = await supabase
        .schema("estimate")
        .from("royalty_measurements")
        .select("*")
        .in("subwork_id", subworkSrNos);

      if (royaltyError) console.error("Error fetching royalty measurements:", royaltyError);

      const royaltyMeasurements: Record<string, RoyaltyMeasurement[]> = {};
      allItems.forEach(item => {
        const related = (allRoyaltyMeasurements || []).filter(
          r => r.subwork_item_id === item.sr_no
        );
        royaltyMeasurements[item.sr_no] = related;
      });

      // 9️⃣ Fetch testing measurements
      const { data: allTestingMeasurements, error: testingError } = await supabase
        .schema("estimate")
        .from("testing_measurements")
        .select("*")
        .in("subwork_item_id", itemSrNos);

      if (testingError) console.error("Error fetching testing measurements:", testingError);

      const testingMeasurements: Record<string, TestingMeasurement[]> = {};
      allItems.forEach(item => {
        const related = (allTestingMeasurements || []).filter(
          t => t.subwork_item_id === item.sr_no
        );
        testingMeasurements[item.sr_no] = related;
      });

      // 10️⃣ Fetch rate analysis for all items
      const { data: allRateAnalysis, error: rateAnalysisError } = await supabase
        .schema("estimate")
        .from("item_rate_analysis")
        .select("*")
        .in("subwork_item_id", itemSrNos)
        .order("created_at", { ascending: false });

      if (rateAnalysisError) console.error("Error fetching rate analysis:", rateAnalysisError);

      const rateAnalysis: Record<string, RateAnalysis> = {};
      allItems.forEach(item => {
        const related = (allRateAnalysis || []).find(
          ra => ra.subwork_item_id === item.sr_no
        );
        if (related) {
          rateAnalysis[item.sr_no] = related;
        }
      });

      // 11️⃣ Calculate subwork totals
      const subworkIdToSrNo: Record<string, number> = {};
      const subworkSrNoToId: Record<number, string> = {};
      subworks.forEach(sw => {
        subworkIdToSrNo[sw.subworks_id] = sw.sr_no;
        subworkSrNoToId[sw.sr_no] = sw.subworks_id;
      });

      const royaltyTotalsPerSubwork: Record<string, { hb_metal: number; murum: number; sand: number }> = {};
      (allRoyaltyMeasurements || []).forEach(measurement => {
        const subworkSrNo = measurement.subwork_id;
        const subworkId = subworkSrNoToId[subworkSrNo];
        if (!subworkId) return;

        if (!royaltyTotalsPerSubwork[subworkId]) {
          royaltyTotalsPerSubwork[subworkId] = { hb_metal: 0, murum: 0, sand: 0 };
        }
        royaltyTotalsPerSubwork[subworkId].hb_metal += Number(measurement.hb_metal) || 0;
        royaltyTotalsPerSubwork[subworkId].murum += Number(measurement.murum) || 0;
        royaltyTotalsPerSubwork[subworkId].sand += Number(measurement.sand) || 0;
      });

      const testingTotalsPerItem: Record<number, number> = {};
      (allTestingMeasurements || []).forEach(measurement => {
        testingTotalsPerItem[measurement.subwork_item_id] = Number(measurement.required_tests) || 0;
      });

      const subworkTotals: Record<string, { regular: number; royalty: number; testing: number }> = {};
      subworkIds.forEach(id => {
        subworkTotals[id] = { regular: 0, royalty: 0, testing: 0 };
      });

      allItems.forEach(item => {
        const subworkId = item.subwork_id;
        const category = item.category;
        const itemRates = (allRates || []).filter(r => r.subwork_item_sr_no === item.sr_no);

        if (!subworkTotals[subworkId]) {
          subworkTotals[subworkId] = { regular: 0, royalty: 0, testing: 0 };
        }

        let totalItemAmt = 0;

        if (category === 'royalty' && royaltyTotalsPerSubwork[subworkId]) {
          const royaltyData = royaltyTotalsPerSubwork[subworkId];
          itemRates.forEach(rate => {
            const rateDesc = (rate.description || '').toLowerCase();
            let quantity = 0;
            if (rateDesc.includes('metal')) {
              quantity = royaltyData.hb_metal;
            } else if (rateDesc.includes('murum')) {
              quantity = royaltyData.murum;
            } else if (rateDesc.includes('sand')) {
              quantity = royaltyData.sand;
            }
            totalItemAmt += quantity * Number(rate.rate || 0);
          });
          subworkTotals[subworkId].royalty += totalItemAmt;
        } else if (category === 'testing' && item.sr_no && testingTotalsPerItem[item.sr_no]) {
          const testingQty = testingTotalsPerItem[item.sr_no];
          itemRates.forEach(rate => {
            totalItemAmt += testingQty * Number(rate.rate || 0);
          });
          subworkTotals[subworkId].testing += totalItemAmt;
        } else {
          totalItemAmt = itemRates.reduce((sum, rate) => sum + (Number(rate.rate_total_amount) || 0), 0);
          subworkTotals[subworkId].regular += totalItemAmt;
        }
      });

      // Fetch lead statements for the work
      const { data: leadStatements, error: leadStatementsError } = await supabase
        .schema('estimate')
        .from('lead_statements')
        .select('*')
        .eq('works_id', workId)
        .order('sr_no', { ascending: true });

      if (leadStatementsError) {
        console.error('Error fetching lead statements:', leadStatementsError);
      }

      // ✅ Update state with all data
      setEstimateData({
        work,
        subworks,
        subworkItems,
        measurements,
        leads: {},
        materials: {},
        royaltyMeasurements,
        testingMeasurements,
        rateAnalysis,
        subworkTotals,
        leadStatements: leadStatements || [],
      });

    } catch (error) {
      console.error("Error fetching estimate data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDesignPhotos = async (subworkId: string): Promise<Photo[]> => {
    try {
      const { data, error } = await supabase
        .schema('estimate')
        .from('subwork_design_photos')
        .select('*')
        .eq('subwork_id', subworkId)
        .order('created_at', { ascending: true });
      if (error) {
        console.error('Error fetching design photos:', error);
        return [];
      }
      return data || [];
    } catch (error) {
      console.error('Exception fetching design photos:', error);
      return [];
    }
  };

  // Fetch photos for all subworks once estimateData is loaded
  useEffect(() => {
    if (estimateData?.subworks.length) {
      setLoadingPhotos(true);
      Promise.all(
        estimateData.subworks.map(async (subwork) => {
          const photos = await fetchDesignPhotos(subwork.subworks_id);
          return { subworkId: subwork.subworks_id, photos };
        })
      )
        .then((results) => {
          const photoMap: Record<string, Photo[]> = {};
          results.forEach(({ subworkId, photos }) => {
            photoMap[subworkId] = photos;
          });
          setPhotosMap(photoMap);
        })
        .finally(() => setLoadingPhotos(false));
    }
  }, [estimateData]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('hi-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount);
  };

  const calculateTotalEstimate = () => {
    if (!estimateData) return 0;

    let total = 0;
    estimateData.subworks.forEach(subwork => {
      const items = estimateData.subworkItems[subwork.subworks_id] || [];
      items.forEach(item => {
        total += item.total_item_amount || 0;
      });
    });

    return total;
  };

  const generatePDF = async () => {
    if (!printRef.current || !estimateData) return;

    try {
      setLoading(true);

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 10;
      const contentWidth = pageWidth - (margin * 2);
      const contentHeight = pageHeight - (margin * 2);

      // Get all page elements
      const pages = printRef.current.querySelectorAll('.pdf-page');

      for (let i = 0; i < pages.length; i++) {
        if (i > 0) {
          pdf.addPage();
        }

        const pageElement = pages[i] as HTMLElement;
        const canvas = await html2canvas(pageElement, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          width: pageElement.scrollWidth,
          height: pageElement.scrollHeight
        });

        const imgData = canvas.toDataURL('image/png');
        const imgWidth = contentWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        // Add image to PDF
        pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, Math.min(imgHeight, contentHeight));

        // Add page number if enabled
        if (documentSettings.pageSettings.showPageNumbers) {
          const pageNum = i + 1;
          const totalPages = pages.length;
          const pageText = `Page ${pageNum} of ${totalPages}`;

          pdf.setFontSize(10);
          pdf.setTextColor(100);

          if (documentSettings.pageSettings.pageNumberPosition === 'bottom') {
            pdf.text(pageText, pageWidth / 2, pageHeight - 5, { align: 'center' });
          } else {
            pdf.text(pageText, pageWidth / 2, 10, { align: 'center' });
          }
        }
      }

      const fileName = `Estimate_${estimateData.work.works_id}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);

    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setLoading(false);
    }
  };

  const PageHeader: React.FC<{ pageNumber?: number }> = ({ pageNumber }) => (
    <div className="text-center mb-6 pb-4 border-b-2 border-gray-300">
      <h2 className="text-base font-semibold text-blue-600 mb-1">{documentSettings.header.division}</h2>
      <h3 className="text-sm font-medium text-blue-600 mb-3">{documentSettings.header.subDivision}</h3>
      {pageNumber && documentSettings.pageSettings.showPageNumbers && documentSettings.pageSettings.pageNumberPosition === 'top' && (
        <div className="text-xs text-gray-500">Page {pageNumber}</div>
      )}
    </div>
  );

  const PageFooter: React.FC<{ pageNumber?: number }> = ({ pageNumber }) => (
    <div className="mt-8 pt-4 border-t-2 border-gray-300">
      <div className="flex justify-between items-end">
        <div className="text-left">
          <p className="text-sm font-medium">Prepared By:</p>
          <p className="text-xs mt-2">{documentSettings.footer.preparedBy}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium">{documentSettings.footer.designation}</p>
        </div>
      </div>
      {pageNumber && documentSettings.pageSettings.showPageNumbers && documentSettings.pageSettings.pageNumberPosition === 'bottom' && (
        <div className="text-center text-xs text-gray-500 mt-2">Page {pageNumber}</div>
      )}
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-4 mx-auto p-5 border w-[1112px] max-w-7xl shadow-lg rounded-md bg-white min-h-[90vh]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Generate Estimate Report</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </button>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <Eye className="w-4 h-4 mr-2" />
              {showPreview ? "Hide Preview" : "Show Preview"}
            </button>
            <button
              onClick={generatePDF}
              disabled={loading}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Generate PDF
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              title="Close"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
            <h4 className="text-md font-medium text-gray-900 mb-4">Document Settings</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h5 className="text-sm font-medium text-gray-700 mb-2">Header Settings</h5>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Division"
                    value={documentSettings.header.division}
                    onChange={(e) => setDocumentSettings(prev => ({
                      ...prev,
                      header: { ...prev.header, division: e.target.value }
                    }))}
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                  />
                  <input
                    type="text"
                    placeholder="Sub Division"
                    value={documentSettings.header.subDivision}
                    onChange={(e) => setDocumentSettings(prev => ({
                      ...prev,
                      header: { ...prev.header, subDivision: e.target.value }
                    }))}
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                  />
                </div>
              </div>
              <div>
                <h5 className="text-sm font-medium text-gray-700 mb-2">Footer Settings</h5>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Prepared By"
                    value={documentSettings.footer.preparedBy}
                    onChange={(e) => setDocumentSettings(prev => ({
                      ...prev,
                      footer: { ...prev.footer, preparedBy: e.target.value }
                    }))}
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                  />
                  <input
                    type="text"
                    placeholder="Designation"
                    value={documentSettings.footer.designation}
                    onChange={(e) => setDocumentSettings(prev => ({
                      ...prev,
                      footer: { ...prev.footer, designation: e.target.value }
                    }))}
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                  />
                </div>
              </div>
              <div>
                <h5 className="text-sm font-medium text-gray-700 mb-2">Page Settings</h5>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={documentSettings.pageSettings.showPageNumbers}
                      onChange={(e) => setDocumentSettings(prev => ({
                        ...prev,
                        pageSettings: { ...prev.pageSettings, showPageNumbers: e.target.checked }
                      }))}
                      className="mr-2"
                    />
                    <span className="text-xs">Show Page Numbers</span>
                  </label>
                  <select
                    value={documentSettings.pageSettings.pageNumberPosition}
                    onChange={(e) => setDocumentSettings(prev => ({
                      ...prev,
                      pageSettings: { ...prev.pageSettings, pageNumberPosition: e.target.value as 'top' | 'bottom' }
                    }))}
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                  >
                    <option value="bottom">Page Numbers at Bottom</option>
                    <option value="top">Page Numbers at Top</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {loading && !estimateData && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Loading estimate data...</span>
          </div>
        )}

        {estimateData && showPreview && (
          <div className="border border-gray-200 rounded-lg overflow-hidden max-h-[70vh] overflow-y-auto">
            <div ref={printRef} className="bg-white">

              {/* Page 1: Cover Page */}
              <div className="pdf-page bg-white p-8 min-h-[297mm] flex flex-col" style={{ fontFamily: 'Arial, sans-serif', pageBreakAfter: 'always' }}>
                <PageHeader pageNumber={1} />

                <div className="flex-1 flex flex-col justify-center">
                  <div className="text-center border-2 border-black p-8">
                    <h1 className="text-2xl font-bold underline mb-8">{documentSettings.header.title}</h1>

                    <div className="mb-6">
                      <p className="text-lg font-semibold mb-2">{estimateData.work.work_name}</p>
                      <p className="text-base">
                        {estimateData.work.taluka && `Tah: ${estimateData.work.taluka}`}
                        {estimateData.work.taluka && estimateData.work.district && ', '}
                        {estimateData.work.district && `Dist:- ${estimateData.work.district}`}
                        {!estimateData.work.taluka && !estimateData.work.district && 'Tah: Chandrapur, Dist:- Chandrapur'}
                      </p>
                    </div>

                    <div className="mb-8">
                      <p className="text-lg mb-2">( 2024-25)</p>
                      <p className="text-xl font-bold">ESTIMATED COST. Rs. {(estimateData.work.total_estimated_cost || calculateTotalEstimate()).toLocaleString('hi-IN')}</p>
                    </div>

                    <div className="mt-12">
                      <p className="text-lg font-semibold mb-6">OFFICE OF THE</p>
                      <div className="flex justify-center space-x-8">
                        <div className="border border-black p-4 text-center min-w-[200px]">
                          <p className="text-sm">{estimateData.work.sub_division}</p>
                          <p className="text-sm">{estimateData.work.sub_division ? '' : 'Division, '}
                            {estimateData.work.district || 'Chandrapur'}.
                          </p>
                        </div>
                        <div className="border border-black p-4 text-center min-w-[200px]">
                          <p className="font-medium">{estimateData.work.sanctioning_authority || 'Executive Engineer'}</p>
                          <p className="text-sm">{estimateData.work.division}</p>
                          <p className="text-sm">Z.P, {estimateData.work.district || 'Chandrapur'}.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <PageFooter pageNumber={1} />
              </div>

              {/* Page 2: Details Page */}
              <div className="pdf-page bg-white p-8 min-h-[297mm] flex flex-col" style={{ fontFamily: 'Arial, sans-serif', pageBreakAfter: 'always' }}>
                <PageHeader pageNumber={2} />

                <div className="flex-1">
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-bold underline">{documentSettings.header.title}</h3>
                    <p className="mt-2">{estimateData.work.work_name}</p>
                    <p>Tah: Chandrapur, Dist:- Chandrapur</p>
                  </div>

                  <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
                    <div className="space-y-3">
                      <div className="flex">
                        <span className="w-40 font-medium">Name of Division</span>
                        <span className="mr-2">:-</span>
                        <span>{estimateData.work.division || '-'}</span>
                      </div>
                      <div className="flex">
                        <span className="w-40 font-medium">Name of Sub- Division</span>
                        <span className="mr-2">:-</span>
                        <span>{estimateData.work.sub_division || '-'}</span>
                      </div>
                      <div className="flex">
                        <span className="w-40 font-medium">Fund Head</span>
                        <span className="mr-2">:-</span>
                        <span>{estimateData.work.fund_head || '-'}</span>
                      </div>
                      <div className="flex">
                        <span className="w-40 font-medium">Major Head</span>
                        <span className="mr-2">:-</span>
                        <span className="italic">{estimateData.work.major_head || '-'}</span>
                      </div>
                      <div className="flex">
                        <span className="w-40 font-medium">Minor Head</span>
                        <span className="mr-2">:-</span>
                        <span>{estimateData.work.minor_head || '-'}</span>
                      </div>
                      <div className="flex">
                        <span className="w-40 font-medium">Service Head</span>
                        <span className="mr-2">:-</span>
                        <span>{estimateData.work.service_head || '-'}</span>
                      </div>
                      <div className="flex">
                        <span className="w-40 font-medium">Departmental Head</span>
                        <span className="mr-2">:-</span>
                        <span>{estimateData.work.departmental_head || '-'}</span>
                      </div>
                    </div>
                    <div>
                      {/* Additional content can be added here if needed */}
                    </div>
                  </div>

                  <div className="mb-8">
                    <div className="flex justify-between items-center mb-6 text-lg">
                      <span className="font-bold">Estimated Cost Rs.</span>
                      <span className="font-bold">{(estimateData.work.total_estimated_cost || calculateTotalEstimate()).toLocaleString('hi-IN')}</span>
                    </div>

                    <div className="grid grid-cols-1 gap-4 text-sm">
                      <div className="space-y-2">
                        <div className="flex">
                          <span className="w-48 font-medium">Techincal Approval No.</span>
                          <span className="mr-2">:-</span>
                          <span>-</span>
                        </div>
                        <div className="flex">
                          <span className="w-48 font-medium">Technically Sanctioned under</span>
                          <span className="mr-2">:-</span>
                          <span>-</span>
                        </div>
                        <div className="flex">
                          <span className="w-48 font-medium">Estimate Prepared By</span>
                          <span className="mr-2">:-</span>
                          <span>{documentSettings.footer.preparedBy}</span>
                        </div>
                        <div className="flex">
                          <span className="w-48 font-medium">Checked By.</span>
                          <span className="mr-2">:-</span>
                          <span>-</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="text-center mb-6">
                    <h4 className="font-bold text-base">General Description</h4>
                    <p className="mt-2">------------------------- Attached Separately -------------------------</p>
                  </div>
                </div>

                <PageFooter pageNumber={2} />
              </div>

              {/* Page 3: Recapitulation Sheet */}
              <div className="pdf-page bg-white p-8 min-h-[297mm] flex flex-col" style={{ fontFamily: 'Arial, sans-serif', pageBreakAfter: 'always' }}>
                <PageHeader pageNumber={3} />

                <div className="flex-1">
                  <div className="text-center mb-6">
                    <p className="text-sm">Fund Head :- {estimateData.work.fund_head || 'SBM (G.) Phase-II & 15th Finance Commission'}</p>
                    <p className="text-sm font-semibold">NAME OF WORK: {estimateData.work.work_name}</p>
                    <p className="text-sm font-semibold">Village: {estimateData.work.village}</p>
                    <p className="text-sm font-semibold">GP : {estimateData.work.grampanchayat}</p>
                    <p className="text-sm font-semibold">Tah : {estimateData.work.taluka}</p>
                    <p className="text-sm">District :- Chandrapur</p>
                    <h3 className="text-lg font-bold mt-4">GENERAL ABSTRACT</h3>
                  </div>

                  <WorksRecapSheet
                    workId={workId}
                    savedCalculations={savedCalculations ?? null}
                    savedTaxes={savedTaxes ?? null}
                    readonly={true}
                  />

                </div>

                <PageFooter pageNumber={3} />
              </div>

              {/* Sub-work Detail Pages: Abstract -> Measurement(s) -> Photos (per subwork) */}
              {(() => {
                // pageNumber used for measurement/photo pages; start after cover/details/recap pages
                let pageNumber = 4;

                return estimateData.subworks.map((subwork, subworkIndex) => {
                  const items = estimateData.subworkItems[subwork.subworks_id] || [];
                  if (items.length === 0) return null;

                  // Abstract page (kept identical to original abstract rendering)
                  const abstractPage = (
                    <div key={`abstract-${subwork.subworks_id}`} className="pdf-page bg-white p-8 min-h-[297mm] flex flex-col" style={{ fontFamily: 'Arial, sans-serif', pageBreakAfter: 'always' }}>
                      <PageHeader pageNumber={(() => {
                        // Preserve original page number calculation for abstract
                        let pageNum = 4;
                        estimateData.subworks.forEach((sw, idx) => {
                          if (idx <= subworkIndex) {
                            const swItems = estimateData.subworkItems[sw.subworks_id] || [];
                            const hasAnyMeasurements = swItems.some(item => {
                              const itemMeasurements = estimateData.measurements[item.sr_no] || [];
                              return itemMeasurements.length > 0;
                            });
                            if (hasAnyMeasurements && idx < subworkIndex) pageNum++;
                          }
                        });
                        return pageNum + subworkIndex;
                      })()} />

                      {/* Abstract Pages for Each Subwork (unchanged content) */}
                      <div className="flex-1">
                        <div className="text-center mb-6">
                          <p className="text-sm">Fund Head :- {estimateData.work.fund_head || '-'}</p>
                          <p className="text-sm">Village :- {estimateData.work.village || 'N/A'}, GP :- {estimateData.work.grampanchayat || 'N/A'}, Tah :- {estimateData.work.taluka || 'N/A'}</p>
                          <h3 className="text-lg font-bold mt-4">Sub-work: {subwork.subworks_name}</h3>
                          <h4 className="text-lg font-bold underline">ABSTRACT</h4>
                        </div>

                        {(() => { console.log("📊 Subwork Items data:", items); })()}

                        <table className="w-full border-collapse border border-black text-xs mb-6">
                          <thead>
                            <tr className="bg-gray-100">
                              <th className="border border-black p-2">Sr. No</th>
                              <th className="border border-black p-2">Description of Sub Work</th>
                              <th className="border border-black p-2">Category</th>
                              <th className="border border-black p-2">Quantity</th>
                              <th className="border border-black p-2">Unit</th>
                              <th className="border border-black p-2">Rate (Rs.)</th>
                              <th className="border border-black p-2">Total Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items && items.length > 0 ? (
                              items.map((item, index) => {
                                const rates = item.rates || [];
                                const showMultiRates = rates.length > 0;
                                const isRoyalty = item.category === 'royalty';
                                const isTesting = item.category === 'testing';

                                const royaltyArr =
                                  estimateData.royaltyMeasurements[item.sr_no] || [];

                                const royaltyData = isRoyalty && royaltyArr.length > 0
                                  ? royaltyArr.reduce(
                                    (acc, rm) => ({
                                      hb_metal: acc.hb_metal + Number(rm.hb_metal || 0),
                                      murum: acc.murum + Number(rm.murum || 0),
                                      sand: acc.sand + Number(rm.sand || 0),
                                    }),
                                    { hb_metal: 0, murum: 0, sand: 0 }
                                  )
                                  : null;

                                // Get testing measurements for this item
                                const testingData = isTesting && estimateData.testingMeasurements
                                  ? estimateData.testingMeasurements[item.sr_no] || []
                                  : [];

                                return (
                                  <tr key={item.sr_no || index}>
                                    <td className="border border-black p-2 text-center align-top">
                                      {item.item_number || index + 1}
                                    </td>
                                    <td className="border border-black p-2 align-top">
                                      <div>{item.description_of_item}</div>
                                      {showMultiRates && (
                                        <div className="mt-1 space-y-1">
                                          {rates.map((rate, i) => {
                                            const baseRate = Number(rate.rate || 0);
                                            const adjustedRate =
                                              Math.round(baseRate / 0.05) * 0.05;

                                            return (
                                              <div
                                                key={i}
                                                className="text-xs bg-gray-50 p-2 rounded border-l-2 border-blue-200 mt-1"
                                              >
                                                <div className="font-medium text-gray-700">
                                                  {rate.description}
                                                </div>

                                                <div className="flex items-center justify-between mt-1">
                                                  <span className="text-gray-600">
                                                    ₹{adjustedRate.toLocaleString("hi-IN", {
                                                      maximumFractionDigits: 2,
                                                    })}
                                                  </span>

                                                  {rate.ssr_unit && (
                                                    <span className="text-gray-500">
                                                      per {rate.ssr_unit}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </td>
                                    <td className="border border-black p-2 align-top text-center">
                                      {item.category || '-'}
                                    </td>
                                    <td className="border border-black p-2 align-top text-center">
                                      {showMultiRates ? (
                                        <div className="space-y-1">
                                          {rates.map((rate, i) => {
                                            let quantity = rate.ssr_quantity || 0;

                                            // For royalty items, calculate quantity based on material type
                                            if (isRoyalty && royaltyData) {
                                              const rateDesc = (rate.description || '').toLowerCase();

                                              if (rateDesc.includes('metal')) {
                                                quantity = royaltyData.hb_metal;
                                              } else if (rateDesc.includes('murum')) {
                                                quantity = royaltyData.murum;
                                              } else if (rateDesc.includes('sand')) {
                                                quantity = royaltyData.sand;
                                              } else {
                                                // If description doesn't match, use total
                                                quantity = royaltyData.hb_metal + royaltyData.murum + royaltyData.sand;
                                              }
                                            }

                                            // For testing items, use testing quantity
                                            if (isTesting && testingData.length > 0) {
                                              quantity = testingData.reduce((sum, t) => sum + (t.required_tests || 0), 0);
                                            }

                                            return (
                                              <div key={i} className="bg-gray-50 px-2 py-1 rounded text-xs">
                                                {Number(quantity).toLocaleString("hi-IN", { maximumFractionDigits: 3 })}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : (
                                        item.ssr_quantity !== null && item.ssr_quantity !== undefined
                                          ? Number(item.ssr_quantity).toLocaleString("hi-IN", { maximumFractionDigits: 3 })
                                          : 0
                                      )}
                                    </td>
                                    <td className="border border-black p-2 align-top text-center">
                                      {showMultiRates ? (
                                        <div className="space-y-1">
                                          {rates.map((rate, i) => (
                                            <div key={i} className="bg-gray-50 px-2 py-1 rounded text-xs">
                                              {rate.ssr_unit || item.ssr_unit || "-"}
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        item.ssr_unit || "-"
                                      )}
                                    </td>
                                    <td className="border border-black p-2 align-top text-right">
                                      {showMultiRates ? (
                                        <div className="space-y-1">
                                          {rates.map((rate, i) => {
                                            const baseRate = Number(rate.rate || 0);
                                            const adjustedRate =
                                              Math.round(baseRate / 0.05) * 0.05;

                                            return (
                                              <div key={i} className="bg-gray-50 px-2 py-1 rounded text-xs">
                                                {adjustedRate.toLocaleString("hi-IN", {
                                                  maximumFractionDigits: 3,
                                                })}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : (
                                        (() => {
                                          const baseRate = Number(item.ssr_rate || 0);
                                          const adjustedRate =
                                            Math.round(baseRate / 0.05) * 0.05;

                                          return adjustedRate.toLocaleString("hi-IN", {
                                            maximumFractionDigits: 3,
                                          });
                                        })()
                                      )}
                                    </td>
                                    <td className="border border-black p-2 align-top text-right">
                                      {showMultiRates ? (
                                        <div className="space-y-1">
                                          {rates.map((rate, i) => {
                                            let quantity = rate.ssr_quantity || 0;

                                            // For royalty items, calculate quantity based on material type
                                            if (isRoyalty && royaltyData) {
                                              const rateDesc = (rate.description || '').toLowerCase();

                                              if (rateDesc.includes('metal')) {
                                                quantity = royaltyData.hb_metal;
                                              } else if (rateDesc.includes('murum')) {
                                                quantity = royaltyData.murum;
                                              } else if (rateDesc.includes('sand')) {
                                                quantity = royaltyData.sand;
                                              } else {
                                                // If description doesn't match, use total
                                                quantity = royaltyData.hb_metal + royaltyData.murum + royaltyData.sand;
                                              }
                                            }

                                            // For testing items, use testing quantity
                                            if (isTesting && testingData.length > 0) {
                                              quantity = testingData.reduce((sum, t) => sum + (t.required_tests || 0), 0);
                                            }

                                            const amount = quantity * Number(rate.rate || 0);
                                            return (
                                              <div key={i} className="bg-gray-50 px-2 py-1 rounded text-xs">
                                                {amount.toLocaleString("hi-IN", { maximumFractionDigits: 2 })}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : (
                                        item.total_item_amount !== null && item.total_item_amount !== undefined
                                          ? Number(item.total_item_amount).toLocaleString("hi-IN", { maximumFractionDigits: 2 })
                                          : 0
                                      )}
                                    </td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={7} className="border border-black p-2 text-center text-gray-500 italic">
                                  No subwork items available
                                </td>
                              </tr>
                            )}
                            {items && items.length > 0 && (
                              <tr className="font-bold bg-gray-100">
                                <td colSpan={6} className="border border-black p-2 text-center">
                                  Total Rs
                                </td>
                                <td className="border border-black p-2 text-right">
                                  {items
                                    .reduce((sum, item) => {
                                      const rates = item.rates || [];
                                      const isRoyalty = item.category === 'royalty';
                                      const isTesting = item.category === 'testing';

                                      const royaltyData = isRoyalty ?
                                        Object.values(estimateData.royaltyMeasurements[item.sr_no] || []).reduce((acc, rm) => ({
                                          hb_metal: acc.hb_metal + (parseFloat(rm.hb_metal as any) || 0),
                                          murum: acc.murum + (parseFloat(rm.murum as any) || 0),
                                          sand: acc.sand + (parseFloat(rm.sand as any) || 0)
                                        }), { hb_metal: 0, murum: 0, sand: 0 }) : null;

                                      const testingData = isTesting && estimateData.testingMeasurements ?
                                        estimateData.testingMeasurements[item.sr_no] || [] : [];

                                      const itemTotal = rates.length > 0
                                        ? rates.reduce((rSum, rate) => {
                                          let quantity = rate.ssr_quantity || 0;

                                          // For royalty items, calculate quantity based on material type
                                          if (isRoyalty && royaltyData) {
                                            const rateDesc = (rate.description || '').toLowerCase();

                                            if (rateDesc.includes('metal')) {
                                              quantity = royaltyData.hb_metal;
                                            } else if (rateDesc.includes('murum')) {
                                              quantity = royaltyData.murum;
                                            } else if (rateDesc.includes('sand')) {
                                              quantity = royaltyData.sand;
                                            } else {
                                              quantity = royaltyData.hb_metal + royaltyData.murum + royaltyData.sand;
                                            }
                                          }

                                          // For testing items
                                          if (isTesting && testingData.length > 0) {
                                            quantity = testingData.reduce((sum, t) => sum + (t.required_tests || 0), 0);
                                          }

                                          return rSum + ((quantity && rate.rate) ? Number(quantity) * Number(rate.rate) : 0);
                                        }, 0)
                                        : (item.total_item_amount !== null && item.total_item_amount !== undefined
                                          ? Number(item.total_item_amount)
                                          : 0);
                                      return sum + itemTotal;
                                    }, 0)
                                    .toLocaleString("hi-IN", { maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      <PageFooter pageNumber={(() => {
                        let pageNum = 4;
                        estimateData.subworks.forEach((sw, idx) => {
                          if (idx <= subworkIndex) {
                            const swItems = estimateData.subworkItems[sw.subworks_id] || [];
                            const hasAnyMeasurements = swItems.some(item => {
                              const itemMeasurements = estimateData.measurements[item.sr_no] || [];
                              return itemMeasurements.length > 0;
                            });
                            if (hasAnyMeasurements && idx < subworkIndex) pageNum++;
                          }
                        });
                        return pageNum + subworkIndex;
                      })()} />
                    </div>
                  );

                  // Measurement pages for this subwork (first measurement format)
                  const measurementPagesForThis: React.ReactNode[] = [];
                  {
                    const hasAnyMeasurements = items.some(item => {
                      const itemMeasurements = estimateData.measurements[item.sr_no] || [];
                      return itemMeasurements.length > 0;
                    });

                    if (hasAnyMeasurements) {
                      measurementPagesForThis.push(
                        <div key={`measurement-a-${subwork.subworks_id}`} className="pdf-page bg-white p-6 min-h-[297mm] flex flex-col" style={{ fontFamily: 'Arial, sans-serif', pageBreakAfter: 'always' }}>
                          <PageHeader pageNumber={pageNumber} />
                          <div className="flex-1">
                            <div className="text-center mb-6">
                              <p className="text-sm mb-2">Village :- {estimateData.work.village || 'N/A'}, GP :- {estimateData.work.grampanchayat || 'N/A'}, Tah :- {estimateData.work.taluka || 'N/A'}</p>
                              <h3 className="text-lg font-bold mb-4">Sub-Work :- {subwork.subworks_name}</h3>
                              <h4 className="text-lg font-bold underline">MEASUREMENT</h4>
                            </div>

                            <div className="mb-8">
                              <table className="w-full border-collapse border-2 border-black" style={{ borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr className="bg-white">
                                    <th className="border-2 border-black p-3 text-center font-bold text-sm" style={{ width: '50%', border: '2px solid black', padding: '9px', textAlign: 'center', fontWeight: 'bold' }}>
                                      Items
                                    </th>
                                    <th className="border-2 border-black p-3 text-center font-bold text-sm" style={{ width: '10%', border: '2px solid black', padding: '9px', textAlign: 'center', fontWeight: 'bold' }}>
                                      Nos.
                                    </th>
                                    <th className="border-2 border-black p-3 text-center font-bold text-sm" style={{ width: '10%', border: '2px solid black', padding: '9px', textAlign: 'center', fontWeight: 'bold' }}>
                                      Length
                                    </th>
                                    <th className="border-2 border-black p-3 text-center font-bold text-sm" style={{ width: '10%', border: '2px solid black', padding: '9px', textAlign: 'center', fontWeight: 'bold' }}>
                                      Breadth
                                    </th>
                                    <th className="border-2 border-black p-3 text-center font-bold text-sm" style={{ width: '9%', border: '2px solid black', padding: '9px', textAlign: 'center', fontWeight: 'bold' }}>
                                      Height/<br />Depth
                                    </th>
                                    <th className="border-2 border-black p-3 text-center font-bold text-sm" style={{ width: '9%', border: '2px solid black', padding: '9px', textAlign: 'center', fontWeight: 'bold' }}>
                                      Qty.
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((item, itemIndex) => {
                                    const isRoyalty = item.category === 'royalty';
                                    const isTesting = item.category === 'testing';
                                    const itemMeasurements = estimateData.measurements[item.sr_no] || [];
                                    const royaltyMeasurements = estimateData.royaltyMeasurements[item.sr_no] || [];
                                    const testingMeasurements = estimateData.testingMeasurements[item.sr_no] || [];

                                    if (itemMeasurements.length === 0 && royaltyMeasurements.length === 0 && testingMeasurements.length === 0) return null;

                                    const itemTotal = itemMeasurements.reduce((sum, m) => sum + (m.calculated_quantity || 0), 0);
                                    const royaltyTotal = {
                                      hb_metal: royaltyMeasurements.reduce((sum, r) => sum + (parseFloat(r.hb_metal as any) || 0), 0),
                                      murum: royaltyMeasurements.reduce((sum, r) => sum + (parseFloat(r.murum as any) || 0), 0),
                                      sand: royaltyMeasurements.reduce((sum, r) => sum + (parseFloat(r.sand as any) || 0), 0),
                                    };
                                    const testingTotal = testingMeasurements.reduce((sum, t) => sum + (t.required_tests || 0), 0);

                                    return (
                                      <React.Fragment key={item.sr_no}>
                                        <tr>
                                          <td className="border border-black p-3 font-bold text-sm" style={{ border: '1px solid black', padding: '12px', fontWeight: 'bold' }}>
                                            Item No.{itemIndex + 1} :-
                                          </td>
                                          <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                          <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                          <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                          <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                          <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                        </tr>

                                        <tr>
                                          <td className="border border-black p-3 text-justify leading-tight text-sm" style={{ border: '1px solid black', padding: '12px', textAlign: 'justify', lineHeight: '1.3' }}>
                                            {item.description_of_item}
                                          </td>
                                          <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                          <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                          <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                          <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                          <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                        </tr>

                                        {itemMeasurements.map((measurement, measurementIndex) => (
                                          <tr key={measurement.sr_no || measurementIndex}>
                                            <td className="border border-black p-3 text-right pr-4 text-sm" style={{ border: '1px solid black', padding: '12px', textAlign: 'right', paddingRight: '16px' }}>
                                              {measurement.description_of_items || ''}
                                            </td>
                                            <td className="border border-black p-3 text-center text-sm font-medium" style={{ border: '1px solid black', padding: '12px', textAlign: 'center', fontWeight: '500' }}>
                                              {measurement.no_of_units || 1}
                                            </td>
                                            <td className="border border-black p-3 text-center text-sm font-medium" style={{ border: '1px solid black', padding: '12px', textAlign: 'center', fontWeight: '500' }}>
                                              {(measurement.length || 0).toFixed(2)}
                                            </td>
                                            <td className="border border-black p-3 text-center text-sm font-medium" style={{ border: '1px solid black', padding: '12px', textAlign: 'center', fontWeight: '500' }}>
                                              {(measurement.width_breadth || 0).toFixed(2)}
                                            </td>
                                            <td className="border border-black p-3 text-center text-sm font-medium" style={{ border: '1px solid black', padding: '12px', textAlign: 'center', fontWeight: '500' }}>
                                              {(measurement.height_depth || 0).toFixed(2)}
                                            </td>
                                            <td className="border border-black p-3 text-center text-sm font-bold text-blue-600" style={{ border: '1px solid black', padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#2563eb' }}>
                                              {(measurement.calculated_quantity || 0).toFixed(2)}
                                            </td>
                                          </tr>
                                        ))}

                                        {isRoyalty && royaltyMeasurements.length > 0 && (
                                          <>
                                            <tr className="bg-yellow-50">
                                              <td colSpan={6} className="border border-black p-2 font-bold text-sm" style={{ border: '1px solid black', padding: '8px', fontWeight: 'bold' }}>
                                                Royalty Measurements:
                                              </td>
                                            </tr>
                                            {royaltyTotal.hb_metal > 0 && (
                                              <tr>
                                                <td className="border border-black p-3 text-right pr-4 text-sm" style={{ border: '1px solid black', padding: '12px', textAlign: 'right', paddingRight: '16px' }}>
                                                  Metal (H.B Metal)
                                                </td>
                                                <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                                <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                                <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                                <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                                <td className="border border-black p-3 text-center text-sm font-bold text-orange-600" style={{ border: '1px solid black', padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#ea580c' }}>
                                                  {royaltyTotal.hb_metal.toFixed(2)} CUM
                                                </td>
                                              </tr>
                                            )}
                                            {royaltyTotal.murum > 0 && (
                                              <tr>
                                                <td className="border border-black p-3 text-right pr-4 text-sm" style={{ border: '1px solid black', padding: '12px', textAlign: 'right', paddingRight: '16px' }}>
                                                  MURUM
                                                </td>
                                                <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                                <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                                <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                                <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                                <td className="border border-black p-3 text-center text-sm font-bold text-orange-600" style={{ border: '1px solid black', padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#ea580c' }}>
                                                  {royaltyTotal.murum.toFixed(2)} CUM
                                                </td>
                                              </tr>
                                            )}
                                            {royaltyTotal.sand > 0 && (
                                              <tr>
                                                <td className="border border-black p-3 text-right pr-4 text-sm" style={{ border: '1px solid black', padding: '12px', textAlign: 'right', paddingRight: '16px' }}>
                                                  Sand
                                                </td>
                                                <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                                <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                                <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                                <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                                <td className="border border-black p-3 text-center text-sm font-bold text-orange-600" style={{ border: '1px solid black', padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#ea580c' }}>
                                                  {royaltyTotal.sand.toFixed(2)} CUM
                                                </td>
                                              </tr>
                                            )}
                                          </>
                                        )}

                                        {isTesting && testingMeasurements.length > 0 && (
                                          <>
                                            <tr className="bg-blue-50">
                                              <td colSpan={6} className="border border-black p-2 font-bold text-sm" style={{ border: '1px solid black', padding: '8px', fontWeight: 'bold' }}>
                                                Testing Measurements:
                                              </td>
                                            </tr>
                                            <tr>
                                              <td className="border border-black p-3 text-right pr-4 text-sm" style={{ border: '1px solid black', padding: '12px', textAlign: 'right', paddingRight: '16px' }}>
                                                {testingMeasurements[0]?.description || 'Tests Required'}
                                              </td>
                                              <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                              <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                              <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                              <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                              <td className="border border-black p-3 text-center text-sm font-bold text-blue-600" style={{ border: '1px solid black', padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#2563eb' }}>
                                                {testingTotal.toFixed(0)} /SET
                                              </td>
                                            </tr>
                                          </>
                                        )}

                                        {!isRoyalty && !isTesting && (
                                          <tr className="bg-gray-100">
                                            <td className="border border-black p-3 text-right font-bold text-sm pr-4" style={{ border: '1px solid black', padding: '12px', textAlign: 'right', fontWeight: 'bold', paddingRight: '16px' }}>
                                              Total
                                            </td>
                                            <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                            <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                            <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                            <td className="border border-black p-3" style={{ border: '1px solid black', padding: '12px' }}></td>
                                            <td className="border border-black p-3 text-center font-bold text-lg text-green-600" style={{ border: '1px solid black', padding: '12px', textAlign: 'center', fontWeight: 'bold', fontSize: '16px', color: '#16a34a' }}>
                                              {itemTotal.toFixed(2)}
                                            </td>
                                          </tr>
                                        )}
                                      </React.Fragment>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          <PageFooter pageNumber={pageNumber} />
                        </div>
                      );

                      // increment pageNumber after rendering measurement page
                      pageNumber++;
                    }
                  }

                  // Measurement Pages - Traditional Format (second measurement block)
                  const traditionalMeasurementForThis: React.ReactNode[] = [];
                  {
                    const hasAnyMeasurements = items.some(item => {
                      const itemMeasurements = estimateData.measurements[item.id] || [];
                      return itemMeasurements.length > 0;
                    });

                    if (hasAnyMeasurements) {
                      traditionalMeasurementForThis.push(
                        <div key={`measurement-b-${subwork.subworks_id}`} className="pdf-page bg-white p-6 min-h-[297mm] flex flex-col" style={{ fontFamily: 'Arial, sans-serif', pageBreakAfter: 'always' }}>
                          <PageHeader pageNumber={pageNumber} />
                          <div className="flex-1">
                            <div className="text-center mb-6" style={{ fontSize: '14px', fontWeight: 'bold' }}>
                              <h2 className="text-base font-bold text-black mb-4">NAME OF WORK: {estimateData.work.work_name}</h2>
                              <div className="text-sm text-black mb-4">
                                <span>Village :- {estimateData.work.village || 'N/A'}, </span>
                                <span>GP :- {estimateData.work.grampanchayat || 'N/A'}, </span>
                                <span>Tah :- {estimateData.work.taluka || 'Chandrapur'}</span>
                              </div>
                              <h3 className="text-base font-bold text-black mb-4">Sub-Work :- {subwork.subworks_name}</h3>
                              <h2 className="text-lg font-bold text-black underline mb-6">MEASUREMENT</h2>
                            </div>

                            <table className="w-full border-collapse border-2 border-black text-sm" style={{ borderCollapse: 'collapse' }}>
                              <thead>
                                <tr>
                                  <th className="border border-black p-3 text-center font-bold" style={{ border: '1px solid black', padding: '8px', textAlign: 'center', fontWeight: 'bold', width: '40%' }}>
                                    Items
                                  </th>
                                  <th className="border border-black p-3 text-center font-bold" style={{ border: '1px solid black', padding: '8px', textAlign: 'center', fontWeight: 'bold', width: '10%' }}>
                                    Nos.
                                  </th>
                                  <th className="border border-black p-3 text-center font-bold" style={{ border: '1px solid black', padding: '8px', textAlign: 'center', fontWeight: 'bold', width: '12%' }}>
                                    Length
                                  </th>
                                  <th className="border border-black p-3 text-center font-bold" style={{ border: '1px solid black', padding: '8px', textAlign: 'center', fontWeight: 'bold', width: '12%' }}>
                                    Breadth
                                  </th>
                                  <th className="border border-black p-3 text-center font-bold" style={{ border: '1px solid black', padding: '8px', textAlign: 'center', fontWeight: 'bold', width: '13%' }}>
                                    Height/<br />Depth
                                  </th>
                                  <th className="border border-black p-3 text-center font-bold" style={{ border: '1px solid black', padding: '8px', textAlign: 'center', fontWeight: 'bold', width: '13%' }}>
                                    Qty.
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((item, itemIndex) => {
                                  const itemMeasurements = estimateData.measurements[item.id] || [];
                                  if (itemMeasurements.length === 0) return null;

                                  const rows: React.ReactNode[] = [];

                                  rows.push(
                                    <tr key={`item-header-${item.id}`}>
                                      <td className="border border-black p-2 font-bold" style={{ border: '1px solid black', padding: '8px', fontWeight: 'bold' }}>Item No.{itemIndex + 1} :-</td>
                                      <td className="border border-black p-2" style={{ border: '1px solid black', padding: '8px' }}></td>
                                      <td className="border border-black p-2" style={{ border: '1px solid black', padding: '8px' }}></td>
                                      <td className="border border-black p-2" style={{ border: '1px solid black', padding: '8px' }}></td>
                                      <td className="border border-black p-2" style={{ border: '1px solid black', padding: '8px' }}></td>
                                      <td className="border border-black p-2" style={{ border: '1px solid black', padding: '8px' }}></td>
                                    </tr>
                                  );

                                  rows.push(
                                    <tr key={`item-desc-${item.id}`}>
                                      <td className="border border-black p-2 text-justify leading-tight" style={{ border: '1px solid black', padding: '8px', textAlign: 'justify', lineHeight: '1.3' }}>{item.description_of_item}</td>
                                      <td className="border border-black p-2" style={{ border: '1px solid black', padding: '8px' }}></td>
                                      <td className="border border-black p-2" style={{ border: '1px solid black', padding: '8px' }}></td>
                                      <td className="border border-black p-2" style={{ border: '1px solid black', padding: '8px' }}></td>
                                      <td className="border border-black p-2" style={{ border: '1px solid black', padding: '8px' }}></td>
                                      <td className="border border-black p-2" style={{ border: '1px solid black', padding: '8px' }}></td>
                                    </tr>
                                  );

                                  itemMeasurements.forEach((measurement, measurementIndex) => {
                                    rows.push(
                                      <tr key={`measurement-${measurement.sr_no || measurementIndex}`}>
                                        <td className="border border-black p-2 text-right pr-4" style={{ border: '1px solid black', padding: '8px', textAlign: 'right', paddingRight: '16px' }}>{measurement.description_of_items || ''}</td>
                                        <td className="border border-black p-2 text-center" style={{ border: '1px solid black', padding: '8px', textAlign: 'center' }}>{measurement.no_of_units || 1}</td>
                                        <td className="border border-black p-2 text-center" style={{ border: '1px solid black', padding: '8px', textAlign: 'center' }}>{(measurement.length || 0).toFixed(2)}</td>
                                        <td className="border border-black p-2 text-center" style={{ border: '1px solid black', padding: '8px', textAlign: 'center' }}>{(measurement.width_breadth || 0).toFixed(2)}</td>
                                        <td className="border border-black p-2 text-center" style={{ border: '1px solid black', padding: '8px', textAlign: 'center' }}>{(measurement.height_depth || 0).toFixed(2)}</td>
                                        <td className="border border-black p-2 text-center" style={{ border: '1px solid black', padding: '8px', textAlign: 'center' }}>{(measurement.calculated_quantity || 0).toFixed(2)}</td>
                                      </tr>
                                    );
                                  });

                                  const totalQuantity = itemMeasurements.reduce((sum, m) => sum + (m.calculated_quantity || 0), 0);
                                  rows.push(
                                    <tr key={`total-${item.id}`}>
                                      <td className="border border-black p-2 text-right font-bold pr-4" style={{ border: '1px solid black', padding: '8px', textAlign: 'right', fontWeight: 'bold', paddingRight: '16px' }}>Total</td>
                                      <td className="border border-black p-2" style={{ border: '1px solid black', padding: '8px' }}></td>
                                      <td className="border border-black p-2" style={{ border: '1px solid black', padding: '8px' }}></td>
                                      <td className="border border-black p-2" style={{ border: '1px solid black', padding: '8px' }}></td>
                                      <td className="border border-black p-2" style={{ border: '1px solid black', padding: '8px' }}></td>
                                      <td className="border border-black p-2 text-center font-bold" style={{ border: '1px solid black', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>{totalQuantity.toFixed(2)}</td>
                                    </tr>
                                  );

                                  const itemsWithMeasurements = items.filter(i => (estimateData.measurements[i.id] || []).length > 0);
                                  if (itemIndex < itemsWithMeasurements.length - 1) {
                                    rows.push(<tr key={`spacing-${item.id}`}><td className="border border-black p-1" colSpan={6} style={{ border: '1px solid black', padding: '4px' }}></td></tr>);
                                  }

                                  return rows;
                                })}

                                {Array.from({ length: 8 }, (_, index) => (
                                  <tr key={`empty-${index}`}>
                                    <td className="border border-black p-2 h-8" style={{ border: '1px solid black', padding: '8px', height: '32px' }}></td>
                                    <td className="border border-black p-2" style={{ border: '1px solid black', padding: '8px' }}></td>
                                    <td className="border border-black p-2" style={{ border: '1px solid black', padding: '8px' }}></td>
                                    <td className="border border-black p-2" style={{ border: '1px solid black', padding: '8px' }}></td>
                                    <td className="border border-black p-2" style={{ border: '1px solid black', padding: '8px' }}></td>
                                    <td className="border border-black p-2" style={{ border: '1px solid black', padding: '8px' }}></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <PageFooter pageNumber={pageNumber} />
                        </div>
                      );

                      pageNumber++;
                    }
                  }

                  // Photo page for this subwork (only if photos exist)
                  const hasPhotos = !loadingPhotos && photosMap[subwork.subworks_id]?.length > 0;
                  const photoPage = hasPhotos ? (
                    <div key={`photos-${subwork.subworks_id}`} className="pdf-page bg-white p-8 min-h-[297mm] flex flex-col" style={{ fontFamily: 'Arial, sans-serif', pageBreakAfter: 'always' }}>
                      <PageHeader pageNumber={pageNumber} />
                      <div className="flex-1">
                        <div className="text-center mb-6">
                          <h3 className="text-lg font-bold">Design Photos</h3>
                          <h4 className="text-base font-medium">Sub-Work: {subwork.subworks_name}</h4>
                        </div>

                        <div className="grid grid-cols-1 gap-6">
                          {photosMap[subwork.subworks_id].map((photo) => (
                            <div key={photo.id} className="flex flex-col items-center">
                              <img
                                src={photo.photo_url}
                                alt={photo.description || `Design Photo ${photo.id}`}
                                className="max-h-[200mm] object-contain border border-gray-300 rounded shadow-sm"
                                crossOrigin="anonymous"
                              />
                              {photo.description && (
                                <p className="text-sm text-gray-600 mt-2 text-center">{photo.description}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      <PageFooter pageNumber={pageNumber} />
                    </div>
                  ) : null;

                  // increment pageNumber only if photos exist
                  if (hasPhotos) {
                    pageNumber++;
                  }

                  // Compose and return: abstract -> measurement(s) -> traditional measurement -> photos (if available)
                  return (
                    <React.Fragment key={`group-${subwork.subworks_id}`}>
                      {abstractPage}
                      {measurementPagesForThis}
                      {traditionalMeasurementForThis}
                      {photoPage}
                    </React.Fragment>
                  );
                });
              })()}

              {/* Rate Analysis Pages - All items consolidated */}
              {(() => {
                // Calculate the starting page number for rate analysis
                let rateAnalysisStartPage = 4; // Start after cover, details, and recap pages

                estimateData.subworks.forEach((subwork) => {
                  const items = estimateData.subworkItems[subwork.subworks_id] || [];

                  // Count pages for this subwork
                  // 1 abstract page
                  rateAnalysisStartPage++;

                  // Measurement pages (if any)
                  const hasAnyMeasurements = items.some(item => {
                    const itemMeasurements = estimateData.measurements[item.sr_no] || [];
                    return itemMeasurements.length > 0;
                  });
                  if (hasAnyMeasurements) {
                    rateAnalysisStartPage += 2; // Two measurement formats
                  }

                  // Photo pages (if any)
                  const hasPhotos = !loadingPhotos && photosMap[subwork.subworks_id]?.length > 0;
                  if (hasPhotos) {
                    rateAnalysisStartPage++;
                  }
                });

                // Collect all items from all subworks for rate analysis
                const allItems: SubworkItem[] = [];
                estimateData.subworks.forEach(subwork => {
                  const items = estimateData.subworkItems[subwork.subworks_id] || [];
                  allItems.push(...items);
                });

                return (
                  <EstimateRateAnalysis
                    workName={estimateData.work.work_name}
                    village={estimateData.work.village || 'N/A'}
                    grampanchayat={estimateData.work.grampanchayat || 'N/A'}
                    taluka={estimateData.work.taluka || 'N/A'}
                    items={allItems}
                    rateAnalysis={estimateData.rateAnalysis}
                    PageHeader={PageHeader}
                    PageFooter={PageFooter}
                    startPageNumber={rateAnalysisStartPage}
                  />
                );
              })()}

              {/* Lead Statement Pages - After rate analysis */}
              {(() => {
                // Calculate the starting page number for lead statement
                let leadStatementStartPage = 4; // Start after cover, details, and recap pages

                // Count all previous pages
                estimateData.subworks.forEach((subwork) => {
                  const items = estimateData.subworkItems[subwork.subworks_id] || [];

                  // 1 abstract page
                  leadStatementStartPage++;

                  // Measurement pages (if any)
                  const hasAnyMeasurements = items.some(item => {
                    const itemMeasurements = estimateData.measurements[item.sr_no] || [];
                    return itemMeasurements.length > 0;
                  });
                  if (hasAnyMeasurements) {
                    leadStatementStartPage += 2; // Two measurement formats
                  }

                  // Photo pages (if any)
                  const hasPhotos = !loadingPhotos && photosMap[subwork.subworks_id]?.length > 0;
                  if (hasPhotos) {
                    leadStatementStartPage++;
                  }
                });

                // Count rate analysis pages
                const allItems: SubworkItem[] = [];
                estimateData.subworks.forEach(subwork => {
                  const items = estimateData.subworkItems[subwork.subworks_id] || [];
                  allItems.push(...items);
                });

                const itemsWithRateAnalysis = allItems.filter(item => {
                  const analysis = estimateData.rateAnalysis[item.sr_no];
                  const hasAnalysis = analysis && analysis.entries && analysis.entries.length > 0;
                  const hasRates = item.rates && item.rates.length > 0;
                  return hasAnalysis || hasRates;
                });

                const ITEMS_PER_RATE_PAGE = 3;
                const rateAnalysisPages = Math.ceil(itemsWithRateAnalysis.length / ITEMS_PER_RATE_PAGE);
                leadStatementStartPage += rateAnalysisPages;

                return (
                  <EstimateLeadStatement
                    workName={estimateData.work.work_name}
                    village={estimateData.work.village || 'N/A'}
                    grampanchayat={estimateData.work.grampanchayat || 'N/A'}
                    taluka={estimateData.work.taluka || 'N/A'}
                    leadStatements={estimateData.leadStatements}
                    PageHeader={PageHeader}
                    PageFooter={PageFooter}
                    startPageNumber={leadStatementStartPage}
                  />
                );
              })()}

              {/* Quarry Chart Page - After lead statement */}
              {(() => {
                // Calculate the starting page number for quarry chart
                let quarryChartStartPage = 4; // Start after cover, details, and recap pages

                // Count all previous pages
                estimateData.subworks.forEach((subwork) => {
                  const items = estimateData.subworkItems[subwork.subworks_id] || [];

                  // 1 abstract page
                  quarryChartStartPage++;

                  // Measurement pages (if any)
                  const hasAnyMeasurements = items.some(item => {
                    const itemMeasurements = estimateData.measurements[item.sr_no] || [];
                    return itemMeasurements.length > 0;
                  });
                  if (hasAnyMeasurements) {
                    quarryChartStartPage += 2; // Two measurement formats
                  }

                  // Photo pages (if any)
                  const hasPhotos = !loadingPhotos && photosMap[subwork.subworks_id]?.length > 0;
                  if (hasPhotos) {
                    quarryChartStartPage++;
                  }
                });

                // Count rate analysis pages
                const allItems: SubworkItem[] = [];
                estimateData.subworks.forEach(subwork => {
                  const items = estimateData.subworkItems[subwork.subworks_id] || [];
                  allItems.push(...items);
                });

                const itemsWithRateAnalysis = allItems.filter(item => {
                  const analysis = estimateData.rateAnalysis[item.sr_no];
                  const hasAnalysis = analysis && analysis.entries && analysis.entries.length > 0;
                  const hasRates = item.rates && item.rates.length > 0;
                  return hasAnalysis || hasRates;
                });

                const ITEMS_PER_RATE_PAGE = 3;
                const rateAnalysisPages = Math.ceil(itemsWithRateAnalysis.length / ITEMS_PER_RATE_PAGE);
                quarryChartStartPage += rateAnalysisPages;

                // Count lead statement pages
                const LEAD_ITEMS_PER_PAGE = 20;
                const leadStatementPages = Math.ceil((estimateData.leadStatements?.length || 0) / LEAD_ITEMS_PER_PAGE);
                quarryChartStartPage += leadStatementPages;

                return (
                  <EstimateQuarryChart
                    workName={estimateData.work.work_name}
                    village={estimateData.work.village || 'N/A'}
                    grampanchayat={estimateData.work.grampanchayat || 'N/A'}
                    taluka={estimateData.work.taluka || 'N/A'}
                    worksId={workId}
                    PageHeader={PageHeader}
                    PageFooter={PageFooter}
                    startPageNumber={quarryChartStartPage}
                  />
                );
              })()}
            </div>
          </div>
        )}

        {!loading && !estimateData && (
          <div className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-gray-300" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No estimate data found</h3>
            <p className="mt-1 text-sm text-gray-500">
              Unable to load estimate data for the selected work.
            </p>
          </div>
        )}
      </div>

      <style >{`
        @media print {
          .pdf-page {
            page-break-after: always;
            min-height: 297mm;
            width: 210mm;
          }
        }
        
        .pdf-page {
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
          margin-bottom: 20px;
        }
      `}</style>
    </div>
  );
};

export default EstimatePDFGenerator;