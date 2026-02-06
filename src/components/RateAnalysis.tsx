import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
// removed unused useLocation
import { supabase } from '../lib/supabase';
import { useRefreshOnVisibility } from '../hooks/useRefreshOnVisibility'; // ✅ ADD
import { SubworkItem, ItemMeasurement, ItemLead, ItemMaterial, ItemRate } from '../types';
import {
  Plus,
  Edit2,
  Trash2,
  Calculator,
  Truck,
  Upload,
  X,
  ImageIcon,
  Package2,
  Check,
  X as CancelIcon
} from 'lucide-react';

interface RateAnalysisProps {
  isOpen: boolean;
  onClose: () => void;
  item: SubworkItem;
  baseRate?: number;
  parentSubworkSrNo: number; // ✅ REQUIRED
  worksId: string; // ✅ REQUIRED - Current works_id for Lead Statement search
  onSaveRate?: (newRate: number, analysisPayload?: any) => void;
}

const RateAnalysis: React.FC<RateAnalysisProps> = ({ isOpen, onClose, item, baseRate: baseRateProp, parentSubworkSrNo, worksId, onSaveRate }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'measurements' | 'leads' | 'materials'>('measurements');
  const [measurements, setMeasurements] = useState<ItemMeasurement[]>([]);
  const [itemRates, setItemRates] = useState<ItemRate[]>([]);
  const [leads, setLeads] = useState<ItemLead[]>([]);
  const [materials, setMaterials] = useState<ItemMaterial[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedMeasurement, setSelectedMeasurement] = useState<ItemMeasurement | null>(null);
  const [showPhotosModal, setShowPhotosModal] = useState(false);
  const [designPhotos, setDesignPhotos] = useState<any[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [rateGroups, setRateGroups] = useState<{ [key: string]: { rate: number, quantity: number, description?: string } }>({});
  const [currentItem, setCurrentItem] = useState<SubworkItem>(item || {} as SubworkItem);
  const [selectedDescription, setSelectedDescription] = useState<string>('');
  const [selectedRateId, setSelectedRateId] = useState<number | null>(null);
  const [selectedRateValue, setSelectedRateValue] = useState<number>(0);
  const [newMeasurement, setNewMeasurement] = useState<Partial<ItemMeasurement>>({
    no_of_units: 0,
    length: 0,
    width_breadth: 0,
    height_depth: 0,
    is_manual_quantity: false,
    selected_rate_id: 0
  });
  const [selectedRate, setSelectedRate] = useState<number>(0);
  const [newLead, setNewLead] = useState<Partial<ItemLead>>({
    material: '',
    lead_in_km: 0,
    lead_charges: 0,
    initial_lead_charges: 0
  });
  const [newMaterial, setNewMaterial] = useState<Partial<ItemMaterial>>({
    material_name: '',
    required_quantity: 0,
    rate_per_unit: 0
  });
  const [newTax, setNewTax] = useState({ label: '', value: '', factor: 1, type: 'Addition' });
  const [entries, setEntries] = useState<
    { label: string; type: string; value: number; factor: number; amount: number }
  >([]);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [leadStatements, setLeadStatements] = useState<any[]>([]);
  const [showLeadDropdown, setShowLeadDropdown] = useState(false);
  const [searchingLeads, setSearchingLeads] = useState(false);
  const [searchCompleted, setSearchCompleted] = useState(false);
  const [isFromLeadStatement, setIsFromLeadStatement] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchedRef = useRef<{ itemId: number | null; rateId: number | null } | null>(null);
  const isFetchingRef = useRef(false);

  // NEW STATE FOR INLINE ADDING + EDITING
  const [rowBeingAddedBelow, setRowBeingAddedBelow] = useState<number | null>(null);
  const [rowBeingEdited, setRowBeingEdited] = useState<number | null>(null);
  const [tempRow, setTempRow] = useState({ label: '', type: 'Addition', value: 0, factor: 1 });

  // NEW STATE FOR FINAL-RATE TAX
  const [showFinalTaxInput, setShowFinalTaxInput] = useState(false);
  const [finalTaxPercentInput, setFinalTaxPercentInput] = useState<number>(0);
  const [finalTaxApplied, setFinalTaxApplied] = useState<{ percent: number; amount: number } | null>(null);

  // STATE FOR MANUAL ADD CONFIRMATION
  const [showManualAddConfirmation, setShowManualAddConfirmation] = useState(false);

  // STATE FOR SAVED BASE RATE (from existing rate analysis)
  const [savedBaseRate, setSavedBaseRate] = useState<number | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // Calculation helpers
  const calculateAmount = (
    type: string,
    rate: number,
    value: number,
    factor: number
  ) => {
    const effectiveValue = value * factor;

    if (type === 'Tax') {
      return (rate * effectiveValue) / 100;
    }
    if (type === 'Addition') {
      return effectiveValue;
    }
    if (type === 'Deletion') {
      return -effectiveValue;
    }
    return 0;
  };

  const summary = React.useMemo(() => {
    let additions = 0;
    let deletions = 0;
    let taxes = 0;

    const baseRate = savedBaseRate !== null
      ? savedBaseRate
      : (selectedRateValue > 0
        ? selectedRateValue
        : (baseRateProp ?? item?.ssr_rate ?? 0));

    entries.forEach((entry) => {
      if (entry.type === 'Addition') additions += entry.amount;
      if (entry.type === 'Deletion') deletions += Math.abs(entry.amount);
      if (entry.type === 'Tax') taxes += entry.amount;
    });

    const calculatedRate = baseRate + additions - deletions + taxes;
    const finalRate = Math.ceil((calculatedRate - 0.025) / 0.05) * 0.05;

    return { additions, deletions, taxes, finalRate, baseRate, calculatedRate };
  }, [entries, baseRateProp, item?.ssr_rate, selectedRateValue, savedBaseRate]);

  // Keep previous logic and API untouched
  const getSelectedRate = () => {
    if (newMeasurement.selected_rate_id) {
      const selectedRate = itemRates.find(rate => rate.sr_no === newMeasurement.selected_rate_id);
      return selectedRate ? selectedRate.rate : (baseRateProp ?? item?.ssr_rate ?? 0);
    }
    return baseRateProp ?? item?.ssr_rate ?? 0;
  };

  useEffect(() => {
    if (isOpen && item?.sr_no) {
      fetchData();
      fetchItemRates();
    }
  }, [isOpen, item?.sr_no, activeTab]);

  // ✅ NEW: Refetch rate analysis data when page becomes visible (only when modal is open)
  useRefreshOnVisibility(
    async () => {
      await fetchData();
      await fetchItemRates();
    },
    [item?.sr_no, activeTab],
    isOpen // Only enabled when modal is open
  );

  useEffect(() => {
    if (itemRates.length > 0 && !selectedRateId) {
      const firstRateId = itemRates[0].sr_no;
      const firstRateValue = itemRates[0].rate;
      setSelectedRateId(firstRateId);
      setSelectedRateValue(firstRateValue);
    } else if (itemRates.length === 0 && isOpen && item?.sr_no && selectedRateId !== null) {
      setSelectedRateId(null);
      setSelectedRateValue(0);
    }
  }, [itemRates, isOpen, item?.sr_no]);

  useEffect(() => {
    if (isOpen && item?.sr_no) {
      if (selectedRateId !== null && selectedRateId !== undefined) {
        fetchRateAnalysisForRate(selectedRateId);
      } else if (itemRates.length === 0) {
        fetchRateAnalysisForRate(null);
      }
    }
  }, [selectedRateId, isOpen, item?.sr_no]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedRateId(null);
      setSelectedRateValue(0);
      setItemRates([]);
      setEntries([]);
      setFinalTaxApplied(null);
      setSavedBaseRate(null);
      setIsEditMode(false);
      // Reset fetch tracking refs
      lastFetchedRef.current = null;
      isFetchingRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    setCurrentItem(item || {} as SubworkItem);
    // Reset fetch tracking when item changes
    lastFetchedRef.current = null;
    isFetchingRef.current = false;
  }, [item]);

  useEffect(() => {
    calculateRateGroups();
  }, [measurements, itemRates]);

  const calculateQuantity = () => {
    if (newMeasurement.is_manual_quantity && newMeasurement.manual_quantity !== undefined) {
      return newMeasurement.manual_quantity;
    }
    return (newMeasurement.no_of_units || 0) *
      (newMeasurement.length || 0) *
      (newMeasurement.width_breadth || 0) *
      (newMeasurement.height_depth || 0);
  };

  const calculateLineAmount = () => {
    const quantity = calculateQuantity();
    const amount = quantity * getSelectedRate();
    return newMeasurement.is_deduction ? -amount : amount;
  };

  const calculateRateGroups = () => {
    const groups: { [key: string]: { rate: number, quantity: number, description?: string } } = {};
    measurements.forEach(measurement => {
      const rate = getSelectedRateForMeasurement(measurement);
      const rateKey = rate.toString();
      if (!groups[rateKey]) {
        const rateInfo = itemRates.find(r => r.rate === rate);
        groups[rateKey] = {
          rate: rate,
          quantity: 0,
          description: rateInfo?.description
        };
      }
      groups[rateKey].quantity += measurement.calculated_quantity;
    });
    setRateGroups(groups);
  };

  // helper used in calculateRateGroups (kept as-is)
  const getSelectedRateForMeasurement = (measurement: ItemMeasurement) => {
    if (measurement.selected_rate_id) {
      const selected = itemRates.find(r => r.sr_no === measurement.selected_rate_id);
      return selected ? selected.rate : (measurement.rate || (baseRateProp ?? item?.ssr_rate ?? 0));
    }
    return measurement.rate || (baseRateProp ?? item?.ssr_rate ?? 0);
  };

  const fetchItemRates = async () => {
    try {
      if (!item?.sr_no) return;

      const { data, error } = await supabase
        .schema('estimate')
        .from('item_rates')
        .select('*')
        .eq('subwork_item_sr_no', item.sr_no)
        .order('sr_no', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        setItemRates(data);
      } else {
        setItemRates([]);
      }
    } catch (error) {
      console.error('Error fetching item rates:', error);
      setItemRates([]);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      if (activeTab === 'measurements') {
        const { data, error } = await supabase
          .schema('estimate')
          .from('item_measurements')
          .select('*')
          .eq('subwork_item_id', currentItem.sr_no)
          .order('measurement_sr_no', { ascending: true });
        if (error) throw error;
        setMeasurements(data || []);
      } else if (activeTab === 'leads') {
        const { data, error } = await supabase
          .schema('estimate')
          .from('item_leads')
          .select('*')
          .eq('subwork_item_id', currentItem.sr_no)
          .order('sr_no', { ascending: true });
        if (error) throw error;
        setLeads(data || []);
      } else if (activeTab === 'materials') {
        const { data, error } = await supabase
          .schema('estimate')
          .from('item_materials')
          .select('*')
          .eq('subwork_item_id', currentItem.sr_no)
          .order('material_name', { ascending: true });
        if (error) throw error;
        setMaterials(data || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRateAnalysisForRate = async (rateId: number | null) => {
    try {
      if (!item?.sr_no) {
        console.log('⚠️ No item sr_no, skipping fetch');
        return;
      }

      // Prevent duplicate fetches
      const currentFetch = { itemId: item.sr_no, rateId };

      console.log('🔄 Fetch request - item:', item.sr_no, 'rate:', rateId);
      console.log('🔄 Currently fetching?', isFetchingRef.current);
      console.log('🔄 Last fetched:', lastFetchedRef.current);
      console.log('🔄 Current entries count:', entries.length);

      if (isFetchingRef.current) {
        console.log('⏭️ Already fetching, skipping duplicate');
        return;
      }

      if (
        lastFetchedRef.current?.itemId === currentFetch.itemId &&
        lastFetchedRef.current?.rateId === currentFetch.rateId
      ) {
        console.log('⏭️ Already fetched this exact combination, skipping');
        return;
      }

      isFetchingRef.current = true;
      lastFetchedRef.current = currentFetch;

      console.log('🔍 Fetching rate analysis for item:', item.sr_no, 'rate:', rateId);
      console.log('🔍 Query: subwork_item_id =', item.sr_no, ', item_rate_id =', rateId === null ? 'NULL' : rateId);

      let query = supabase
        .schema('estimate')
        .from('item_rate_analysis')
        .select('*')
        .eq('subwork_item_id', item.sr_no);

      if (rateId !== null && rateId !== undefined) {
        query = query.eq('item_rate_id', rateId);
      } else {
        query = query.is('item_rate_id', null);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;

      console.log('📊 Rate analysis data:', data);

      if (data) {
        console.log('✅ Loading entries:', data.entries);
        setEntries(data.entries || []);
        setSavedBaseRate(data.base_rate || null);
        setIsEditMode(true);
        if (data.final_tax_percent && data.final_tax_amount) {
          setFinalTaxApplied({
            percent: data.final_tax_percent,
            amount: data.final_tax_amount
          });
        } else {
          setFinalTaxApplied(null);
        }
      } else {
        console.log('⚠️ No existing analysis found in database');
        // CRITICAL: Only reset if we don't have entries already loaded
        // This prevents a race condition from wiping out data
        setEntries(prev => {
          if (prev.length > 0) {
            console.log('✅ Keeping existing', prev.length, 'entries (preventing data loss)');
            return prev;
          } else {
            console.log('⚠️ No existing entries, initializing empty state');
            return [];
          }
        });
        // Only reset other state if entries are empty
        if (entries.length === 0) {
          setSavedBaseRate(null);
          setIsEditMode(false);
          setFinalTaxApplied(null);
        }
      }
    } catch (error) {
      console.error('❌ Error fetching rate analysis:', error);
      // Don't wipe out existing data on error
      if (entries.length === 0) {
        setEntries([]);
        setSavedBaseRate(null);
        setIsEditMode(false);
        setFinalTaxApplied(null);
      }
    } finally {
      isFetchingRef.current = false;
    }
  };

  const fetchRateAnalysis = async () => {
    await fetchRateAnalysisForRate(selectedRateId);
  };

  const searchLeadStatements = async (searchTerm: string) => {
    if (!searchTerm || searchTerm.length < 2) {
      setLeadStatements([]);
      setShowLeadDropdown(false);
      setSearchCompleted(false);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    setSearchingLeads(true);
    setSearchCompleted(false);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        console.log('🔍 Searching lead statements for term:', searchTerm);
        console.log('📋 Current works_id:', worksId);

        if (!worksId) {
          console.error('❌ No works_id provided');
          setLeadStatements([]);
          setShowLeadDropdown(false);
          setSearchCompleted(true);
          setSearchingLeads(false);
          return;
        }

        console.log('🔎 Executing query: SELECT * FROM estimate.lead_statements WHERE works_id =', worksId, 'AND material ILIKE', `%${searchTerm}%`);

        const { data, error } = await supabase
          .schema('estimate')
          .from('lead_statements')
          .select('*')
          .eq('works_id', worksId)
          .ilike('material', `%${searchTerm}%`)
          .limit(10);

        if (error) {
          console.error('❌ Error searching lead statements:', error);
          throw error;
        }

        console.log(`✅ Found ${(data || []).length} lead statements:`, data);

        setLeadStatements(data || []);
        setShowLeadDropdown((data || []).length > 0);
        setSearchCompleted(true);
      } catch (error) {
        console.error('❌ Error searching lead statements:', error);
        setLeadStatements([]);
        setShowLeadDropdown(false);
        setSearchCompleted(true);
      } finally {
        setSearchingLeads(false);
      }
    }, 400);
  };

  const handleSelectLeadStatement = (lead: any) => {
    console.log('✅ Selected lead statement:', lead);
    console.log('💰 Total rate:', lead.total_rate);
    setNewTax({
      ...newTax,
      label: lead.material,
      value: lead.total_rate || '0'
    });
    setIsFromLeadStatement(true);
    setShowLeadDropdown(false);
    setLeadStatements([]);
    setSearchCompleted(false);
  };

  const saveRateAnalysis = async () => {
    try {
      setLoading(true);

      if (!item?.sr_no) {
        console.error('Missing subwork item ID - item.sr_no is required');
        alert('Unable to save: Item reference is missing. Please close and reopen this dialog.');
        return;
      }

      const resolvedSubworkItemId = item.sr_no;

      console.log('Saving rate analysis for item:', resolvedSubworkItemId, 'rate:', selectedRateId);

      const totalRate =
        summary.finalRate + (finalTaxApplied?.amount ?? 0);

      const payload = {
        subwork_item_id: resolvedSubworkItemId,
        item_rate_id: selectedRateId ?? null,
        base_rate: summary.baseRate,
        entries,
        final_tax_percent: finalTaxApplied?.percent ?? null,
        final_tax_amount: finalTaxApplied?.amount ?? null,
        total_additions: summary.additions,
        total_deletions: summary.deletions,
        total_taxes: summary.taxes,
        final_rate: summary.finalRate,
        total_rate: totalRate,
        created_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      };

      const { data: itemExists, error: checkError } = await supabase
        .schema('estimate')
        .from('subwork_items')
        .select('sr_no')
        .eq('sr_no', resolvedSubworkItemId)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking if item exists:', checkError);
        throw checkError;
      }

      if (!itemExists) {
        console.log('Item does not exist yet - returning payload for pending save');
        onSaveRate?.(totalRate, payload);
        onClose();
        return;
      }

      // 🔍 Check if analysis already exists
      let existingQuery = supabase
        .schema('estimate')
        .from('item_rate_analysis')
        .select('sr_no')
        .eq('subwork_item_id', resolvedSubworkItemId);

      if (selectedRateId !== null && selectedRateId !== undefined) {
        existingQuery = existingQuery.eq('item_rate_id', selectedRateId);
      } else {
        existingQuery = existingQuery.is('item_rate_id', null);
      }

      const { data: existingAnalysis } = await existingQuery.maybeSingle();

      if (existingAnalysis?.sr_no) {
        // ✅ UPDATE
        console.log('Updating existing rate analysis:', existingAnalysis.sr_no);
        const { error } = await supabase
          .schema('estimate')
          .from('item_rate_analysis')
          .update(payload)
          .eq('sr_no', existingAnalysis.sr_no);

        if (error) {
          console.error('Error updating rate analysis:', error);
          throw error;
        }
        console.log('Rate analysis updated successfully');
        setIsEditMode(true);
      } else {
        // ✅ INSERT
        console.log('Inserting new rate analysis');
        const { error } = await supabase
          .schema('estimate')
          .from('item_rate_analysis')
          .insert(payload);

        if (error) {
          console.error('Error inserting rate analysis:', error);
          throw error;
        }
        console.log('Rate analysis inserted successfully');
        setIsEditMode(true);
      }

      // ✅ Update item_rates only when rate exists
      if (selectedRateId) {
        console.log('Updating item rate:', selectedRateId, 'to:', totalRate);
        const { error } = await supabase
          .schema('estimate')
          .from('item_rates')
          .update({ rate: totalRate })
          .eq('sr_no', selectedRateId);

        if (error) {
          console.error('Error updating item rate:', error);
          throw error;
        }
        console.log('Item rate updated successfully');
      }

      // ✅ UI sync
      onSaveRate?.(totalRate);
      alert('Rate analysis saved successfully!');
      onClose();

    } catch (err) {
      console.error('Error saving rate analysis:', err);
      alert(`Failed to save rate analysis: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('hi-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount);
  };

  const totalMeasurementQuantity = measurements.reduce((sum, m) => sum + m.calculated_quantity, 0);
  const totalMeasurementAmount = measurements.reduce((sum, m) => sum + m.line_amount, 0);
  const totalLeadCharges = leads.reduce((sum, l) => sum + l.net_lead_charges, 0);
  const totalMaterialCost = materials.reduce((sum, m) => sum + m.total_material_cost, 0);

  if (!isOpen) return null;

  // Add entry handler
  const handleAddEntry = (forceManual: boolean = false) => {
    if (
      newTax.label &&
      newTax.type &&
      Number(newTax.value) > 0 &&
      Number(newTax.factor) > 0 &&
      (isFromLeadStatement || forceManual)
    ) {
      const baseRate = savedBaseRate !== null
        ? savedBaseRate
        : (selectedRateValue > 0
          ? selectedRateValue
          : (baseRateProp ?? item?.ssr_rate ?? 0));

      const amount = calculateAmount(
        newTax.type,
        baseRate,
        Number(newTax.value),
        Number(newTax.factor)
      );

      setEntries(prev => [
        ...prev,
        {
          label: newTax.label,
          type: newTax.type,
          value: Number(newTax.value),
          factor: Number(newTax.factor),
          amount,
        }
      ]);

      setNewTax({ label: '', value: '', factor: 1, type: 'Addition' });
      setIsFromLeadStatement(false);
      setEditIndex(null);
    }
  };

  // Check if manual add confirmation is needed
  const handleAddClick = () => {
    if (!isFromLeadStatement && newTax.label && newTax.value && Number(newTax.value) > 0) {
      setShowManualAddConfirmation(true);
    } else {
      handleAddEntry();
    }
  };

  // Confirm manual add
  const confirmManualAdd = () => {
    handleAddEntry(true);
    setShowManualAddConfirmation(false);
  };

  // Cancel manual add
  const cancelManualAdd = () => {
    setShowManualAddConfirmation(false);
  };

  // Edit handler
  const handleEdit = (index: number) => {
    const entry = entries[index];
    setNewTax({
      label: entry.label,
      value: entry.value,
      type: entry.type,
      factor: entry.factor
    });
    setEditIndex(index);
  };

  // Update handler
  const handleUpdate = () => {
    if (
      editIndex !== null &&
      newTax.label &&
      newTax.type &&
      Number(newTax.value) > 0 &&
      Number(newTax.factor) > 0
    ) {
      const baseRate = savedBaseRate !== null
        ? savedBaseRate
        : (selectedRateValue > 0
          ? selectedRateValue
          : (baseRateProp ?? item?.ssr_rate ?? 0));

      const amount = calculateAmount(
        newTax.type,
        baseRate,
        Number(newTax.value),
        Number(newTax.factor)
      );

      setEntries(entries.map((ent, idx) =>
        idx === editIndex
          ? {
            label: newTax.label,
            type: newTax.type,
            value: Number(newTax.value),
            factor: Number(newTax.factor),
            amount
          }
          : ent
      ));

      setNewTax({ label: '', value: '', factor: 1, type: 'Addition' });
      setEditIndex(null);
    }
  };

  // Delete handler
  const handleDelete = (index: number) => {
    setEntries(prev => prev.filter((_, idx) => idx !== index));
    setEditIndex(null);
    setNewTax({ label: '', value: '', factor: 1, type: 'Addition' });
  };

  // INLINE SAVE FOR NEW ROW (Option A behavior)
  const saveNewRow = (index: number) => {
    const baseRate = savedBaseRate !== null
      ? savedBaseRate
      : (selectedRateValue > 0
        ? selectedRateValue
        : (baseRateProp ?? item?.ssr_rate ?? 0));
    const amount = calculateAmount(
      tempRow.type,
      baseRate,
      Number(tempRow.value),
      Number(tempRow.factor)
    );
    const newEntry = {
      label: tempRow.label,
      type: tempRow.type,
      value: Number(tempRow.value),
      factor: Number(tempRow.factor),
      amount,
    };

    const updated = [...entries];
    updated.splice(index + 1, 0, newEntry);
    setEntries(updated);

    setRowBeingAddedBelow(null);
    setTempRow({ label: '', type: 'Addition', value: 0, factor: 1 });
  };

  // INLINE SAVE FOR EDITED ROW
  const saveEditedRow = (index: number) => {
    const baseRate = savedBaseRate !== null
      ? savedBaseRate
      : (selectedRateValue > 0
        ? selectedRateValue
        : (baseRateProp ?? item?.ssr_rate ?? 0));
    const amount = calculateAmount(
      tempRow.type,
      baseRate,
      Number(tempRow.value),
      Number(tempRow.factor)
    );

    const updated = entries.map((row, idx) =>
      idx === index
        ? {
          label: tempRow.label,
          type: tempRow.type,
          value: Number(tempRow.value),
          factor: Number(tempRow.factor),
          amount
        }
        : row
    );

    setEntries(updated);
    setRowBeingEdited(null);
    setTempRow({ label: '', type: 'Addition', value: 0, factor: 1 });
  };

  // FINAL RATE TAX HANDLERS
  const openFinalTaxInput = () => {
    setShowFinalTaxInput(true);
    setFinalTaxPercentInput(finalTaxApplied ? finalTaxApplied.percent : 0);
  };

  const saveFinalTax = () => {
    const percent = Number(finalTaxPercentInput) || 0;
    const amount = (summary.finalRate * percent) / 100;
    setFinalTaxApplied({ percent, amount });
    setShowFinalTaxInput(false);
  };

  const cancelFinalTaxInput = () => {
    setShowFinalTaxInput(false);
    setFinalTaxPercentInput(finalTaxApplied ? finalTaxApplied.percent : 0);
  };

  const clearFinalTax = () => {
    setFinalTaxApplied(null);
    setFinalTaxPercentInput(0);
    setShowFinalTaxInput(false);
  };

  const totalRateWithFinalTax = summary.finalRate + (finalTaxApplied ? finalTaxApplied.amount : 0);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Addition':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Deletion':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'Tax':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 overflow-y-auto h-full w-full z-[60] flex items-center justify-center p-4">
      <div className="relative w-full max-w-4xl bg-white rounded-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">
                Rate Analysis - Item {item?.item_number}
              </h2>
              <p className="text-sm text-gray-600 leading-relaxed">{item?.description_of_item}</p>
            </div>
            <button
              onClick={onClose}
              className="ml-4 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-2 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-6">
          {/* Rate Selection Dropdown - Show when multiple rates exist */}
          {itemRates.length > 1 && (
            <div className="mb-6 bg-purple-50 border border-purple-200 rounded-lg p-4">
              <label className="block text-sm font-medium text-purple-800 mb-2">
                Select Rate to View/Edit:
              </label>
              <select
                value={selectedRateId || ''}
                onChange={(e) => {
                  const rateId = parseInt(e.target.value);
                  const rate = itemRates.find(r => r.sr_no === rateId);
                  if (rate) {
                    setSelectedRateId(rateId);
                    setSelectedRateValue(rate.rate);
                  }
                }}
                className="w-full px-3 py-2 border border-purple-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
              >
                {itemRates.map((rate) => (
                  <option key={rate.sr_no} value={rate.sr_no}>
                    {rate.description} - ₹{rate.rate.toFixed(2)} ({rate.ssr_unit})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* CSR Item Details Section */}
          {item?.csr_item_no && (
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="text-sm font-medium text-blue-800 mb-3">Selected CSR Item:</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-600">Item No:</span>
                  <span className="ml-2 font-medium text-gray-900">{item.csr_item_no}</span>
                </div>
                <div>
                  <span className="text-gray-600">Unit:</span>
                  <span className="ml-2 font-medium text-gray-900">{item.csr_unit || item.ssr_unit}</span>
                </div>
                <div>
                  <span className="text-gray-600">Base Rate:</span>
                  <span className="ml-2 font-medium text-gray-900">₹{summary.baseRate.toFixed(2)}</span>
                </div>
                {item.csr_labour_cost > 0 && (
                  <div>
                    <span className="text-gray-600">Labour:</span>
                    <span className="ml-2 font-medium text-gray-900">₹{item.csr_labour_cost.toFixed(2)}</span>
                  </div>
                )}
                {item.csr_reference && (
                  <div className="col-span-2 mt-1 pt-3 border-t border-blue-300">
                    <span className="text-gray-600">Reference:</span>
                    <span className="ml-2 font-medium text-gray-900">{item.csr_reference}</span>
                  </div>
                )}
              </div>
              {item.description_of_item && (
                <div className="mt-3 pt-3 border-t border-blue-300">
                  <div className="text-gray-600 font-medium mb-1">Main Item Description:</div>
                  <div className="text-gray-700 text-xs leading-relaxed bg-white p-2 rounded">
                    {item.description_of_item}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Base Rate Section */}
          <div className="mb-6 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">Base Rate:</span>
              <span className="text-2xl font-bold text-blue-900">₹{summary.baseRate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Add New Entry Form */}
          <div className="mb-6 bg-gray-50 rounded-lg p-5 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Rate Adjustment
            </h3>
            <div className="flex flex-row items-end gap-3 w-full">
              <div className="flex-1 relative">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Label <span className="text-red-500">*</span>
                  {isFromLeadStatement && (
                    <span className="ml-2 text-green-600 text-xs">✓ Selected from Lead Statement</span>
                  )}
                </label>
                <input
                  type="text"
                  value={newTax.label}
                  onChange={(e) => {
                    setNewTax({ ...newTax, label: e.target.value });
                    setIsFromLeadStatement(false);
                    searchLeadStatements(e.target.value);
                  }}
                  onFocus={(e) => {
                    if (e.target.value.length >= 2) {
                      searchLeadStatements(e.target.value);
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowLeadDropdown(false), 300);
                  }}
                  className={`w-full px-3 py-2.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    isFromLeadStatement ? 'border-green-500 bg-green-50' : 'border-gray-300'
                  }`}
                  placeholder="Type to search and select material from Lead Statement"
                />
                {searchingLeads && (
                  <div className="absolute right-3 top-9 text-gray-400">
                    <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                  </div>
                )}
                {searchCompleted && !searchingLeads && newTax.label.length >= 2 && leadStatements.length === 0 && !showLeadDropdown && (
                  <div className="absolute z-[100] w-full mt-1 bg-white border border-red-300 rounded-md shadow-lg p-3">
                    <div className="text-xs text-red-600 text-center font-medium">
                      No materials found in Lead Statement. Please add the material to Lead Statement first.
                    </div>
                  </div>
                )}
                {showLeadDropdown && leadStatements.length > 0 && (
                  <div className="absolute z-[100] w-full mt-1 bg-white border-2 border-blue-400 rounded-md shadow-2xl max-h-60 overflow-y-auto">
                    <div className="sticky top-0 bg-blue-50 px-3 py-1.5 border-b border-blue-200">
                      <div className="text-xs font-semibold text-blue-800">
                        {leadStatements.length} material{leadStatements.length !== 1 ? 's' : ''} found - Click to select
                      </div>
                    </div>
                    {leadStatements.map((lead, idx) => (
                      <div
                        key={idx}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectLeadStatement(lead);
                        }}
                        className="px-3 py-2.5 hover:bg-blue-100 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
                      >
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-gray-900">{lead.material}</div>
                            {lead.reference && (
                              <div className="text-xs text-gray-600 mt-0.5">📍 Ref: {lead.reference}</div>
                            )}
                            {lead.lead_in_km && (
                              <div className="text-xs text-gray-600">🚚 Lead: {lead.lead_in_km} km</div>
                            )}
                          </div>
                          <div className="ml-3 text-right flex-shrink-0">
                            <div className="text-base font-bold text-green-600">
                              ₹{Number(lead.total_rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </div>
                            {lead.unit && (
                              <div className="text-xs text-gray-600 font-medium">per {lead.unit}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="w-40">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={newTax.type}
                  onChange={(e) => setNewTax({ ...newTax, type: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="Addition">Addition</option>
                  <option value="Deletion">Deletion</option>
                  <option value="Tax">Percentage(%)</option>
                </select>
              </div>
              <div className="w-32">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Value <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newTax.value}
                  onChange={(e) => setNewTax({ ...newTax, value: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0.00"
                />
              </div>

              <div className="w-24">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Factor
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newTax.factor}
                  onChange={(e) =>
                    setNewTax({ ...newTax, factor: Number(e.target.value) || 1 })
                  }
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-md
               focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="1"
                />
              </div>
              <div>
                {editIndex === null ? (
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={handleAddClick}
                      disabled={!newTax.label || !newTax.value}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </button>
                    {newTax.label && !isFromLeadStatement && (
                      <p className="text-xs text-amber-600 text-center">Manual entry</p>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleUpdate}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors"
                  >
                    <Check className="h-4 w-4" />
                    Update
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Entries Table */}
          {entries.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Rate Adjustments</h3>
              <div className="overflow-hidden border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                        Label
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                        Type
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">
                        Value
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">
                        Factor
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">
                        Calculated Amount
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="bg-white divide-y divide-gray-200">
                    {entries.map((entry, idx) => (
                      <React.Fragment key={idx}>
                        <tr className="hover:bg-gray-50 transition-colors">
                          {rowBeingEdited === idx ? (
                            <>
                              {/* Label */}
                              <td className="px-4 py-3">
                                <input
                                  className="border border-gray-300 rounded px-2 py-1 w-full text-sm"
                                  value={tempRow.label}
                                  onChange={(e) =>
                                    setTempRow({ ...tempRow, label: e.target.value })
                                  }
                                />
                              </td>

                              {/* Type */}
                              <td className="px-4 py-3">
                                <select
                                  className="border border-gray-300 rounded px-2 py-1 w-full text-sm"
                                  value={tempRow.type}
                                  onChange={(e) =>
                                    setTempRow({ ...tempRow, type: e.target.value })
                                  }
                                >
                                  <option value="Addition">Addition</option>
                                  <option value="Deletion">Deletion</option>
                                  <option value="Tax">Tax</option>
                                </select>
                              </td>

                              {/* Value */}
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  className="border border-gray-300 rounded px-2 py-1 w-full text-sm text-right"
                                  value={tempRow.value}
                                  onChange={(e) =>
                                    setTempRow({
                                      ...tempRow,
                                      value: Number(e.target.value),
                                    })
                                  }
                                />
                              </td>

                              {/* Factor */}
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  className="border border-gray-300 rounded px-2 py-1 w-full text-sm text-right"
                                  value={tempRow.factor}
                                  onChange={(e) =>
                                    setTempRow({
                                      ...tempRow,
                                      factor: Number(e.target.value) || 1,
                                    })
                                  }
                                />
                              </td>

                              {/* Calculated Amount */}
                              <td className="px-4 py-3 text-right text-sm font-medium">
                                {formatCurrency(
                                  calculateAmount(
                                    tempRow.type,
                                    summary.baseRate,
                                    Number(tempRow.value),
                                    Number(tempRow.factor)
                                  )
                                )}
                              </td>

                              {/* Actions */}
                              <td className="px-4 py-3">
                                <div className="flex gap-2 justify-center">
                                  <button
                                    onClick={() => saveEditedRow(idx)}
                                    className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setRowBeingEdited(null)}
                                    className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
                                  >
                                    <CancelIcon className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              {/* Label */}
                              <td className="px-4 py-3 text-sm text-gray-900">
                                {entry.label}
                              </td>

                              {/* Type */}
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${getTypeColor(
                                    entry.type
                                  )}`}
                                >
                                  {entry.type}
                                </span>
                              </td>

                              {/* Value */}
                              <td className="px-4 py-3 text-right text-sm text-gray-900">
                                {entry.type === 'Tax'
                                  ? `${entry.value}%`
                                  : formatCurrency(entry.value)}
                              </td>

                              {/* Factor */}
                              <td className="px-4 py-3 text-right text-sm text-gray-900">
                                {entry.factor}
                              </td>

                              {/* Calculated Amount */}
                              <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                                {formatCurrency(entry.amount)}
                              </td>

                              {/* Actions */}
                              <td className="px-4 py-3">
                                <div className="flex gap-2 justify-center">
                                  <button
                                    onClick={() => {
                                      setRowBeingAddedBelow(idx);
                                      setTempRow({
                                        label: '',
                                        type: 'Addition',
                                        value: 0,
                                        factor: 1
                                      });
                                    }}
                                    className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setRowBeingEdited(idx);
                                      setTempRow({
                                        label: entry.label,
                                        type: entry.type,
                                        value: entry.value,
                                        factor: entry.factor
                                      });
                                    }}
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      setEntries(entries.filter((_, i) => i !== idx))
                                    }
                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>

                        {/* INLINE NEW ROW */}
                        {rowBeingAddedBelow === idx && (
                          <tr className="bg-blue-50">
                            <td className="px-4 py-3">
                              <input
                                className="border border-blue-300 rounded px-2 py-1 w-full text-sm"
                                value={tempRow.label}
                                onChange={(e) =>
                                  setTempRow({ ...tempRow, label: e.target.value })
                                }
                              />
                            </td>

                            <td className="px-4 py-3">
                              <select
                                className="border border-blue-300 rounded px-2 py-1 w-full text-sm"
                                value={tempRow.type}
                                onChange={(e) =>
                                  setTempRow({ ...tempRow, type: e.target.value })
                                }
                              >
                                <option value="Addition">Addition</option>
                                <option value="Deletion">Deletion</option>
                                <option value="Tax">Tax</option>
                              </select>
                            </td>

                            <td className="px-4 py-3">
                              <input
                                type="number"
                                className="border border-blue-300 rounded px-2 py-1 w-full text-sm text-right"
                                value={tempRow.value}
                                onChange={(e) =>
                                  setTempRow({
                                    ...tempRow,
                                    value: Number(e.target.value),
                                  })
                                }
                              />
                            </td>

                            <td className="px-4 py-3">
                              <input
                                type="number"
                                className="border border-blue-300 rounded px-2 py-1 w-full text-sm text-right"
                                value={tempRow.factor}
                                onChange={(e) =>
                                  setTempRow({
                                    ...tempRow,
                                    factor: Number(e.target.value) || 1,
                                  })
                                }
                              />
                            </td>

                            <td className="px-4 py-3 text-right text-sm font-medium">
                              {formatCurrency(
                                calculateAmount(
                                  tempRow.type,
                                  summary.baseRate,
                                  Number(tempRow.value),
                                  Number(tempRow.factor)
                                )
                              )}
                            </td>

                            <td className="px-4 py-3">
                              <div className="flex gap-2 justify-center">
                                <button
                                  onClick={() => saveNewRow(idx)}
                                  className="p-1.5 text-green-700 hover:bg-green-100 rounded"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setRowBeingAddedBelow(null)}
                                  className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
                                >
                                  <CancelIcon className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Summary Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">Summary</h3>

            <div className="grid grid-cols-4 gap-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="text-xs font-medium text-green-700 mb-1">Total Additions</div>
                <div className="text-xl font-bold text-green-900">{formatCurrency(summary.additions)}</div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="text-xs font-medium text-red-700 mb-1">Total Deletions</div>
                <div className="text-xl font-bold text-red-900">{formatCurrency(summary.deletions)}</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="text-xs font-medium text-blue-700 mb-1">Total Taxes</div>
                <div className="text-xl font-bold text-blue-900">{formatCurrency(summary.taxes)}</div>
              </div>
              <div className="bg-gray-100 border border-gray-300 rounded-lg p-4">
                <div className="text-xs font-medium text-gray-700 mb-1">Calculated Rate</div>
                <div className="text-xl font-bold text-gray-900">{formatCurrency(summary.finalRate)}</div>
              </div>
            </div>

            {/* Add Tax on Final Rate Section */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-blue-900 mb-1">Additional Tax on Final Rate</h4>
                  <p className="text-xs text-blue-700">Apply additional tax percentage on the calculated rate</p>
                </div>

                {!finalTaxApplied && !showFinalTaxInput && (
                  <button
                    type="button"
                    onClick={openFinalTaxInput}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Tax/Percentage
                  </button>
                )}
              </div>

              {showFinalTaxInput && (
                <div className="mt-3 flex items-center gap-3 bg-white p-3 rounded-md border border-blue-300">
                  <label className="text-sm font-medium text-gray-700">Tax/Percentage:</label>
                  <input
                    type="number"
                    step="0.01"
                    value={finalTaxPercentInput}
                    onChange={(e) => setFinalTaxPercentInput(Number(e.target.value))}
                    className="w-24 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                  <span className="text-sm text-gray-600">%</span>
                  <button
                    onClick={saveFinalTax}
                    className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                    title="Apply Tax"
                  >
                    <Check className="w-5 h-5" />
                  </button>
                  <button
                    onClick={cancelFinalTaxInput}
                    className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                    title="Cancel"
                  >
                    <CancelIcon className="w-5 h-5" />
                  </button>
                </div>
              )}

              {finalTaxApplied && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between bg-white p-3 rounded-md border border-blue-300">
                    <div>
                      <div className="text-sm text-gray-600">
                        Tax Applied: <span className="font-semibold text-blue-900">{finalTaxApplied.percent}%</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        Tax Amount: <span className="font-semibold text-blue-900">{formatCurrency(finalTaxApplied.amount)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={openFinalTaxInput}
                        className="px-3 py-1.5 bg-yellow-500 text-white text-xs font-medium rounded hover:bg-yellow-600 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={clearFinalTax}
                        className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded hover:bg-red-600 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Final Rate Display */}
            <div className="bg-gradient-to-r from-green-50 to-green-100 border-2 border-green-300 rounded-lg p-5">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="text-sm font-medium text-green-800 mb-1">Final Rate</div>
                  <div className="text-3xl font-bold text-green-900">
                    {formatCurrency(totalRateWithFinalTax)}
                  </div>
                  {finalTaxApplied && (
                    <div className="text-xs text-green-700 mt-1">
                      (Including {finalTaxApplied.percent}% additional tax)
                    </div>
                  )}
                  <div className="mt-3 pt-3 border-t border-green-200">
                    <div className="text-xs font-medium text-green-800 mb-1.5">Calculation Formula:</div>
                    <div className="text-xs text-green-700 space-y-1">
                      <div>Base Rate: ₹{summary.baseRate.toFixed(2)}</div>
                      <div>+ Additions: ₹{summary.additions.toFixed(2)}</div>
                      <div>- Deletions: ₹{summary.deletions.toFixed(2)}</div>
                      <div>+ Taxes: ₹{summary.taxes.toFixed(2)}</div>
                      <div className="pt-1 border-t border-green-200">
                        = Calculated Rate: ₹{summary.calculatedRate.toFixed(2)}
                      </div>
                      <div className="font-medium pt-1">
                        Final Rate = CEILING((₹{summary.calculatedRate.toFixed(2)} - 0.025) / 0.05) × 0.05
                      </div>
                      <div className="font-semibold text-green-900">
                        = ₹{summary.finalRate.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
                <Calculator className="w-12 h-12 text-green-600 opacity-50" />
              </div>
            </div>
          </div>
        </div>

        {/* Footer with Save Button */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            All changes will be saved when you click the Save button
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-md shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={saveRateAnalysis}
              disabled={loading}
            >
              {loading ? 'Saving...' : (isEditMode ? 'Update Analysis' : 'Save Analysis')}
            </button>
          </div>
        </div>
      </div>

      {showManualAddConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Manual Entry Confirmation</h3>
            <p className="text-sm text-gray-600 mb-6">
              Do you want to add this item manually? Items selected from the Lead Statement dropdown are preferred for consistency.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={cancelManualAdd}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmManualAdd}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
              >
                Add Manually
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RateAnalysis;