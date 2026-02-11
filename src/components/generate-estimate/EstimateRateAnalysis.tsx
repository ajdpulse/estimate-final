import React from 'react';

interface RateAnalysisEntry {
  label: string;
  type: string;
  value: number;
  factor: number;
  amount: number;
}

interface RateAnalysis {
  sr_no: number;
  subwork_item_id: number;
  entries: RateAnalysisEntry[];
  created_at: string;
}

interface ItemRate {
  sr_no?: number;
  subwork_item_sr_no?: number;
  description?: string;
  rate?: number;
  ssr_unit?: string;
  ssr_quantity?: number;
  rate_total_amount?: number;
}

interface SubworkItem {
  sr_no: number;
  item_number: string;
  description_of_item: string;
  ssr_unit: string;
  category?: string;
  rates?: ItemRate[];
}

interface EstimateRateAnalysisProps {
  workName: string;
  village: string;
  grampanchayat: string;
  taluka: string;
  items: SubworkItem[];
  rateAnalysis: Record<string, RateAnalysis>;
  PageHeader: React.FC<{ pageNumber: number }>;
  PageFooter: React.FC<{ pageNumber: number }>;
  startPageNumber: number;
}

export const EstimateRateAnalysis: React.FC<EstimateRateAnalysisProps> = ({
  workName,
  village,
  grampanchayat,
  taluka,
  items,
  rateAnalysis,
  PageHeader,
  PageFooter,
  startPageNumber
}) => {
  // Show all items (with or without detailed rate analysis)
  const itemsToShow = items.filter(item => {
    const analysis = rateAnalysis[item.sr_no];
    const hasAnalysis = analysis && analysis.entries && analysis.entries.length > 0;
    const hasRates = item.rates && item.rates.length > 0;
    return hasAnalysis || hasRates;
  });

  if (itemsToShow.length === 0) {
    return null;
  }

  const pages: React.ReactNode[] = [];
  let currentPageNumber = startPageNumber;
  let currentPageItems: SubworkItem[] = [];
  const ITEMS_PER_PAGE = 3; // Adjust based on space needed

  itemsToShow.forEach((item, index) => {
    currentPageItems.push(item);

    // Create a new page when we reach the limit or it's the last item
    if (currentPageItems.length === ITEMS_PER_PAGE || index === itemsToShow.length - 1) {
      pages.push(
        <div key={`rate-analysis-page-${currentPageNumber}`} className="pdf-page bg-white p-6 min-h-[297mm] flex flex-col" style={{ fontFamily: 'Arial, sans-serif', pageBreakAfter: 'always' }}>
          <PageHeader pageNumber={currentPageNumber} />
          <div className="flex-1">
            <div className="text-center mb-6">
              <h3 className="text-lg font-bold mb-2">RATE ANALYSIS</h3>
              <h4 className="text-base font-semibold">Name of Work :- {workName}</h4>
              <p className="text-sm">at {village || 'N/A'}, G.P. {grampanchayat || 'N/A'}, Ta.: {taluka || 'N/A'}</p>
            </div>

            <table className="w-full border-collapse border border-black text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-black p-2 text-center" style={{ width: '8%' }}>Sr.No.</th>
                  <th className="border border-black p-2 text-left" style={{ width: '40%' }}>Item of Work</th>
                  <th className="border border-black p-2 text-center" style={{ width: '12%' }}>QTy.</th>
                  <th className="border border-black p-2 text-center" style={{ width: '12%' }}>Rate/Unit</th>
                  <th className="border border-black p-2 text-center" style={{ width: '15%' }}>Amount</th>
                  <th className="border border-black p-2 text-center" style={{ width: '13%' }}>Unit.</th>
                </tr>
              </thead>
              <tbody>
                {currentPageItems.map((item) => {
                  const analysis = rateAnalysis[item.sr_no];
                  const hasDetailedAnalysis = analysis && analysis.entries && analysis.entries.length > 0;

                  // Calculate total based on whether we have detailed analysis or basic rates
                  let totalAmount = 0;
                  let displayRows: React.ReactNode[] = [];

                  if (hasDetailedAnalysis) {
                    // Item has detailed rate analysis
                    const entries = analysis.entries;
                    totalAmount = entries.reduce((sum, entry) => sum + (entry.amount || 0), 0);

                    displayRows = entries.map((entry, entryIndex) => {
                      const quantity = entry.factor || 0;
                      const rate = entry.value || 0;
                      const amount = entry.amount || 0;

                      return (
                        <tr key={entryIndex}>
                          <td className="border border-black p-2"></td>
                          <td className="border border-black p-2">
                            <div className="pl-4">{entry.label || ''}</div>
                          </td>
                          <td className="border border-black p-2 text-center">
                            {quantity > 0 ? quantity.toFixed(2) : ''}
                          </td>
                          <td className="border border-black p-2 text-center">
                            {rate > 0 ? rate.toFixed(2) : ''}
                          </td>
                          <td className="border border-black p-2 text-right">
                            {amount > 0 ? amount.toFixed(2) : ''}
                          </td>
                          <td className="border border-black p-2 text-center"></td>
                        </tr>
                      );
                    });
                  } else if (item.rates && item.rates.length > 0) {
                    // Item has basic rates from item_rates table
                    const rates = item.rates;
                    totalAmount = rates.reduce((sum, rate) => sum + (Number(rate.rate_total_amount) || 0), 0);

                    displayRows = rates.map((rate, rateIndex) => {
                      const quantity = Number(rate.ssr_quantity) || 0;
                      const rateValue = Number(rate.rate) || 0;
                      const amount = Number(rate.rate_total_amount) || 0;

                      return (
                        <tr key={rateIndex}>
                          <td className="border border-black p-2"></td>
                          <td className="border border-black p-2">
                            <div className="pl-4">{rate.description || 'Default Rate'}</div>
                          </td>
                          <td className="border border-black p-2 text-center">
                            {quantity > 0 ? quantity.toFixed(2) : ''}
                          </td>
                          <td className="border border-black p-2 text-center">
                            {rateValue > 0 ? rateValue.toFixed(2) : ''}
                          </td>
                          <td className="border border-black p-2 text-right">
                            {amount > 0 ? amount.toFixed(2) : ''}
                          </td>
                          <td className="border border-black p-2 text-center"></td>
                        </tr>
                      );
                    });
                  }

                  return (
                    <React.Fragment key={item.sr_no}>
                      {/* Item Header Row */}
                      <tr>
                        <td className="border border-black p-2 text-center font-bold">{item.item_number}</td>
                        <td className="border border-black p-2" colSpan={5}>
                          <div className="font-medium">{item.description_of_item}</div>
                        </td>
                      </tr>

                      {/* Entry Rows (either detailed analysis or basic rates) */}
                      {displayRows}

                      {/* Total Rs Row */}
                      <tr className="bg-gray-100 font-bold">
                        <td className="border border-black p-2" colSpan={4} style={{ textAlign: 'right', paddingRight: '20px' }}>
                          Total Rs
                        </td>
                        <td className="border border-black p-2 text-right">
                          {totalAmount.toFixed(2)}
                        </td>
                        <td className="border border-black p-2"></td>
                      </tr>

                      {/* Say Rs Row */}
                      <tr className="bg-gray-100 font-bold">
                        <td className="border border-black p-2" colSpan={4} style={{ textAlign: 'right', paddingRight: '20px' }}>
                          Say Rs.
                        </td>
                        <td className="border border-black p-2 text-right">
                          {(Math.round(Number(totalAmount || 0) / 0.05) * 0.05).toFixed(2)}
                        </td>
                        <td className="border border-black p-2 text-center">
                          {item.ssr_unit || 'CUM'}
                        </td>
                      </tr>

                      {/* Spacer row between items */}
                      <tr>
                        <td colSpan={6} className="border-0 p-1"></td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PageFooter pageNumber={currentPageNumber} />
        </div>
      );

      currentPageNumber++;
      currentPageItems = [];
    }
  });

  return <>{pages}</>;
};
