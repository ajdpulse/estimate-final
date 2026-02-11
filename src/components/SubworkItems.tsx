import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { SubworkItem, ItemMeasurement, ItemRate } from '../types';
import {
  Plus,
  Edit2,
  Trash2,
  Eye,
  Package,
  Calculator,
  X,
  Search,
  CheckCircle
} from 'lucide-react';
import RoyaltyTestingItems from './RoyaltyTestingItems';
import RoyaltyMeasurements from './RoyaltyMeasurements';
import TestingMeasurements from './TestingMeasurements';

interface SubworkItemsProps {
  subworkId: string;
  subworkName: string;
  isOpen: boolean;
  onClose: () => void;
}

const SubworkItems: React.FC<SubworkItemsProps> = ({
  subworkId,
  subworkName,
  isOpen,
  onClose
}) => {
  const { user } = useAuth();
  const [subworkItems, setSubworkItems] = useState<SubworkItem[]>([]);
  const [itemRatesMap, setItemRatesMap] = useState<{ [key: string]: ItemRate[] }>({});
  const [royaltyMeasurementsMap, setRoyaltyMeasurementsMap] = useState<{ [key: string]: { hb_metal: number; murum: number; sand: number } }>({});
  const [testingMeasurementsMap, setTestingMeasurementsMap] = useState<{ [key: string]: { quantity: number; required_tests: number } }>({});
  const [loading, setLoading] = useState(false);
  const [worksId, setWorksId] = useState<string>('');
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showEditItemModal, setShowEditItemModal] = useState(false);
  const [showMeasurementsModal, setShowMeasurementsModal] = useState(false);
  const [showRoyaltyModal, setShowRoyaltyModal] = useState(false);
  const [showTestingModal, setShowTestingModal] = useState(false);
  const [showRoyaltyMeasurementsModal, setShowRoyaltyMeasurementsModal] = useState(false);
  const [showTestingMeasurementsModal, setShowTestingMeasurementsModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SubworkItem | null>(null);
  const [ssrSuggestions, setSsrSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingSSR, setSearchingSSR] = useState(false);
  const [descriptionQuery, setDescriptionQuery] = useState('');
  const [parentSubworkSrNo, setParentSubworkSrNo] = useState<number | undefined>(undefined);
  // Map the rates for the selected item to only include their descriptions
  const [ratesArray, setRatesArray] = useState<ItemRate[]>([]);
  const [rateDescriptions, setRateDescriptions] = useState<string[]>([]);
  const [selectedSrNo, setSelectedSrNo] = useState();
  const navigate = useNavigate();
  const [showRateAnalysisModal, setShowRateAnalysisModal] = useState(false);
  const [rateAnalysisItem, setRateAnalysisItem] = useState<SubworkItem | null>(null);
  const [rateAnalysisItemSrNo, setRateAnalysisItemSrNo] = useState<number | undefined>(undefined);
  const [rateAnalysisBaseRate, setRateAnalysisBaseRate] = useState<number | undefined>(undefined);
  const [rateAnalysisContext, setRateAnalysisContext] = useState<{
    source: 'main' | 'modal';
    itemSrNo?: number;
    modalIndex?: number;
  } | null>(null);
  // Store pending rate analysis payloads created from the Add/Edit Item modal
  // keyed by the modal rate index so they can be persisted after the
  // subwork item is created.
  const [pendingRateAnalysisByModalIndex, setPendingRateAnalysisByModalIndex] = useState<{ [key: number]: any }>({});

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [newItem, setNewItem] = useState<Partial<SubworkItem>>({
    description_of_item: '',
    category: ''
  });
  const [isManualEntry, setIsManualEntry] = useState(false);
  const [itemRates, setItemRates] = useState<Array<{
    description: string;
    rate: number;
    unit: string;
  }>>([{ description: '', rate: 0, unit: '' }]);

  const [csrSuggestions, setCsrSuggestions] = useState<any[]>([]);
  const [showCsrSuggestions, setShowCsrSuggestions] = useState(false);
  const [searchingCSR, setSearchingCSR] = useState(false);
  const [csrSearchQuery, setCsrSearchQuery] = useState('');
  const [selectedCSRItem, setSelectedCSRItem] = useState<any>(null);
  const [ssrSearchSuggestions, setSsrSearchSuggestions] = useState<any[]>([]);
  const [showSsrSearchSuggestions, setShowSsrSearchSuggestions] = useState(false);
  const [searchingSSRTable, setSearchingSSRTable] = useState(false);
  const [ssrSearchQuery, setSsrSearchQuery] = useState('');
  const [selectedSSRItem, setSelectedSSRItem] = useState<any>(null);
  const [searchSource, setSearchSource] = useState<'CSR' | 'SSR'>('CSR');
  const [rateSearchQueries, setRateSearchQueries] = useState<{ [key: number]: string }>({});
  const [rateSuggestions, setRateSuggestions] = useState<{ [key: number]: any[] }>({});
  const [showRateSuggestions, setShowRateSuggestions] = useState<{ [key: number]: boolean }>({});
  const [searchingRate, setSearchingRate] = useState<{ [key: number]: boolean }>({});
  const rateSearchTimeoutRefs = useRef<{ [key: number]: NodeJS.Timeout }>({});

  useEffect(() => {
    if (isOpen && subworkId) {
      const init = async () => {
        await fetchWorksId();
        fetchSubworkItems();
      };
      init();
    }
  }, [isOpen, subworkId]);

  const searchSSRItems = async (query: string) => {
    if (!query || query.trim().length < 2) {
      setSsrSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      setSearchingSSR(true);

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ssr-search`;
      const headers = {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: query.trim() })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      // Only show suggestions if we have actual results from the Python file
      if (data.results && data.results.length > 0) {
        setSsrSuggestions(data.results);
        setShowSuggestions(true);
      } else {
        setSsrSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error('Error searching SSR items:', error);
      setSsrSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setSearchingSSR(false);
    }
  };

  const handleDescriptionChange = (value: string) => {
    setDescriptionQuery(value);
    setNewItem({ ...newItem, description_of_item: value });

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // If input is empty or too short, clear suggestions
    if (!value || value.trim().length < 2) {
      setSsrSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // Debounce search with new timeout
    searchTimeoutRef.current = setTimeout(() => {
      searchSSRItems(value);
    }, 500);
  };

  const selectSSRItem = (item: any) => {
    // Add the SSR item as a new rate entry
    const newRate = {
      description: item.description,
      rate: parseFloat(item.rate_2024_25 || item.rate_2023_24 || '0'),
      unit: item.unit || ''
    };

    setItemRates(prev => {
      const updated = [...prev];
      // Replace the first empty entry or add new one
      const emptyIndex = updated.findIndex(r => !r.description && !r.rate);
      if (emptyIndex >= 0) {
        updated[emptyIndex] = newRate;
      } else {
        updated.push(newRate);
      }
      return updated;
    });

    setDescriptionQuery(item.description);
    setShowSuggestions(false);
    setSsrSuggestions([]);

    // Clear any pending search timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
  };

  const searchCSRItems = async (query: string) => {
    if (!query || query.trim().length < 2) {
      setCsrSuggestions([]);
      setShowCsrSuggestions(false);
      return;
    }

    try {
      setSearchingCSR(true);

      const { data, error } = await supabase
        .schema('estimate')
        .from('CSR-2022-2023')
        .select('*')
        .or(`"Item No".ilike.%${query}%,"Item".ilike.%${query}%,"Reference".ilike.%${query}%`)
        .limit(20);

      if (error) throw error;

      if (data && data.length > 0) {
        setCsrSuggestions(data);
        setShowCsrSuggestions(true);
      } else {
        setCsrSuggestions([]);
        setShowCsrSuggestions(false);
      }
    } catch (error) {
      console.error('Error searching CSR items:', error);
      setCsrSuggestions([]);
      setShowCsrSuggestions(false);
    } finally {
      setSearchingCSR(false);
    }
  };

  const handleCSRSearchChange = (value: string) => {
    setCsrSearchQuery(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!value || value.trim().length < 2) {
      setCsrSuggestions([]);
      setShowCsrSuggestions(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchCSRItems(value);
    }, 500);
  };

  const selectCSRItem = async (item: any) => {
    setCsrSearchQuery(`${item['Item No']} - ${item['Item']}`);

    const baseRate = parseFloat(item['Completed Item']) || 0;
    const unit = item['Unit'] || '';
    const labour = parseFloat(item['Labour']) || 0;

    let fullDescription = item['Item'] || '';
    let parentDescription = '';

    const itemNo = item['Item No'];
    if (itemNo && /^\d+-[A-Za-z]/.test(itemNo)) {
      const parentItemNo = itemNo.split('-')[0];

      try {
        const { data: parentData, error } = await supabase
          .schema('estimate')
          .from('CSR-2022-2023')
          .select('Item')
          .eq('Item No', parentItemNo)
          .maybeSingle();

        if (!error && parentData) {
          parentDescription = parentData['Item'] || '';
          fullDescription = `${parentDescription}\n\n${item['Item']}`;
        }
      } catch (error) {
        console.error('Error fetching parent item:', error);
      }
    }

    setNewItem({
      ...newItem,
      description_of_item: fullDescription
    });

    setSelectedCSRItem({
      ...item,
      parentDescription: parentDescription
    });

    setItemRates([{
      description: fullDescription,
      rate: baseRate,
      unit: unit
    }]);

    setShowCsrSuggestions(false);
    setCsrSuggestions([]);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
  };

  const searchSSRTableItems = async (query: string) => {
    if (!query || query.trim().length < 2) {
      setSsrSearchSuggestions([]);
      setShowSsrSearchSuggestions(false);
      return;
    }

    try {
      setSearchingSSRTable(true);

      const { data, error } = await supabase
        .schema('estimate')
        .from('SSR_2022_23')
        .select('*')
        .or(`"SSR Item No.".ilike.%${query}%,"Reference No.".ilike.%${query}%,"Description of the item".ilike.%${query}%`)
        .limit(20);

      if (error) throw error;

      if (data && data.length > 0) {
        setSsrSearchSuggestions(data);
        setShowSsrSearchSuggestions(true);
      } else {
        setSsrSearchSuggestions([]);
        setShowSsrSearchSuggestions(false);
      }
    } catch (error) {
      console.error('Error searching SSR items:', error);
      setSsrSearchSuggestions([]);
      setShowSsrSearchSuggestions(false);
    } finally {
      setSearchingSSRTable(false);
    }
  };

  const handleSSRSearchChange = (value: string) => {
    setSsrSearchQuery(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!value || value.trim().length < 2) {
      setSsrSearchSuggestions([]);
      setShowSsrSearchSuggestions(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchSSRTableItems(value);
    }, 500);
  };

  const selectSSRTableItem = (item: any) => {
    setSsrSearchQuery(`${item['SSR Item No.']} - ${item['Description of the item']}`);

    const completedRate = parseInt(item['Proposed Completed Rate for 2022-23\nexcluding GST\nIn Rs.']) || 0;
    const labourRate = parseFloat(item['Proposed Labour Rate for 2022-23\nexcluding GST\nIn Rs.']) || 0;
    const unit = item['Unit'] || '';
    const description = item['Description of the item'] || '';

    setNewItem({
      ...newItem,
      description_of_item: description
    });

    setSelectedSSRItem(item);

    setItemRates([{
      description: description,
      rate: completedRate,
      unit: unit
    }]);

    setShowSsrSearchSuggestions(false);
    setSsrSearchSuggestions([]);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
  };

  const fetchWorksId = async () => {
    try {
      const { data, error } = await supabase
        .schema('estimate')
        .from('subworks')
        .select('works_id')
        .eq('subworks_id', subworkId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setWorksId(data.works_id);
      }
    } catch (error) {
      console.error('Error fetching works_id:', error);
    }
  };

  const fetchSubworkItems = async () => {
    try {
      setLoading(true);

      // First, get the works_id for this subwork
      const { data: subworkData, error: subworkError } = await supabase
        .schema('estimate')
        .from('subworks')
        .select('works_id')
        .eq('subworks_id', subworkId)
        .maybeSingle();

      if (subworkError) throw subworkError;
      const currentWorksId = subworkData?.works_id || '';
      console.log('Current works_id for measurements:', currentWorksId);

      const { data, error } = await supabase
        .schema('estimate')
        .from('subwork_items')
        .select('*')
        .eq('subwork_id', subworkId)
        .order('item_number', { ascending: true });

      if (error) throw error;
      setSubworkItems(data || []);

      // Fetch rates for all items
      if (data && data.length > 0) {
        await fetchItemRates(data);
        await fetchRoyaltyMeasurements(data, currentWorksId);
        await fetchTestingMeasurements(data, currentWorksId);
      }
    } catch (error) {
      console.error('Error fetching subwork items:', error);
    } finally {
      setLoading(false);
    }
  };

  // Function to refresh a specific item's data
  const refreshItemData = async (itemSrNo: number) => {
    try {
      const { data, error } = await supabase
        .schema('estimate')
        .from('subwork_items')
        .select('*')
        .eq('sr_no', itemSrNo)
        .single();

      if (error) throw error;

      // Update the item in the local state
      setSubworkItems(prev =>
        prev.map(item =>
          item.sr_no === itemSrNo ? data : item
        )
      );

    } catch (error) {
      console.error('Error refreshing item data:', error);
    }
  };
  const fetchItemRates = async (items: SubworkItem[]) => {
    try {
      const itemSrNos = items.map(item => item.sr_no);

      const { data: rates, error } = await supabase
        .schema('estimate')
        .from('item_rates')
        .select('*')
        .in('subwork_item_sr_no', itemSrNos)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Group rates by subwork_item_sr_no
      const ratesMap: { [key: string]: ItemRate[] } = {};
      (rates || []).forEach(rate => {
        const key = rate.subwork_item_sr_no.toString();
        if (!ratesMap[key]) {
          ratesMap[key] = [];
        }
        ratesMap[key].push(rate);
      });

      setItemRatesMap(ratesMap);
    } catch (error) {
      console.error('Error fetching item rates:', error);
    }
  };

  const fetchRoyaltyMeasurements = async (items: SubworkItem[], currentWorksId: string) => {
    try {
      const royaltyItems = items.filter(item => item.category === 'royalty');
      console.log('Royalty items found:', royaltyItems.length, royaltyItems);
      if (royaltyItems.length === 0) return;

      // Get subwork sr_no (integer) from subworkId (string)
      const { data: subworkData, error: subworkError } = await supabase
        .schema('estimate')
        .from('subworks')
        .select('sr_no')
        .eq('subworks_id', subworkId)
        .maybeSingle();

      if (subworkError) throw subworkError;
      if (!subworkData) {
        console.error('Subwork not found for subworkId:', subworkId);
        return;
      }

      const subworkSrNo = subworkData.sr_no;

      console.log('Fetching ALL royalty measurements for subwork');
      console.log('Query filters - works_id:', currentWorksId, 'subwork_id:', subworkSrNo);

      // Fetch ALL measurements for this subwork (not just royalty items)
      const { data: measurements, error } = await supabase
        .schema('estimate')
        .from('royalty_measurements')
        .select('subwork_item_id, hb_metal, murum, sand')
        .eq('works_id', currentWorksId)
        .eq('subwork_id', subworkSrNo);

      if (error) throw error;

      console.log('Royalty measurements fetched:', measurements);

      // Calculate total for ALL materials in the subwork
      const totalMaterials = { hb_metal: 0, murum: 0, sand: 0 };
      (measurements || []).forEach(measurement => {
        totalMaterials.hb_metal += Number(measurement.hb_metal) || 0;
        totalMaterials.murum += Number(measurement.murum) || 0;
        totalMaterials.sand += Number(measurement.sand) || 0;
      });

      console.log('Total materials for subwork:', totalMaterials);

      // Assign the same total to ALL royalty items
      const measurementsMap: { [key: string]: { hb_metal: number; murum: number; sand: number } } = {};
      royaltyItems.forEach(item => {
        measurementsMap[item.sr_no.toString()] = { ...totalMaterials };
      });

      console.log('Royalty measurements map:', measurementsMap);
      setRoyaltyMeasurementsMap(measurementsMap);
    } catch (error) {
      console.error('Error fetching royalty measurements:', error);
    }
  };

  const fetchTestingMeasurements = async (items: SubworkItem[], currentWorksId: string) => {
    try {
      const testingItems = items.filter(item => item.category === 'testing');
      console.log('Testing items found:', testingItems.length, testingItems);
      if (testingItems.length === 0) return;

      // Get subwork sr_no (integer) from subworkId (string)
      const { data: subworkData, error: subworkError } = await supabase
        .schema('estimate')
        .from('subworks')
        .select('sr_no')
        .eq('subworks_id', subworkId)
        .maybeSingle();

      if (subworkError) throw subworkError;
      if (!subworkData) {
        console.error('Subwork not found for subworkId:', subworkId);
        return;
      }

      const subworkSrNo = subworkData.sr_no;

      const itemSrNos = testingItems.map(item => item.sr_no);
      console.log('Fetching testing measurements for item sr_nos:', itemSrNos);
      console.log('Query filters - works_id:', currentWorksId, 'subwork_id:', subworkSrNo);

      const { data: measurements, error } = await supabase
        .schema('estimate')
        .from('testing_measurements')
        .select('subwork_item_id, quantity, required_tests')
        .in('subwork_item_id', itemSrNos)
        .eq('works_id', currentWorksId)
        .eq('subwork_id', subworkSrNo);

      if (error) throw error;

      console.log('Testing measurements fetched:', measurements);

      const measurementsMap: { [key: string]: { quantity: number; required_tests: number } } = {};
      (measurements || []).forEach(measurement => {
        const key = measurement.subwork_item_id.toString();
        measurementsMap[key] = {
          quantity: Number(measurement.quantity) || 0,
          required_tests: Number(measurement.required_tests) || 0
        };
      });

      console.log('Testing measurements map:', measurementsMap);
      setTestingMeasurementsMap(measurementsMap);
    } catch (error) {
      console.error('Error fetching testing measurements:', error);
    }
  };

  const generateItemNumber = async (): Promise<string> => {
    try {
      const { data, error } = await supabase
        .schema('estimate')
        .from('subwork_items')
        .select('item_number')
        .eq('subwork_id', subworkId)
        .order('item_number', { ascending: false })
        .limit(1);

      if (error) throw error;

      let nextNumber = 1;
      if (data && data.length > 0) {
        const lastNumber = parseInt(data[0].item_number);
        nextNumber = lastNumber + 1;
      }

      return nextNumber.toString();
    } catch (error) {
      console.error('Error generating item number:', error);
      return '1';
    }
  };

  useEffect(() => {
    const fetchParentSubworkSrNo = async () => {
      if (!subworkId) return;

      const { data, error } = await supabase
        .schema('estimate')
        .from('subworks')
        .select('sr_no')
        .eq('subworks_id', subworkId)
        .maybeSingle();

      if (!error && data?.sr_no) {
        setParentSubworkSrNo(data.sr_no);
      }
    };

    fetchParentSubworkSrNo();
  }, [subworkId]);


  const handleAddItem = async () => {
    if (!newItem.description_of_item || !user) return;

    // Validate that at least one rate entry is complete
    const validRates = itemRates.filter(rate => rate.description && rate.rate > 0);
    if (validRates.length === 0) {
      alert('Please add at least one valid rate entry with description and rate.');
      return;
    }

    try {
      const itemNumber = await generateItemNumber();

      // Calculate total amount from all rates (for now, just sum all rates)
      const totalAmount = validRates.reduce((sum, rate) => sum + rate.rate, 0);

      // For now, we'll store the first rate's unit as the main unit
      const mainUnit = validRates[0]?.unit || '';

      // Insert the subwork item first
      const { data: insertedItem, error: itemError } = await supabase
        .schema('estimate')
        .from('subwork_items')
        .insert({
          description_of_item: newItem.description_of_item,
          category: newItem.category,
          subwork_id: subworkId,
          item_number: itemNumber,
          ssr_rate: validRates[0]?.rate || 0,
          ssr_unit: mainUnit,
          csr_item_no: selectedCSRItem ? selectedCSRItem['Item No'] : (selectedSSRItem ? selectedSSRItem['SSR Item No.'] : null),
          csr_reference: selectedCSRItem ? selectedCSRItem['Reference'] : (selectedSSRItem ? selectedSSRItem['Reference No.'] : null),
          csr_labour_cost: selectedCSRItem ? parseFloat(selectedCSRItem['Labour']) || 0 : (selectedSSRItem ? parseFloat(selectedSSRItem['Proposed Labour Rate for 2022-23\nexcluding GST\nIn Rs.']) || 0 : 0),
          csr_unit: selectedCSRItem ? selectedCSRItem['Unit'] : (selectedSSRItem ? selectedSSRItem['Unit'] : null),
          created_by: user.id
        })
        .select()
        .single();

      if (itemError) throw itemError;

      // 🔹 Fetch calculated_quantity from item_measurements for this subwork_item
      const { data: measurementData, error: measurementError } = await supabase
        .schema('estimate')
        .from('item_measurements')
        .select('calculated_quantity')
        .eq('subwork_item_id', insertedItem.sr_no)
        .maybeSingle();

      if (measurementError) throw measurementError;

      const ssrQuantity = measurementData?.calculated_quantity || 1;

      // Insert all the rates for this item linked by subwork_item_sr_no
      const ratesToInsert = validRates.map(rate => ({
        subwork_item_sr_no: insertedItem.sr_no,
        description: rate.description,
        rate: rate.rate,
        ssr_unit: rate.unit,
        ssr_quantity: ssrQuantity,
        rate_total_amount: rate.rate * ssrQuantity,
        created_by: user.id
      }));

      const { error: ratesError } = await supabase
        .schema('estimate')
        .from('item_rates')
        .insert(ratesToInsert);

      if (ratesError) throw ratesError;

      // If there are any pending rate analysis payloads created in the
      // Add/Edit item modal (before the subwork item existed), persist
      // them now that we have the `insertedItem.sr_no` value.
      try {
        const pendingKeys = Object.keys(pendingRateAnalysisByModalIndex);
        for (const key of pendingKeys) {
          const idx = parseInt(key, 10);
          const payload = pendingRateAnalysisByModalIndex[idx];
          if (payload) {
            const analysisToInsert = {
              ...payload,
              subwork_item_id: insertedItem.sr_no,
              created_by: user.id,
              updated_at: new Date().toISOString()
            };
            const { error: analysisErr } = await supabase
              .schema('estimate')
              .from('item_rate_analysis')
              .insert(analysisToInsert);
            if (analysisErr) console.error('Error inserting pending rate analysis:', analysisErr);
          }
        }
      } catch (err) {
        console.error('Error while persisting pending rate analyses:', err);
      }

      // Clear pending payloads after attempting persistence
      setPendingRateAnalysisByModalIndex({});

      setShowAddItemModal(false);
      setNewItem({
        description_of_item: '',
        category: '',
        ssr_quantity: 1
      });
      setItemRates([{ description: '', rate: 0, unit: '' }]);
      setDescriptionQuery('');
      setSsrSuggestions([]);
      setShowSuggestions(false);
      setCsrSearchQuery('');
      setCsrSuggestions([]);
      setShowCsrSuggestions(false);
      setSsrSearchQuery('');
      setSsrSearchSuggestions([]);
      setShowSsrSearchSuggestions(false);
      setSelectedCSRItem(null);
      setSelectedSSRItem(null);
      setIsManualEntry(false);
      fetchSubworkItems();
    } catch (error) {
      console.error('Error adding item:', error);
    }
  };

  const handleEditItem = (item: SubworkItem) => {
    setSelectedItem(item);
    setDescriptionQuery(item.description_of_item);

    // Load existing rates for this item
    const existingRates = itemRatesMap[item.sr_no.toString()] || [];
    if (existingRates.length > 0) {
      const rates = existingRates.map(rate => ({
        description: rate.description,
        rate: rate.rate,
        unit: rate.ssr_unit || '',
        ssr_quantity: rate.ssr_quantity || 1
      }));
      setItemRates(rates);

      // Initialize rate search queries with descriptions
      const searchQueries: { [key: number]: string } = {};
      rates.forEach((rate, index) => {
        searchQueries[index] = rate.description;
      });
      setRateSearchQueries(searchQueries);
    } else {
      // Fallback to item's main rate if no separate rates exist
      const rates = [{
        description: item.description_of_item,
        rate: item.rate_total_amount || 0,
        unit: item.ssr_unit || '',
        ssr_quantity: 1
      }];
      setItemRates(rates);
      setRateSearchQueries({ 0: item.description_of_item });
    }

    setNewItem({
      description_of_item: item.description_of_item,
      category: item.category
    });
    setShowEditItemModal(true);
  };


  const handleUpdateItem = async () => {
    if (!newItem.description_of_item || !selectedItem) return;

    const validRates = itemRates.filter(rate => rate.description && rate.rate > 0);
    if (validRates.length === 0) {
      alert('Please add at least one valid rate entry with description and rate.');
      return;
    }

    try {
      const totalAmount = validRates.reduce((sum, rate) => sum + rate.rate, 0);
      const mainUnit = validRates[0]?.unit || '';

      // Update the subwork item
      const { error } = await supabase
        .schema('estimate')
        .from('subwork_items')
        .update({
          description_of_item: newItem.description_of_item,
          category: newItem.category,
          // rate_total_amount: totalAmount,
          ssr_unit: mainUnit,
          total_item_amount: totalAmount
        })
        .eq('sr_no', selectedItem.sr_no);

      if (error) throw error;

      // Delete existing rates for this item
      const { error: deleteError } = await supabase
        .schema('estimate')
        .from('item_rates')
        .delete()
        .eq('subwork_item_sr_no', selectedItem.sr_no);

      if (deleteError) throw deleteError;

      // 🔹 Fetch calculated_quantity from item_measurements for this subwork_item
      const { data: measurementData, error: measurementError } = await supabase
        .schema('estimate')
        .from('item_measurements')
        .select('calculated_quantity')
        .eq('subwork_item_id', selectedItem.sr_no)
        .maybeSingle();

      if (measurementError) throw measurementError;

      const ssrQuantity = measurementData?.calculated_quantity || 1;

      // Insert updated rates
      const ratesToInsert = validRates.map(rate => ({
        subwork_item_sr_no: selectedItem.sr_no,
        description: rate.description,
        rate: rate.rate,
        ssr_unit: rate.unit,
        ssr_quantity: ssrQuantity,
        rate_total_amount: rate.rate * ssrQuantity,
        created_by: user.id
      }));

      const { error: ratesError } = await supabase
        .schema('estimate')
        .from('item_rates')
        .insert(ratesToInsert);

      if (ratesError) throw ratesError;

      setShowEditItemModal(false);
      setSelectedItem(null);
      setNewItem({
        description_of_item: '',
        category: ''
      });
      setItemRates([{ description: '', rate: 0, unit: '' }]);
      setRateSearchQueries({});
      setRateSuggestions({});
      setShowRateSuggestions({});
      Object.values(rateSearchTimeoutRefs.current).forEach(timeout => clearTimeout(timeout));
      rateSearchTimeoutRefs.current = {};
      fetchSubworkItems();
    } catch (error) {
      console.error('Error updating item:', error);
    }
  };

const handleRoyaltyClick = async (item: SubworkItem) => {
  try {
    if (!item.sr_no) return;

    // Get subwork sr_no
    const { data: subworkData } = await supabase
      .schema('estimate')
      .from('subworks')
      .select('sr_no')
      .eq('subworks_id', subworkId)
      .maybeSingle();

    if (!subworkData) {
      console.error('Subwork not found');
      return;
    }

    // Get measurements for this item
    const { data: measurements } = await supabase
      .schema('estimate')
      .from('item_measurements')
      .select('calculated_quantity')
      .eq('subwork_item_id', item.sr_no);

    const totalMeasurement =
      measurements?.reduce(
        (sum, m) => sum + (m.calculated_quantity || 0),
        0
      ) || 0;

    // Get rate analysis factors
    const { data: analysis } = await supabase
      .schema('estimate')
      .from('item_rate_analysis')
      .select('entries')
      .eq('subwork_item_id', item.sr_no)
      .maybeSingle();

    let metalFactor = 0;
    let murumFactor = 0;
    let sandFactor = 0;

    if (analysis?.entries) {
      analysis.entries.forEach((entry: any) => {
        const label = entry.label?.toLowerCase() || '';
        const factor = entry.factor || 0;

        if (label.includes('metal')) metalFactor = factor;
        if (label.includes('murum') || label.includes('murrum'))
          murumFactor = factor;
        if (label.includes('sand')) sandFactor = factor;
      });
    }

    // Insert measurement if not exists
    const { data: existing } = await supabase
      .schema('estimate')
      .from('royalty_measurements')
      .select('sr_no')
      .eq('subwork_item_id', item.sr_no)
      .maybeSingle();

    if (!existing) {
      await supabase
        .schema('estimate')
        .from('royalty_measurements')
        .insert({
          works_id: worksId,
          subwork_id: subworkData.sr_no,
          subwork_item_id: item.sr_no,
          measurement: totalMeasurement,
          metal_factor: metalFactor,
          murum_factor: murumFactor,
          sand_factor: sandFactor,
          created_by: user?.id
        });
    }

    // ---------- UPDATE item_rates.ssr_quantity ----------
    const royaltyData =
      royaltyMeasurementsMap[item.sr_no.toString()] || {
        hb_metal: 0,
        murum: 0,
        sand: 0
      };

    const totalRoyaltyQty =
      royaltyData.hb_metal +
      royaltyData.murum +
      royaltyData.sand;

    // Fetch rates for item
    const { data: rates } = await supabase
      .schema('estimate')
      .from('item_rates')
      .select('sr_no, description, rate')
      .eq('subwork_item_sr_no', item.sr_no);

    if (rates && rates.length > 0) {
      for (const rate of rates) {
        const desc = (rate.description || '').toLowerCase();

        let qty = totalRoyaltyQty;

        if (desc.includes('metal')) qty = royaltyData.hb_metal;
        else if (desc.includes('murum')) qty = royaltyData.murum;
        else if (desc.includes('sand')) qty = royaltyData.sand;

        await supabase
          .schema('estimate')
          .from('item_rates')
          .update({
            ssr_quantity: Number(qty.toFixed(3)),
            rate_total_amount:
              Number(qty.toFixed(3)) * Number(rate.rate || 0)
          })
          .eq('sr_no', rate.sr_no);
      }
    }

    // Open modal
    setShowRoyaltyMeasurementsModal(true);
  } catch (error) {
    console.error('Error handling royalty click:', error);
  }
};


  const handleTestingClick = async (item: SubworkItem) => {
    try {
      if (!item.sr_no) return;

      // Get subwork sr_no
      const { data: subworkData } = await supabase
        .schema('estimate')
        .from('subworks')
        .select('sr_no')
        .eq('subworks_id', subworkId)
        .maybeSingle();

      if (!subworkData) {
        console.error('Subwork not found');
        return;
      }

      // Get measurements for this item
      const { data: measurements } = await supabase
        .schema('estimate')
        .from('item_measurements')
        .select('calculated_quantity')
        .eq('subwork_item_id', item.sr_no);

      // Calculate total measurement
      const totalMeasurement = measurements?.reduce((sum, m) => sum + (m.calculated_quantity || 0), 0) || 0;

      // Check if testing measurement already exists
      const { data: existing } = await supabase
        .schema('estimate')
        .from('testing_measurements')
        .select('sr_no')
        .eq('subwork_item_id', item.sr_no)
        .maybeSingle();

      // If doesn't exist, create it
      if (!existing) {
        await supabase
          .schema('estimate')
          .from('testing_measurements')
          .insert({
            works_id: worksId,
            subwork_id: subworkData.sr_no,
            subwork_item_id: item.sr_no,
            quantity: totalMeasurement,
            description: '',
            required_tests: 0,
            created_by: user?.id
          });
      }

      // Open the testing measurements modal
      setShowTestingMeasurementsModal(true);
    } catch (error) {
      console.error('Error handling testing click:', error);
    }
  };

  const handleDeleteItem = async (item: SubworkItem) => {
    if (!confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
      return;
    }

    try {
      // Delete rates first (should cascade automatically, but being explicit)
      await supabase
        .schema('estimate')
        .from('item_rates')
        .delete()
        .eq('subwork_item_sr_no', item.sr_no);

      // Delete the item
      const { error } = await supabase
        .schema('estimate')
        .from('subwork_items')
        .delete()
        .eq('sr_no', item.sr_no);

      if (error) throw error;
      fetchSubworkItems();
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const ensureParentSubworkSrNo = async (): Promise<number | undefined> => {
    if (parentSubworkSrNo) return parentSubworkSrNo;

    if (!subworkId) return undefined;

    const { data, error } = await supabase
      .schema('estimate')
      .from('subworks')
      .select('sr_no')
      .eq('subworks_id', subworkId)
      .maybeSingle();

    if (!error && data?.sr_no) {
      setParentSubworkSrNo(data.sr_no);
      return data.sr_no;
    }

    return undefined;
  };

  const handleViewMeasurements = (item: SubworkItem) => {
    setSelectedItem(item);
    const selectedItemSrno = item?.sr_no?.toString();
    const newRatesArray = selectedItemSrno ? itemRatesMap[selectedItemSrno] || [] : [];
    const newRateDescriptions = newRatesArray.map(rate => rate.description);
    const rateSrNo = newRatesArray.map(rate => rate.sr_no);
    setRatesArray(newRatesArray);
    setSelectedSrNo(rateSrNo);
    setRateDescriptions(newRateDescriptions);
    setShowMeasurementsModal(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('hi-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount);
  };

  const getItemTotalFromRates = (itemSrNo: number): number => {
    const rates = itemRatesMap[itemSrNo.toString()] || [];
    return rates.reduce((sum, rate) => sum + rate.rate, 0);
  };

  const getItemRatesDisplay = (itemSrNo: number): string => {
    const rates = itemRatesMap[itemSrNo.toString()] || [];
    if (rates.length === 0) return 'No rates';
    if (rates.length === 1) return `₹${rates[0].rate.toFixed(2)}`;
    return `${rates.length} rates (₹${rates.reduce((sum, rate) => sum + rate.rate, 0).toFixed(2)})`;
  };

  // Calculate totals separately for regular, royalty, and testing items
  const calculateTotals = () => {
    let regularTotal = 0;
    let royaltyTotal = 0;
    let testingTotal = 0;

    subworkItems.forEach(item => {
      const itemRates = itemRatesMap[item.sr_no.toString()] || [];

      // Calculate item total based on category
      let itemTotal = 0;

      if (item.category === 'testing' && testingMeasurementsMap[item.sr_no?.toString() || '']) {
        // For testing items with measurements, use the testing quantity
        const testingQty = testingMeasurementsMap[item.sr_no?.toString() || ''].required_tests;
        itemTotal = itemRates.reduce((sum, rate) => sum + (testingQty * Number(rate.rate)), 0);
        testingTotal += itemTotal;
      } else if (item.category === 'royalty' && royaltyMeasurementsMap[item.sr_no?.toString() || '']) {
        // For royalty items with measurements, calculate based on material quantities
        const royaltyData = royaltyMeasurementsMap[item.sr_no?.toString() || ''];
        itemTotal = itemRates.reduce((sum, rate) => {
          const rateDesc = rate.description.toLowerCase();
          let quantity = 0;
          if (rateDesc.includes('metal')) {
            quantity = royaltyData.hb_metal;
          } else if (rateDesc.includes('murum')) {
            quantity = royaltyData.murum;
          } else if (rateDesc.includes('sand')) {
            quantity = royaltyData.sand;
          }
          return sum + (quantity * Number(rate.rate));
        }, 0);
        royaltyTotal += itemTotal;
      } else {
        // For regular items, use stored rate_total_amount
        itemTotal = itemRates.reduce((sum, rate) => sum + Number(rate.rate_total_amount || 0), 0);
        if (item.category === 'royalty') {
          royaltyTotal += itemTotal;
        } else if (item.category === 'testing') {
          testingTotal += itemTotal;
        } else {
          regularTotal += itemTotal;
        }
      }
    });

    return { regularTotal, royaltyTotal, testingTotal };
  };

  const { regularTotal, royaltyTotal, testingTotal } = calculateTotals();
  const totalItemsAmount = regularTotal + royaltyTotal + testingTotal;

  const addRateEntry = () => {
    setItemRates(prev => [...prev, { description: '', rate: 0, unit: '' }]);
  };

  const removeRateEntry = (index: number) => {
    if (itemRates.length > 1) {
      setItemRates(prev => prev.filter((_, i) => i !== index));
    }
  };

  const updateRateEntry = (index: number, field: string, value: any) => {
    setItemRates(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const searchRateItems = async (index: number, query: string) => {
    if (!query || query.trim().length < 2) {
      setRateSuggestions(prev => ({ ...prev, [index]: [] }));
      setShowRateSuggestions(prev => ({ ...prev, [index]: false }));
      return;
    }

    try {
      setSearchingRate(prev => ({ ...prev, [index]: true }));

      if (searchSource === 'CSR') {
        const { data, error } = await supabase
          .schema('estimate')
          .from('CSR-2022-2023')
          .select('*')
          .or(`"Item No".ilike.%${query}%,"Item".ilike.%${query}%,"Reference".ilike.%${query}%`)
          .limit(20);

        if (error) throw error;

        if (data && data.length > 0) {
          setRateSuggestions(prev => ({ ...prev, [index]: data }));
          setShowRateSuggestions(prev => ({ ...prev, [index]: true }));
        } else {
          setRateSuggestions(prev => ({ ...prev, [index]: [] }));
          setShowRateSuggestions(prev => ({ ...prev, [index]: false }));
        }
      } else {
        const { data, error } = await supabase
          .schema('estimate')
          .from('SSR_2022_23')
          .select('*')
          .or(`"SSR Item No.".ilike.%${query}%,"Reference No.".ilike.%${query}%,"Description of the item".ilike.%${query}%`)
          .limit(20);

        if (error) throw error;

        if (data && data.length > 0) {
          setRateSuggestions(prev => ({ ...prev, [index]: data }));
          setShowRateSuggestions(prev => ({ ...prev, [index]: true }));
        } else {
          setRateSuggestions(prev => ({ ...prev, [index]: [] }));
          setShowRateSuggestions(prev => ({ ...prev, [index]: false }));
        }
      }
    } catch (error) {
      console.error('Error searching rate items:', error);
      setRateSuggestions(prev => ({ ...prev, [index]: [] }));
      setShowRateSuggestions(prev => ({ ...prev, [index]: false }));
    } finally {
      setSearchingRate(prev => ({ ...prev, [index]: false }));
    }
  };

  const handleRateSearchChange = (index: number, value: string) => {
    setRateSearchQueries(prev => ({ ...prev, [index]: value }));
    updateRateEntry(index, 'description', value);

    if (rateSearchTimeoutRefs.current[index]) {
      clearTimeout(rateSearchTimeoutRefs.current[index]);
    }

    if (!value || value.trim().length < 2) {
      setRateSuggestions(prev => ({ ...prev, [index]: [] }));
      setShowRateSuggestions(prev => ({ ...prev, [index]: false }));
      return;
    }

    rateSearchTimeoutRefs.current[index] = setTimeout(() => {
      searchRateItems(index, value);
    }, 500);
  };

  const selectRateItem = (index: number, item: any) => {
    if (searchSource === 'CSR') {
      const baseRate = parseFloat(item['Completed Item']) || 0;
      const description = item['Item'] || '';

      updateRateEntry(index, 'description', description);
      updateRateEntry(index, 'rate', baseRate);

      setRateSearchQueries(prev => ({ ...prev, [index]: description }));
    } else {
      const completedRate = parseInt(item['Proposed Completed Rate for 2022-23\nexcluding GST\nIn Rs.']) || 0;
      const description = item['Description of the item'] || '';

      updateRateEntry(index, 'description', description);
      updateRateEntry(index, 'rate', completedRate);

      setRateSearchQueries(prev => ({ ...prev, [index]: description }));
    }

    setShowRateSuggestions(prev => ({ ...prev, [index]: false }));
    setRateSuggestions(prev => ({ ...prev, [index]: [] }));

    if (rateSearchTimeoutRefs.current[index]) {
      clearTimeout(rateSearchTimeoutRefs.current[index]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-10 mx-auto p-5 border w-11/12 max-w-6xl shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                Items - {subworkId}
              </h3>
              <p className="text-sm text-gray-500">{subworkName}</p>
            </div>
            <div className="flex items-center space-x-2">
              <div className="flex flex-col text-xs text-gray-600 mr-4">
                <div className="font-semibold text-sm">
                  Total: {formatCurrency(regularTotal)}
                </div>
                {royaltyTotal > 0 && (
                  <div className="text-amber-600">
                    Royalty: {formatCurrency(royaltyTotal)}
                  </div>
                )}
                {testingTotal > 0 && (
                  <div className="text-purple-600">
                    Testing: {formatCurrency(testingTotal)}
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowAddItemModal(true)}
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Item
              </button>
              <button
                onClick={() => setShowRoyaltyModal(true)}
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Royalty
              </button>
              <button
                onClick={() => setShowTestingModal(true)}
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Testing
              </button>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-sm text-gray-500">Loading items...</p>
              </div>
            ) : subworkItems.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Item No
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Quantity
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rate
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Amount
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {subworkItems.map((item) => (
                      <tr key={`${item.subwork_id}-${item.item_number}`} className="hover:bg-gray-50">
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {item.item_number}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="text-sm font-medium text-gray-900">
                            {item.description_of_item}
                          </div>
                          {/* Show individual rates if multiple rates exist */}
                          {itemRatesMap[item.sr_no.toString()] && itemRatesMap[item.sr_no.toString()].length > 1 && (
                            <div className="mt-2 space-y-1">
                              {itemRatesMap[item.sr_no.toString()].map((rate, index) => (
                                <div key={index} className="text-xs bg-gray-50 p-2 rounded border-l-2 border-blue-200">
                                  <div className="font-medium text-gray-700">{rate.description}</div>
                                  <div className="flex items-center justify-between mt-1">
                                    <span className="text-gray-600">₹{rate.rate.toFixed(2)}</span>
                                    {rate.unit && <span className="text-gray-500">per {rate.unit}</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                          {item.category || '-'}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                          {itemRatesMap[item.sr_no.toString()] && itemRatesMap[item.sr_no.toString()].length > 0 ? (
                            <div className="space-y-1">
                              {/* For royalty items, show quantity only once */}
                              {item.category === 'royalty' && royaltyMeasurementsMap[item.sr_no?.toString() || ''] ? (
                                <div className="bg-gray-50 px-2 py-1 rounded text-xs">
                                  <div className="text-gray-900 font-medium">
                                    {(royaltyMeasurementsMap[item.sr_no?.toString() || ''].hb_metal +
                                      royaltyMeasurementsMap[item.sr_no?.toString() || ''].murum +
                                      royaltyMeasurementsMap[item.sr_no?.toString() || ''].sand).toFixed(3)} CUM
                                  </div>
                                  <div className="text-xs text-green-600">(Total Royalty)</div>
                                </div>
                              ) : item.category === 'testing' && testingMeasurementsMap[item.sr_no?.toString() || ''] ? (
                                <div className="bg-gray-50 px-2 py-1 rounded text-xs">
                                  <div className="text-gray-900 font-medium">
                                    {testingMeasurementsMap[item.sr_no?.toString() || ''].required_tests.toFixed(3)} {item.ssr_unit || '/SET'}
                                  </div>
                                  <div className="text-xs text-green-600">(Testing Qty)</div>
                                </div>
                              ) : (
                                itemRatesMap[item.sr_no.toString()].map((rate, index) => {
                                  const displayQuantity = item.final_quantity !== undefined && item.final_quantity !== null
                                    ? item.final_quantity
                                    : rate.ssr_quantity;
                                  const displayLabel = item.final_quantity !== undefined && item.final_quantity !== null ? 'Calculated' : null;
                                  const displayUnit = item.final_unit || rate.ssr_unit || item.ssr_unit;
                                  return (
                                    <div key={index} className="bg-gray-50 px-2 py-1 rounded text-xs">
                                      <div className="text-gray-900 font-medium">{displayQuantity.toFixed(3)} {displayUnit}</div>
                                      {displayLabel && (
                                        <div className="text-xs text-green-600">({displayLabel})</div>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                              {item.category === 'royalty' && (
                                <div className="mt-2 space-y-1 text-xs border-t border-gray-200 pt-2">
                                  {royaltyMeasurementsMap[item.sr_no?.toString() || ''] ? (
                                    <>
                                      <div className="text-gray-700">
                                        <span className="font-medium">METAL</span>: {royaltyMeasurementsMap[item.sr_no?.toString() || ''].hb_metal.toFixed(3)} CUM
                                      </div>
                                      <div className="text-gray-700">
                                        <span className="font-medium">MURRUM</span>: {royaltyMeasurementsMap[item.sr_no?.toString() || ''].murum.toFixed(3)} CUM
                                      </div>
                                      <div className="text-gray-700">
                                        <span className="font-medium">SAND</span>: {royaltyMeasurementsMap[item.sr_no?.toString() || ''].sand.toFixed(3)} CUM
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-gray-500 italic">No royalty measurements saved</div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              {/* For testing items, use testing measurements */}
                              {item.category === 'testing' && testingMeasurementsMap[item.sr_no?.toString() || ''] ? (
                                <div>
                                  <div className="font-medium">{testingMeasurementsMap[item.sr_no?.toString() || ''].required_tests.toFixed(3)} {item.ssr_unit}</div>
                                  <div className="text-xs text-green-600">(Testing Qty)</div>
                                </div>
                              ) : item.category === 'testing' ? (
                                <>
                                  {item.final_quantity !== undefined && item.final_quantity !== null ? (
                                    <div>
                                      <div className="font-medium">{Number(item.final_quantity).toFixed(3)} {item.final_unit || item.ssr_unit}</div>
                                      <div className="text-xs text-green-600">(Calculated)</div>
                                    </div>
                                  ) : (
                                    <div>
                                      <div className="font-medium">{Number(item.ssr_quantity).toFixed(3)} {item.ssr_unit}</div>
                                      <div className="text-xs text-gray-500">(Auto-calculated)</div>
                                    </div>
                                  )}
                                </>
                              ) : item.category === 'royalty' && royaltyMeasurementsMap[item.sr_no?.toString() || ''] ? (
                                <div>
                                  <div className="font-medium">
                                    {(royaltyMeasurementsMap[item.sr_no?.toString() || ''].hb_metal +
                                      royaltyMeasurementsMap[item.sr_no?.toString() || ''].murum +
                                      royaltyMeasurementsMap[item.sr_no?.toString() || ''].sand).toFixed(3)} {item.ssr_unit}
                                  </div>
                                  <div className="text-xs text-green-600">(Total Royalty)</div>
                                </div>
                              ) : item.category === 'royalty' ? (
                                <>
                                  {item.final_quantity !== undefined && item.final_quantity !== null ? (
                                    <div>
                                      <div className="font-medium">{Number(item.final_quantity).toFixed(3)} {item.final_unit || item.ssr_unit}</div>
                                      <div className="text-xs text-green-600">(Calculated)</div>
                                    </div>
                                  ) : (
                                    <div>
                                      <div className="font-medium">{Number(item.ssr_quantity).toFixed(3)} {item.ssr_unit}</div>
                                      <div className="text-xs text-gray-500">(Auto-calculated)</div>
                                    </div>
                                  )}
                                </>
                              ) : item.final_quantity !== undefined && item.final_quantity !== null ? (
                                <div>
                                  <div className="font-medium">{Number(item.final_quantity).toFixed(3)} {item.final_unit || item.ssr_unit}</div>
                                  <div className="text-xs text-green-600">(Calculated)</div>
                                </div>
                              ) : (
                                <div>
                                  <div className="font-medium">{Number(item.ssr_quantity).toFixed(3)} {item.ssr_unit}</div>
                                  <div className="text-xs text-gray-500">(Auto-calculated)</div>
                                </div>
                              )}
                              {item.category === 'royalty' && (
                                <div className="mt-2 space-y-1 text-xs border-t border-gray-200 pt-2">
                                  {royaltyMeasurementsMap[item.sr_no?.toString() || ''] ? (
                                    <>
                                      <div className="text-gray-700">
                                        <span className="font-medium">METAL</span>: {royaltyMeasurementsMap[item.sr_no?.toString() || ''].hb_metal.toFixed(3)} CUM
                                      </div>
                                      <div className="text-gray-700">
                                        <span className="font-medium">MURRUM</span>: {royaltyMeasurementsMap[item.sr_no?.toString() || ''].murum.toFixed(3)} CUM
                                      </div>
                                      <div className="text-gray-700">
                                        <span className="font-medium">SAND</span>: {royaltyMeasurementsMap[item.sr_no?.toString() || ''].sand.toFixed(3)} CUM
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-gray-500 italic">No royalty measurements saved</div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                          <div>
                            {itemRatesMap[item.sr_no.toString()] && itemRatesMap[item.sr_no.toString()].length > 0 ? (
                              <div className="space-y-1">
                                {itemRatesMap[item.sr_no.toString()].map((rate, index) => (
                                  <div key={index} className="text-xs">
                                    <div className="bg-gray-50 p-2 rounded border-l-2 border-blue-200">
                                      <div className="text-gray-900 font-medium">₹{rate.rate}</div>
                                    </div>
                                    {rate.unit && <span className="text-gray-500 ml-1">/{rate.unit}</span>}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500">No rates available</div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                          <div className="space-y-1">
                            {itemRatesMap[item.sr_no.toString()] && itemRatesMap[item.sr_no.toString()].length > 0 ? (
                              itemRatesMap[item.sr_no.toString()].map((rate, index) => {
                                let rateQuantity = rate.ssr_quantity ?? 0;

                                // For testing items, use testing measurements
                                if (item.category === 'testing' && testingMeasurementsMap[item.sr_no?.toString() || '']) {
                                  rateQuantity = testingMeasurementsMap[item.sr_no?.toString() || ''].required_tests;
                                } else if (item.category === 'royalty' && royaltyMeasurementsMap[item.sr_no?.toString() || '']) {
                                  // For royalty items, use the specific material quantity based on rate description
                                  const royaltyData = royaltyMeasurementsMap[item.sr_no?.toString() || ''];
                                  const rateDesc = rate.description.toLowerCase();
                                  if (rateDesc.includes('metal')) {
                                    rateQuantity = royaltyData.hb_metal;
                                  } else if (rateDesc.includes('murum')) {
                                    rateQuantity = royaltyData.murum;
                                  } else if (rateDesc.includes('sand')) {
                                    rateQuantity = royaltyData.sand;
                                  }
                                }

                                const rateAmount = (rateQuantity * Number(rate.rate)).toFixed(2);
                                return (
                                  <div key={index} className="text-xs bg-gray-50 p-1 rounded">
                                    <span className="font-medium text-green-600">
                                      ₹{rateAmount}
                                    </span>
                                    <div className="text-gray-500 text-xs">
                                      {rateQuantity.toFixed(3)} × ₹{Number(rate.rate).toFixed(2)}
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <span className="text-gray-500">₹0.00</span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-2 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center space-x-2">
                            {item.category !== 'royalty' && item.category !== 'testing' && (
                              <button
                                onClick={() => handleViewMeasurements(item)}
                                className="text-purple-600 hover:text-purple-900 p-1 rounded"
                                title="View Measurements"
                              >
                                <Calculator className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={async () => {
                                const parentSrNo = await ensureParentSubworkSrNo();

                                if (!parentSrNo) {
                                  alert('Unable to resolve parent subwork. Please try again.');
                                  return;
                                }

                                setRateAnalysisItem(item);
                                setRateAnalysisItemSrNo(undefined); // ❌ not needed anymore
                                setRateAnalysisBaseRate(
                                  (itemRatesMap[item.sr_no.toString()]?.[0]?.rate) ?? item.ssr_rate ?? 0
                                );

                                setRateAnalysisContext({
                                  source: 'main',
                                  itemSrNo: item.sr_no
                                });

                                setShowRateAnalysisModal(true);
                              }}
                              className="text-blue-600 hover:text-blue-900 p-1 rounded"
                              title="Rate Analysis"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            {item.category === 'royalty' && (
                              <button
                                onClick={() => handleRoyaltyClick(item)}
                                className="text-yellow-600 hover:text-yellow-900 p-1 rounded"
                                title="Royalty Measurements"
                              >
                                <Calculator className="w-4 h-4" />
                              </button>
                            )}
                            {item.category === 'testing' && (
                              <button
                                onClick={() => handleTestingClick(item)}
                                className="text-green-600 hover:text-green-900 p-1 rounded"
                                title="Testing Measurements"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteItem(item)}
                              className="text-red-600 hover:text-red-900 p-1 rounded"
                              title="Delete Item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Package className="mx-auto h-12 w-12 text-gray-300" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No items found</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Add items to this sub work for detailed estimation.
                </p>
                <div className="mt-6">
                  <button
                    onClick={() => setShowAddItemModal(true)}
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add First Item
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showRateAnalysisModal && rateAnalysisItem && (
        <RateAnalysis
          isOpen={showRateAnalysisModal}
          onClose={() => {
            setShowRateAnalysisModal(false);
            setRateAnalysisItem(null);
            setRateAnalysisItemSrNo(undefined);
            setRateAnalysisContext(null);
            setRateAnalysisBaseRate(undefined);
          }}
          item={rateAnalysisItem}
          baseRate={rateAnalysisBaseRate}
          parentSubworkId={subworkId}
          subworkItemSrNo={rateAnalysisItemSrNo}
          parentSubworkSrNo={parentSubworkSrNo}
          worksId={worksId}
          onSaveRate={(newRate: number, analysisPayload?: any) => {
            // Update local state immediately without refetch
            if (rateAnalysisContext?.source === 'main' && rateAnalysisContext.itemSrNo !== undefined) {
              const key = rateAnalysisContext.itemSrNo.toString();
              setItemRatesMap(prev => {
                const updated = { ...prev };
                const arr = (updated[key] || []).map(r => ({ ...r }));
                if (arr.length > 0) {
                  arr[0].rate = newRate;
                }
                updated[key] = arr;
                return updated;
              });
            } else if (rateAnalysisContext?.source === 'modal' && rateAnalysisContext.modalIndex !== undefined) {
              setItemRates(prev => {
                const updated = [...prev];
                const idx = rateAnalysisContext.modalIndex as number;
                if (updated[idx]) {
                  updated[idx] = { ...updated[idx], rate: newRate };
                }
                return updated;
              });
              // Persist analysis payload for later insertion when the new
              // subwork item is actually created (see `handleAddItem`).
              if (analysisPayload) {
                setPendingRateAnalysisByModalIndex(prev => ({ ...prev, [rateAnalysisContext.modalIndex as number]: analysisPayload }));
              }
            }
          }}
        />
      )}

      {/* Add Item Modal */}

      {showAddItemModal && (
        <div
          className={`fixed inset-0 overflow-y-auto h-full w-full ${showRateAnalysisModal ? 'bg-gray-600 bg-opacity-50 blur-sm' : 'bg-gray-600 bg-opacity-50'
            } z-40`}
        >
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Add New Item</h3>
                <button
                  onClick={() => {
                    setShowAddItemModal(false);
                    setDescriptionQuery('');
                    setSsrSuggestions([]);
                    setShowSuggestions(false);
                    setCsrSearchQuery('');
                    setCsrSuggestions([]);
                    setShowCsrSuggestions(false);
                    setSsrSearchQuery('');
                    setSsrSearchSuggestions([]);
                    setShowSsrSearchSuggestions(false);
                    setSelectedCSRItem(null);
                    setSelectedSSRItem(null);
                    setIsManualEntry(false);
                    setRateSearchQueries({});
                    setRateSuggestions({});
                    setShowRateSuggestions({});
                    if (searchTimeoutRef.current) {
                      clearTimeout(searchTimeoutRef.current);
                    }
                    Object.values(rateSearchTimeoutRefs.current).forEach(timeout => clearTimeout(timeout));
                    rateSearchTimeoutRefs.current = {};
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sub Work
                  </label>
                  <input
                    type="text"
                    value={`${subworkId} - ${subworkName}`}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    value={newItem.category || ''}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select category (optional)</option>
                    <option value="With GST">With GST</option>
                    <option value="Without GST">Without GST</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Search Item from Rate Schedule *
                  </label>
                  <div className="flex items-center gap-4 mb-2">
                    <div className="flex items-center gap-2">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          value="CSR"
                          checked={searchSource === 'CSR'}
                          onChange={(e) => {
                            setSearchSource(e.target.value as 'CSR' | 'SSR');
                            setCsrSearchQuery('');
                            setSsrSearchQuery('');
                            setSelectedCSRItem(null);
                            setSelectedSSRItem(null);
                            setCsrSuggestions([]);
                            setSsrSearchSuggestions([]);
                          }}
                          className="mr-1"
                        />
                        <span className="text-sm">CSR</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          value="SSR"
                          checked={searchSource === 'SSR'}
                          onChange={(e) => {
                            setSearchSource(e.target.value as 'CSR' | 'SSR');
                            setCsrSearchQuery('');
                            setSsrSearchQuery('');
                            setSelectedCSRItem(null);
                            setSelectedSSRItem(null);
                            setCsrSuggestions([]);
                            setSsrSearchSuggestions([]);
                          }}
                          className="mr-1"
                        />
                        <span className="text-sm">SSR</span>
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsManualEntry(!isManualEntry)}
                      className="text-sm text-blue-600 hover:text-blue-800 underline"
                    >
                      {isManualEntry ? `Switch to ${searchSource} Search` : 'Switch to Manual Entry'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    {searchSource === 'CSR'
                      ? 'Search by Item No, Item description, or Reference'
                      : 'Search by SSR Item No, Reference No, or Description'
                    }
                  </p>

                  {isManualEntry ? (
                    <textarea
                      value={newItem.description_of_item || ''}
                      onChange={(e) => setNewItem({ ...newItem, description_of_item: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter item description manually..."
                      rows={3}
                      required
                    />
                  ) : searchSource === 'CSR' ? (
                    <div className="relative">
                      <input
                        type="text"
                        value={csrSearchQuery}
                        onChange={(e) => handleCSRSearchChange(e.target.value)}
                        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Search CSR items by Item No, Item, or Reference..."
                      />
                      {searchingCSR && (
                        <div className="absolute right-3 top-3">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        </div>
                      )}

                      {showCsrSuggestions && csrSuggestions.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-96 overflow-y-auto">
                          <div className="p-2 text-xs text-gray-500 border-b bg-gray-50">
                            <Search className="w-3 h-3 inline mr-1" />
                            CSR 2022-2023 Items
                          </div>
                          {csrSuggestions.map((item, index) => (
                            <div
                              key={index}
                              onClick={() => selectCSRItem(item)}
                              className="p-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    {item['Item No'] && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                        {item['Item No']}
                                      </span>
                                    )}
                                    {item['Unit'] && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                        {item['Unit']}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-sm font-medium text-gray-900 mb-1">
                                    {item['Item']}
                                  </div>
                                  <div className="flex items-center gap-3 text-xs">
                                    {item['Completed Item'] && (
                                      <span className="text-green-600">
                                        Base Rate: <span className="font-semibold">₹{parseFloat(item['Completed Item']).toFixed(2)}</span>
                                      </span>
                                    )}
                                    {item['Labour'] && (
                                      <span className="text-blue-600">
                                        Labour: <span className="font-semibold">₹{parseFloat(item['Labour']).toFixed(2)}</span>
                                      </span>
                                    )}
                                  </div>
                                  {item['Reference'] && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      Reference: {item['Reference']}
                                    </div>
                                  )}
                                </div>
                                <div className="ml-2">
                                  <CheckCircle className="w-5 h-5 text-green-500" />
                                </div>
                              </div>
                            </div>
                          ))}
                          <div className="p-2 text-xs text-gray-400 text-center border-t bg-gray-50">
                            Click on an item to auto-fill unit and base rate
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        value={ssrSearchQuery}
                        onChange={(e) => handleSSRSearchChange(e.target.value)}
                        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Search SSR items by SSR Item No, Reference No, or Description..."
                      />
                      {searchingSSRTable && (
                        <div className="absolute right-3 top-3">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        </div>
                      )}

                      {showSsrSearchSuggestions && ssrSearchSuggestions.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-96 overflow-y-auto">
                          <div className="p-2 text-xs text-gray-500 border-b bg-gray-50">
                            <Search className="w-3 h-3 inline mr-1" />
                            SSR 2022-2023 Items
                          </div>
                          {ssrSearchSuggestions.map((item, index) => (
                            <div
                              key={index}
                              onClick={() => selectSSRTableItem(item)}
                              className="p-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    {item['SSR Item No.'] && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                        {item['SSR Item No.']}
                                      </span>
                                    )}
                                    {item['Unit'] && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                        {item['Unit']}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-sm font-medium text-gray-900 mb-1">
                                    {item['Description of the item']}
                                  </div>
                                  <div className="flex items-center gap-3 text-xs">
                                    {item['Proposed Completed Rate for 2022-23\nexcluding GST\nIn Rs.'] && (
                                      <span className="text-green-600">
                                        Completed Rate: <span className="font-semibold">₹{parseInt(item['Proposed Completed Rate for 2022-23\nexcluding GST\nIn Rs.']).toFixed(2)}</span>
                                      </span>
                                    )}
                                    {item['Proposed Labour Rate for 2022-23\nexcluding GST\nIn Rs.'] && (
                                      <span className="text-blue-600">
                                        Labour: <span className="font-semibold">₹{parseFloat(item['Proposed Labour Rate for 2022-23\nexcluding GST\nIn Rs.']).toFixed(2)}</span>
                                      </span>
                                    )}
                                  </div>
                                  {item['Reference No.'] && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      Reference: {item['Reference No.']}
                                    </div>
                                  )}
                                  {item['Additional Specification'] && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      Spec: {item['Additional Specification']}
                                    </div>
                                  )}
                                </div>
                                <div className="ml-2">
                                  <CheckCircle className="w-5 h-5 text-green-500" />
                                </div>
                              </div>
                            </div>
                          ))}
                          <div className="p-2 text-xs text-gray-400 text-center border-t bg-gray-50">
                            Click on an item to auto-fill unit and completed rate
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedCSRItem && !isManualEntry && searchSource === 'CSR' && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <div className="text-xs font-medium text-blue-800 mb-2">Selected CSR Item:</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-gray-600">Item No:</span>
                          <span className="ml-1 font-medium">{selectedCSRItem['Item No']}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Unit:</span>
                          <span className="ml-1 font-medium">{selectedCSRItem['Unit']}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Base Rate:</span>
                          <span className="ml-1 font-medium">₹{parseFloat(selectedCSRItem['Completed Item']).toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Labour:</span>
                          <span className="ml-1 font-medium">₹{parseFloat(selectedCSRItem['Labour']).toFixed(2)}</span>
                        </div>
                        {selectedCSRItem['Reference'] && (
                          <div className="col-span-2">
                            <span className="text-gray-600">Reference:</span>
                            <span className="ml-1 font-medium">{selectedCSRItem['Reference']}</span>
                          </div>
                        )}
                        {selectedCSRItem.parentDescription && (
                          <div className="col-span-2 mt-2 pt-2 border-t border-blue-300">
                            <div className="text-gray-600 font-medium mb-1">Main Item Description:</div>
                            <div className="text-gray-700 text-xs leading-relaxed bg-white p-2 rounded">
                              {selectedCSRItem.parentDescription}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedSSRItem && !isManualEntry && searchSource === 'SSR' && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
                      <div className="text-xs font-medium text-green-800 mb-2">Selected SSR Item:</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-gray-600">SSR Item No:</span>
                          <span className="ml-1 font-medium">{selectedSSRItem['SSR Item No.']}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Unit:</span>
                          <span className="ml-1 font-medium">{selectedSSRItem['Unit']}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Completed Rate:</span>
                          <span className="ml-1 font-medium">₹{parseInt(selectedSSRItem['Proposed Completed Rate for 2022-23\nexcluding GST\nIn Rs.']).toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Labour Rate:</span>
                          <span className="ml-1 font-medium">₹{parseFloat(selectedSSRItem['Proposed Labour Rate for 2022-23\nexcluding GST\nIn Rs.']).toFixed(2)}</span>
                        </div>
                        {selectedSSRItem['Reference No.'] && (
                          <div className="col-span-2">
                            <span className="text-gray-600">Reference:</span>
                            <span className="ml-1 font-medium">{selectedSSRItem['Reference No.']}</span>
                          </div>
                        )}
                        {selectedSSRItem['Additional Specification'] && (
                          <div className="col-span-2">
                            <span className="text-gray-600">Additional Spec:</span>
                            <span className="ml-1 font-medium">{selectedSSRItem['Additional Specification']}</span>
                          </div>
                        )}
                        {selectedSSRItem['Chapter'] && (
                          <div className="col-span-2">
                            <span className="text-gray-600">Chapter:</span>
                            <span className="ml-1 font-medium">{selectedSSRItem['Chapter']}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Multiple Rates Table */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Rates *
                    </label>
                    <button
                      type="button"
                      onClick={addRateEntry}
                      className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-blue-600 bg-blue-100 hover:bg-blue-200"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Rate
                    </button>
                  </div>

                  <div className="border border-gray-300 rounded-md overflow-visible">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rate (₹)</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {itemRates.map((rate, index) => (
                          <tr key={index}>
                            <td className="px-3 py-2 relative">
                              <div className="relative">
                                <input
                                  type="text"
                                  value={rate.description}
                                  onChange={(e) => handleRateSearchChange(index, e.target.value)}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                  placeholder={`Search ${searchSource} items...`}
                                />
                                {searchingRate[index] && (
                                  <div className="absolute right-2 top-2">
                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                                  </div>
                                )}

                                {showRateSuggestions[index] && rateSuggestions[index] && rateSuggestions[index].length > 0 && (
                                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                    <div className="p-2 text-xs text-gray-500 border-b bg-gray-50">
                                      <Search className="w-3 h-3 inline mr-1" />
                                      {searchSource === 'CSR' ? 'CSR 2022-2023 Items' : 'SSR 2022-2023 Items'}
                                    </div>
                                    {rateSuggestions[index].map((item, itemIdx) => (
                                      <div
                                        key={itemIdx}
                                        onClick={() => selectRateItem(index, item)}
                                        className="p-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                      >
                                        {searchSource === 'CSR' ? (
                                          <div>
                                            <div className="flex items-center gap-2 mb-1">
                                              {item['Item No'] && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                                  {item['Item No']}
                                                </span>
                                              )}
                                              {item['Unit'] && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                                  {item['Unit']}
                                                </span>
                                              )}
                                            </div>
                                            <div className="text-xs font-medium text-gray-900 mb-1">
                                              {item['Item']}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs">
                                              {item['Completed Item'] && (
                                                <span className="text-green-600">
                                                  Rate: ₹{parseFloat(item['Completed Item']).toFixed(2)}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        ) : (
                                          <div>
                                            <div className="flex items-center gap-2 mb-1">
                                              {item['SSR Item No.'] && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                                  {item['SSR Item No.']}
                                                </span>
                                              )}
                                              {item['Unit'] && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                                  {item['Unit']}
                                                </span>
                                              )}
                                            </div>
                                            <div className="text-xs font-medium text-gray-900 mb-1">
                                              {item['Description of the item']}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs">
                                              {item['Proposed Completed Rate for 2022-23\nexcluding GST\nIn Rs.'] && (
                                                <span className="text-green-600">
                                                  Rate: ₹{parseInt(item['Proposed Completed Rate for 2022-23\nexcluding GST\nIn Rs.']).toFixed(2)}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                    <div className="p-1 text-xs text-gray-400 text-center border-t bg-gray-50">
                                      Click to select
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={rate.rate || ''}
                                onChange={(e) => updateRateEntry(index, 'rate', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="0.00"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={rate.unit}
                                onChange={(e) => updateRateEntry(index, 'unit', e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="">Select Unit</option>
                                <option value="CUM">CUM</option>
                                <option value="/BAG">/BAG</option>
                                <option value="MT">MT</option>
                                <option value="NOS">NOS</option>
                                <option value="SQM">SQM</option>
                                <option value="RMT">RMT</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  const parentSrNo = await ensureParentSubworkSrNo();

                                  if (!parentSrNo) {
                                    alert('Unable to resolve parent subwork. Please try again.');
                                    return;
                                  }

                                  // ✅ ENSURE item has sr_no (same as Edit2 flow)
                                  const itemWithSrNo: SubworkItem = {
                                    ...(selectedItem ?? (newItem as SubworkItem)),
                                    sr_no:
                                      selectedItem?.sr_no ??
                                      parentSrNo // ✅ fallback ONLY for newly-added modal items
                                  };

                                  setRateAnalysisItem(itemWithSrNo);

                                  setRateAnalysisBaseRate(itemRates[index]?.rate || 0);

                                  setRateAnalysisContext({
                                    source: 'modal',
                                    modalIndex: index
                                  });

                                  setShowRateAnalysisModal(true);
                                }}
                                className="text-blue-600 hover:text-blue-800 p-1 mr-2"
                              >
                                Rate Analysis
                              </button>

                              {itemRates.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeRateEntry(index)}
                                  className="text-red-600 hover:text-red-800 p-1"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Total Amount:</span>
                    <span className="font-medium text-gray-900">
                      ₹{itemRates.reduce((sum, rate) => sum + (rate.rate || 0), 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowAddItemModal(false);
                    setCsrSearchQuery('');
                    setCsrSuggestions([]);
                    setShowCsrSuggestions(false);
                    setSsrSearchQuery('');
                    setSsrSearchSuggestions([]);
                    setShowSsrSearchSuggestions(false);
                    setSelectedCSRItem(null);
                    setSelectedSSRItem(null);
                    setIsManualEntry(false);
                    setRateSearchQueries({});
                    setRateSuggestions({});
                    setShowRateSuggestions({});
                    Object.values(rateSearchTimeoutRefs.current).forEach(timeout => clearTimeout(timeout));
                    rateSearchTimeoutRefs.current = {};
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddItem}
                  disabled={!newItem.description_of_item || itemRates.every(rate => !rate.description || !rate.rate)}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Item
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {showEditItemModal && selectedItem && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-40">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Edit Item</h3>
                <button
                  onClick={() => {
                    setShowEditItemModal(false);
                    setRateSearchQueries({});
                    setRateSuggestions({});
                    setShowRateSuggestions({});
                    Object.values(rateSearchTimeoutRefs.current).forEach(timeout => clearTimeout(timeout));
                    rateSearchTimeoutRefs.current = {};
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Item Number
                  </label>
                  <input
                    type="text"
                    value={selectedItem.item_number}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={newItem.category || ''}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter category (optional)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description of Item *
                  </label>
                  <div className="relative">
                    <textarea
                      value={descriptionQuery}
                      onChange={(e) => handleDescriptionChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter item description manually or search SSR items..."
                      rows={3}
                    />
                    {searchingSSR && (
                      <div className="absolute right-3 top-3">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      </div>
                    )}

                    {/* SSR Suggestions Dropdown */}
                    {showSuggestions && ssrSuggestions.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                        <div className="p-2 text-xs text-gray-500 border-b">
                          <Search className="w-3 h-3 inline mr-1" />
                          SSR Rate Suggestions from Database
                        </div>
                        {ssrSuggestions.map((item, index) => (
                          <div
                            key={index}
                            onClick={() => selectSSRItem(item)}
                            className="p-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="text-sm font-medium text-gray-900">
                                  {item.sr_no && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mr-2">
                                      Item {item.sr_no}
                                    </span>
                                  )}
                                  {item.description}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  Section: {item.section} | Page: {item.page_number}
                                </div>
                                <div className="flex items-center mt-1 space-x-4">
                                  {item.unit && (
                                    <span className="text-xs text-gray-600">
                                      Unit: <span className="font-medium">{item.unit}</span>
                                    </span>
                                  )}
                                  {item.rate_2024_25 && (
                                    <span className="text-xs text-green-600">
                                      Rate 2024-25: <span className="font-medium">₹{item.rate_2024_25}</span>
                                    </span>
                                  )}
                                  {item.rate_2023_24 && (
                                    <span className="text-xs text-blue-600">
                                      Rate 2023-24: <span className="font-medium">₹{item.rate_2023_24}</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="ml-2">
                                <div className="text-xs text-gray-500">
                                  {Math.round(item.confidence * 100)}% match
                                </div>
                                <CheckCircle className="w-4 h-4 text-green-500 mt-1" />
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="p-2 text-xs text-gray-400 text-center border-t">
                          Click on an item to auto-fill rate and unit from SSR database
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Multiple Rates Table for Edit */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Rates *
                    </label>
                    <button
                      type="button"
                      onClick={addRateEntry}
                      className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-blue-600 bg-blue-100 hover:bg-blue-200"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Rate
                    </button>
                  </div>

                  <div className="border border-gray-300 rounded-md overflow-visible">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rate (₹)</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {itemRates.map((rate, index) => (
                          <tr key={index}>
                            <td className="px-3 py-2 relative">
                              <div className="relative">
                                <input
                                  type="text"
                                  value={rate.description}
                                  onChange={(e) => handleRateSearchChange(index, e.target.value)}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                  placeholder={`Search ${searchSource} items...`}
                                />
                                {searchingRate[index] && (
                                  <div className="absolute right-2 top-2">
                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                                  </div>
                                )}

                                {showRateSuggestions[index] && rateSuggestions[index] && rateSuggestions[index].length > 0 && (
                                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                    <div className="p-2 text-xs text-gray-500 border-b bg-gray-50">
                                      <Search className="w-3 h-3 inline mr-1" />
                                      {searchSource === 'CSR' ? 'CSR 2022-2023 Items' : 'SSR 2022-2023 Items'}
                                    </div>
                                    {rateSuggestions[index].map((item, itemIdx) => (
                                      <div
                                        key={itemIdx}
                                        onClick={() => selectRateItem(index, item)}
                                        className="p-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                      >
                                        {searchSource === 'CSR' ? (
                                          <div>
                                            <div className="flex items-center gap-2 mb-1">
                                              {item['Item No'] && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                                  {item['Item No']}
                                                </span>
                                              )}
                                              {item['Unit'] && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                                  {item['Unit']}
                                                </span>
                                              )}
                                            </div>
                                            <div className="text-xs font-medium text-gray-900 mb-1">
                                              {item['Item']}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs">
                                              {item['Completed Item'] && (
                                                <span className="text-green-600">
                                                  Rate: ₹{parseFloat(item['Completed Item']).toFixed(2)}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        ) : (
                                          <div>
                                            <div className="flex items-center gap-2 mb-1">
                                              {item['SSR Item No.'] && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                                  {item['SSR Item No.']}
                                                </span>
                                              )}
                                              {item['Unit'] && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                                  {item['Unit']}
                                                </span>
                                              )}
                                            </div>
                                            <div className="text-xs font-medium text-gray-900 mb-1">
                                              {item['Description of the item']}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs">
                                              {item['Proposed Completed Rate for 2022-23\nexcluding GST\nIn Rs.'] && (
                                                <span className="text-green-600">
                                                  Rate: ₹{parseInt(item['Proposed Completed Rate for 2022-23\nexcluding GST\nIn Rs.']).toFixed(2)}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                    <div className="p-1 text-xs text-gray-400 text-center border-t bg-gray-50">
                                      Click to select
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={rate.rate || ''}
                                onChange={(e) => updateRateEntry(index, 'rate', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="0.00"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={rate.unit}
                                onChange={(e) => updateRateEntry(index, 'unit', e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="">Select Unit</option>
                                <option value="CUM">CUM</option>
                                <option value="/BAG">/BAG</option>
                                <option value="MT">MT</option>
                                <option value="NOS">NOS</option>
                                <option value="SQM">SQM</option>
                                <option value="RMT">RMT</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              {itemRates.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeRateEntry(index)}
                                  className="text-red-600 hover:text-red-800 p-1"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Total Amount:</span>
                    <span className="font-medium text-gray-900">
                      ₹{itemRates.reduce((sum, rate) => sum + (rate.rate || 0), 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowEditItemModal(false);
                    setDescriptionQuery('');
                    setSsrSuggestions([]);
                    setShowSuggestions(false);
                    setRateSearchQueries({});
                    setRateSuggestions({});
                    setShowRateSuggestions({});
                    if (searchTimeoutRef.current) {
                      clearTimeout(searchTimeoutRef.current);
                    }
                    Object.values(rateSearchTimeoutRefs.current).forEach(timeout => clearTimeout(timeout));
                    rateSearchTimeoutRefs.current = {};
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateItem}
                  disabled={!newItem.description_of_item || itemRates.every(rate => !rate.description || !rate.rate)}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Update Item
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Measurements Modal */}

      {showMeasurementsModal && selectedItem && (
        <ItemMeasurements
          item={selectedItem}
          isOpen={showMeasurementsModal}
          onClose={() => setShowMeasurementsModal(false)}
          onItemUpdated={refreshItemData}
          availableRates={ratesArray}
          rateDescriptions={rateDescriptions}
          selectedSrNo={selectedSrNo}
        />
      )}

      <RoyaltyTestingItems
        subworkId={subworkId}
        category="royalty"
        isOpen={showRoyaltyModal}
        onClose={() => setShowRoyaltyModal(false)}
        onItemAdded={fetchSubworkItems}
      />

      <RoyaltyTestingItems
        subworkId={subworkId}
        category="testing"
        isOpen={showTestingModal}
        onClose={() => setShowTestingModal(false)}
        onItemAdded={fetchSubworkItems}
      />

      <RoyaltyMeasurements
        subworkId={subworkId}
        worksId={worksId}
        isOpen={showRoyaltyMeasurementsModal}
        onClose={() => {
          setShowRoyaltyMeasurementsModal(false);
          fetchSubworkItems();
        }}
      />

      <TestingMeasurements
        subworkId={subworkId}
        isOpen={showTestingMeasurementsModal}
        onClose={() => {
          setShowTestingMeasurementsModal(false);
          fetchSubworkItems();
        }}
      />
    </div>
  );
};

// Import the ItemMeasurements component
import ItemMeasurements from './ItemMeasurements';
import { useNavigate } from 'react-router-dom';
import RateAnalysis from './RateAnalysis';

export default SubworkItems;