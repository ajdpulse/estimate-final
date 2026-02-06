import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useRefreshOnVisibility } from '../hooks/useRefreshOnVisibility'; // ✅ ADD
import { FileText, Plus, Trash2, Save, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface BOQItem {
  item_no: number;
  quantity: number;
  description: string;
  rate_figure: number;
  rate_words: string;
  unit: string;
  total_amount: number;
}

interface BOQSubsection {
  name: string;
  items: BOQItem[];
}

interface BOQSection {
  name: string;
  subsections: BOQSubsection[];
}

interface BOQData {
  project_title: string;
  sections: BOQSection[];
}

interface Work {
  works_id: string;
  work_name: string;
  division: string;
  estimate_status: string;
}

const BOQGeneration: React.FC = () => {
  const { user } = useAuth();
  const [works, setWorks] = useState<Work[]>([]);
  const [selectedWork, setSelectedWork] = useState<string | null>(null);
  const [boqData, setBOQData] = useState<BOQData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingItem, setEditingItem] = useState<{ sectionIdx: number; subsectionIdx: number; itemIdx: number } | null>(null);

  useEffect(() => {
    fetchApprovedWorks();
  }, [user]);

  // ✅ NEW: Refetch works when page becomes visible (background)
  useRefreshOnVisibility(
    async () => {
      try {
        await supabase.auth.refreshSession();
      } catch (e) {
        console.warn('Session refresh failed on visibility (boq):', e);
      }
      await fetchApprovedWorks(true);
    },
    [user]
  );

  const fetchApprovedWorks = async (background = false) => {
    if (!user) return;

    try {
      if (!background) setLoading(true);
      const { data, error } = await supabase
        .schema('estimate')
        .from('works')
        .select('works_id, work_name, division, estimate_status')
        .eq('estimate_status', 'approved')
        .order('work_name');

      if (error) throw error;
      setWorks(data || []);
    } catch (error) {
      console.error('Error fetching works:', error);
      alert('Failed to load approved works');
    } finally {
      if (!background) setLoading(false);
    }
  };

  const loadBOQ = async (workId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .schema('estimate')
        .from('boq')
        .select('boq_data')
        .eq('work_id', workId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setBOQData(data.boq_data as BOQData);
      } else {
        const work = works.find(w => w.works_id === workId);
        setBOQData({
          project_title: work?.work_name || '',
          sections: []
        });
      }
    } catch (error) {
      console.error('Error loading BOQ:', error);
      alert('Failed to load BOQ');
    } finally {
      setLoading(false);
    }
  };

  const generateBOQFromWork = async () => {
    if (!selectedWork) {
      alert('Please select a work first');
      return;
    }

    try {
      setLoading(true);
      console.log('Generating BOQ for work:', selectedWork);

      const { data: subworks, error: subworksError } = await supabase
        .schema('estimate')
        .from('subworks')
        .select('subworks_id, subworks_name, subwork_amount')
        .eq('works_id', selectedWork)
        .order('sr_no');

      console.log('Subworks fetched:', subworks, 'Error:', subworksError);

      if (subworksError) throw subworksError;

      if (!subworks || subworks.length === 0) {
        alert('No subworks found for this work. Please add subworks first.');
        setLoading(false);
        return;
      }

      const sections: BOQSection[] = [];
      let itemCounter = 1;

      for (const subwork of subworks) {
        console.log('Processing subwork:', subwork.subworks_id);

        const { data: items, error: itemsError } = await supabase
          .schema('estimate')
          .from('subwork_items')
          .select('item_number, description_of_item, ssr_quantity, ssr_rate, ssr_unit, total_item_amount')
          .eq('subwork_id', subwork.subworks_id)
          .order('item_number');

        console.log('Items for subwork', subwork.subworks_id, ':', items, 'Error:', itemsError);

        if (itemsError) throw itemsError;

        const boqItems: BOQItem[] = (items || []).map((item, idx) => ({
          item_no: itemCounter++,
          quantity: Number(item.ssr_quantity) || 0,
          description: item.description_of_item || '',
          rate_figure: Number(item.ssr_rate) || 0,
          rate_words: '',
          unit: item.ssr_unit || '',
          total_amount: Number(item.total_item_amount) || 0
        }));

        if (boqItems.length > 0) {
          sections.push({
            name: subwork.subworks_name,
            subsections: [
              {
                name: 'Items',
                items: boqItems
              }
            ]
          });
        }
      }

      console.log('Total sections created:', sections.length);

      if (sections.length === 0) {
        alert('No items found in any subwork. Please add items to subworks first.');
        setLoading(false);
        return;
      }

      const work = works.find(w => w.works_id === selectedWork);
      const newBOQData = {
        project_title: work?.work_name || '',
        sections
      };

      console.log('Setting BOQ data:', newBOQData);
      setBOQData(newBOQData);

      alert(`BOQ generated successfully with ${sections.length} sections and ${itemCounter - 1} items`);
    } catch (error: any) {
      console.error('Error generating BOQ:', error);
      alert('Failed to generate BOQ: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleWorkSelect = (workId: string) => {
    setSelectedWork(workId);
    loadBOQ(workId);
  };

  const saveBOQ = async () => {
    if (!selectedWork || !boqData) return;

    try {
      setSaving(true);

      const { data: existing } = await supabase
        .schema('estimate')
        .from('boq')
        .select('id')
        .eq('work_id', selectedWork)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .schema('estimate')
          .from('boq')
          .update({
            boq_data: boqData,
            updated_at: new Date().toISOString(),
            updated_by: user?.id
          })
          .eq('work_id', selectedWork);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .schema('estimate')
          .from('boq')
          .insert({
            work_id: selectedWork,
            boq_data: boqData,
            generated_by: user?.id
          });

        if (error) throw error;
      }

      alert('BOQ saved successfully');
    } catch (error: any) {
      console.error('Error saving BOQ:', error);
      alert('Failed to save BOQ: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const downloadExcel = async () => {
    if (!selectedWork) {
      alert('Please select a work first');
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .schema('estimate')
        .from('boq')
        .select('boq_data, work_id')
        .eq('work_id', selectedWork)
        .maybeSingle();

      if (error) throw error;

      if (!data || !data.boq_data) {
        alert('No saved BOQ found for this work. Please generate and save the BOQ first.');
        return;
      }

      const boqDataToExport = data.boq_data as BOQData;

      const numberToWords = (num: number): string => {
        if (num === 0) return 'Zero Only';

        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

        const convertLessThanThousand = (n: number): string => {
          if (n === 0) return '';
          if (n < 10) return ones[n];
          if (n < 20) return teens[n - 10];
          if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
          return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' & ' + convertLessThanThousand(n % 100) : '');
        };

        const crore = Math.floor(num / 10000000);
        const lakh = Math.floor((num % 10000000) / 100000);
        const thousand = Math.floor((num % 100000) / 1000);
        const remainder = Math.floor(num % 1000);

        let result = '';
        if (crore > 0) result += convertLessThanThousand(crore) + ' Crore ';
        if (lakh > 0) result += convertLessThanThousand(lakh) + ' Lakh ';
        if (thousand > 0) result += convertLessThanThousand(thousand) + ' Thousand ';
        if (remainder > 0) result += convertLessThanThousand(remainder);

        return 'INR ' + result.trim() + ' Only';
      };

      const excelData: any[] = [];
      let slNo = 1;

      boqDataToExport.sections.forEach((section, sectionIdx) => {
        section.subsections.forEach((subsection) => {
          subsection.items.forEach((item) => {
            const amountWithTaxes = item.total_amount;
            const amountInWords = numberToWords(Math.round(amountWithTaxes));
            const itemDescription = `${section.name}\nItem No.${item.item_no}: ${item.description}`;

            excelData.push({
              'Sl. No.': slNo++,
              'Item Description': itemDescription,
              'Quantity': item.quantity,
              'Units': item.unit,
              'Estimated Rate': item.rate_figure,
              'TOTAL AMOUNT Without Taxes': item.total_amount,
              'TOTAL AMOUNT With Taxes': amountWithTaxes,
              'TOTAL AMOUNT In Words': amountInWords
            });
          });
        });
      });

      const worksheet = XLSX.utils.json_to_sheet(excelData);

      worksheet['!cols'] = [
        { wch: 8 },
        { wch: 80 },
        { wch: 12 },
        { wch: 10 },
        { wch: 15 },
        { wch: 25 },
        { wch: 22 },
        { wch: 50 }
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'BOQ');

      const work = works.find(w => w.works_id === selectedWork);
      const fileName = `BOQ_${work?.work_name || 'Export'}_${new Date().toISOString().split('T')[0]}.xlsx`;

      XLSX.writeFile(workbook, fileName);

      alert('BOQ exported to Excel successfully');
    } catch (error: any) {
      console.error('Error downloading BOQ:', error);
      alert('Failed to download BOQ: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const addSection = () => {
    if (!boqData) return;

    setBOQData({
      ...boqData,
      sections: [
        ...boqData.sections,
        {
          name: `PART ${boqData.sections.length + 1}`,
          subsections: []
        }
      ]
    });
  };

  const addSubsection = (sectionIdx: number) => {
    if (!boqData) return;

    const newSections = [...boqData.sections];
    newSections[sectionIdx].subsections.push({
      name: 'New Subsection',
      items: []
    });
    setBOQData({ ...boqData, sections: newSections });
  };

  const addItem = (sectionIdx: number, subsectionIdx: number) => {
    if (!boqData) return;

    const newSections = [...boqData.sections];
    const items = newSections[sectionIdx].subsections[subsectionIdx].items;
    const nextItemNo = items.length > 0 ? Math.max(...items.map(i => i.item_no)) + 1 : 1;

    newSections[sectionIdx].subsections[subsectionIdx].items.push({
      item_no: nextItemNo,
      quantity: 0,
      description: '',
      rate_figure: 0,
      rate_words: '',
      unit: '',
      total_amount: 0
    });

    setBOQData({ ...boqData, sections: newSections });
  };

  const updateItem = (sectionIdx: number, subsectionIdx: number, itemIdx: number, field: keyof BOQItem, value: any) => {
    if (!boqData) return;

    const newSections = [...boqData.sections];
    const item = newSections[sectionIdx].subsections[subsectionIdx].items[itemIdx];

    item[field] = value;

    if (field === 'quantity' || field === 'rate_figure') {
      item.total_amount = Number((item.quantity * item.rate_figure).toFixed(2));
    }

    setBOQData({ ...boqData, sections: newSections });
  };

  const deleteItem = (sectionIdx: number, subsectionIdx: number, itemIdx: number) => {
    if (!boqData) return;

    const newSections = [...boqData.sections];
    newSections[sectionIdx].subsections[subsectionIdx].items.splice(itemIdx, 1);
    setBOQData({ ...boqData, sections: newSections });
  };

  const deleteSubsection = (sectionIdx: number, subsectionIdx: number) => {
    if (!boqData) return;

    const newSections = [...boqData.sections];
    newSections[sectionIdx].subsections.splice(subsectionIdx, 1);
    setBOQData({ ...boqData, sections: newSections });
  };

  const deleteSection = (sectionIdx: number) => {
    if (!boqData) return;

    const newSections = [...boqData.sections];
    newSections.splice(sectionIdx, 1);
    setBOQData({ ...boqData, sections: newSections });
  };

  const updateSectionName = (sectionIdx: number, name: string) => {
    if (!boqData) return;

    const newSections = [...boqData.sections];
    newSections[sectionIdx].name = name;
    setBOQData({ ...boqData, sections: newSections });
  };

  const updateSubsectionName = (sectionIdx: number, subsectionIdx: number, name: string) => {
    if (!boqData) return;

    const newSections = [...boqData.sections];
    newSections[sectionIdx].subsections[subsectionIdx].name = name;
    setBOQData({ ...boqData, sections: newSections });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <FileText className="w-6 h-6 text-blue-600" />
            <h2 className="text-2xl font-bold text-gray-800">BOQ Generation (Schedule B)</h2>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Approved Work
          </label>
          <select
            value={selectedWork || ''}
            onChange={(e) => handleWorkSelect(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">-- Select Work --</option>
            {works.map((work) => (
              <option key={work.works_id} value={work.works_id}>
                {work.work_name} ({work.division})
              </option>
            ))}
          </select>
        </div>

        {selectedWork && boqData && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div className="flex space-x-2">
                <button
                  onClick={generateBOQFromWork}
                  className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-lg hover:from-green-700 hover:to-teal-700 shadow-md"
                >
                  <FileText className="w-4 h-4" />
                  <span>Generate from Work</span>
                </button>
                <button
                  onClick={addSection}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Section</span>
                </button>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={saveBOQ}
                  disabled={saving}
                  className="flex items-center space-x-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Saving...' : 'Save BOQ'}</span>
                </button>
                <button
                  onClick={downloadExcel}
                  disabled={loading}
                  className="flex items-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{loading ? 'Downloading...' : 'Download Excel'}</span>
                </button>
              </div>
            </div>

            <div className="border border-gray-300 rounded-lg overflow-hidden">
              <div className="bg-gray-800 text-white text-center py-4 text-xl font-bold">
                Schedule - B
              </div>
              <div className="bg-gray-100 px-4 py-3 font-semibold text-gray-800">
                <input
                  type="text"
                  value={boqData.project_title}
                  onChange={(e) => setBOQData({ ...boqData, project_title: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-300 rounded"
                  placeholder="Project Title"
                />
              </div>

              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b-2 border-gray-300">
                    <th className="border border-gray-300 px-3 py-3 text-sm font-semibold text-gray-700 w-16">
                      Item No.
                    </th>
                    <th className="border border-gray-300 px-3 py-3 text-sm font-semibold text-gray-700 w-32">
                      Estimated Quantity may be more or less
                    </th>
                    <th className="border border-gray-300 px-3 py-3 text-sm font-semibold text-gray-700">
                      Item of Work
                    </th>
                    <th className="border border-gray-300 px-3 py-3 text-sm font-semibold text-gray-700" colSpan={2}>
                      Estimated Rate
                    </th>
                    <th className="border border-gray-300 px-3 py-3 text-sm font-semibold text-gray-700 w-24">
                      Unit
                    </th>
                    <th className="border border-gray-300 px-3 py-3 text-sm font-semibold text-gray-700 w-32">
                      Total Amount
                    </th>
                    <th className="border border-gray-300 px-3 py-3 text-sm font-semibold text-gray-700 w-24">
                      Actions
                    </th>
                  </tr>
                  <tr className="bg-gray-50 border-b border-gray-300">
                    <th className="border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600">1</th>
                    <th className="border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600">2</th>
                    <th className="border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600">3</th>
                    <th className="border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 w-32">in figure (4)</th>
                    <th className="border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600">in words (5)</th>
                    <th className="border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600">6</th>
                    <th className="border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600">7</th>
                    <th className="border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600"></th>
                  </tr>
                </thead>
                <tbody>
                  {boqData.sections.map((section, sectionIdx) => (
                    <React.Fragment key={sectionIdx}>
                      <tr className="bg-blue-50">
                        <td colSpan={8} className="border border-gray-300 px-4 py-2">
                          <div className="flex items-center justify-between">
                            <input
                              type="text"
                              value={section.name}
                              onChange={(e) => updateSectionName(sectionIdx, e.target.value)}
                              className="flex-1 px-2 py-1 font-bold text-gray-800 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                            />
                            <div className="flex space-x-2">
                              <button
                                onClick={() => addSubsection(sectionIdx)}
                                className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                              >
                                Add Subsection
                              </button>
                              <button
                                onClick={() => deleteSection(sectionIdx)}
                                className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>

                      {section.subsections.map((subsection, subsectionIdx) => (
                        <React.Fragment key={subsectionIdx}>
                          <tr className="bg-yellow-50">
                            <td colSpan={8} className="border border-gray-300 px-4 py-2">
                              <div className="flex items-center justify-between">
                                <input
                                  type="text"
                                  value={subsection.name}
                                  onChange={(e) => updateSubsectionName(sectionIdx, subsectionIdx, e.target.value)}
                                  className="flex-1 px-2 py-1 font-semibold text-gray-800 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-yellow-500 rounded"
                                />
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => addItem(sectionIdx, subsectionIdx)}
                                    className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                                  >
                                    Add Item
                                  </button>
                                  <button
                                    onClick={() => deleteSubsection(sectionIdx, subsectionIdx)}
                                    className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>

                          {subsection.items.map((item, itemIdx) => (
                            <tr key={itemIdx} className="hover:bg-gray-50">
                              <td className="border border-gray-300 px-2 py-2 text-center">
                                <input
                                  type="number"
                                  value={item.item_no}
                                  onChange={(e) => updateItem(sectionIdx, subsectionIdx, itemIdx, 'item_no', parseInt(e.target.value))}
                                  className="w-full px-2 py-1 text-center border border-gray-300 rounded text-sm"
                                />
                              </td>
                              <td className="border border-gray-300 px-2 py-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.quantity}
                                  onChange={(e) => updateItem(sectionIdx, subsectionIdx, itemIdx, 'quantity', parseFloat(e.target.value))}
                                  className="w-full px-2 py-1 text-right border border-gray-300 rounded text-sm"
                                />
                              </td>
                              <td className="border border-gray-300 px-2 py-2">
                                <textarea
                                  value={item.description}
                                  onChange={(e) => updateItem(sectionIdx, subsectionIdx, itemIdx, 'description', e.target.value)}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                  rows={2}
                                />
                              </td>
                              <td className="border border-gray-300 px-2 py-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.rate_figure}
                                  onChange={(e) => updateItem(sectionIdx, subsectionIdx, itemIdx, 'rate_figure', parseFloat(e.target.value))}
                                  className="w-full px-2 py-1 text-right border border-gray-300 rounded text-sm"
                                />
                              </td>
                              <td className="border border-gray-300 px-2 py-2">
                                <input
                                  type="text"
                                  value={item.rate_words}
                                  onChange={(e) => updateItem(sectionIdx, subsectionIdx, itemIdx, 'rate_words', e.target.value)}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                  placeholder="In words"
                                />
                              </td>
                              <td className="border border-gray-300 px-2 py-2">
                                <input
                                  type="text"
                                  value={item.unit}
                                  onChange={(e) => updateItem(sectionIdx, subsectionIdx, itemIdx, 'unit', e.target.value)}
                                  className="w-full px-2 py-1 text-center border border-gray-300 rounded text-sm"
                                />
                              </td>
                              <td className="border border-gray-300 px-2 py-2 text-right font-semibold">
                                {item.total_amount.toFixed(2)}
                              </td>
                              <td className="border border-gray-300 px-2 py-2 text-center">
                                <button
                                  onClick={() => deleteItem(sectionIdx, subsectionIdx, itemIdx)}
                                  className="text-red-600 hover:text-red-800"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BOQGeneration;
