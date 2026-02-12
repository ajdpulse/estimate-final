import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { SubworkItem, ItemMeasurement, ItemLead, ItemMaterial } from '../types';
import { Plus, CreditCard as Edit2, Trash2, Calculator, Truck, Upload, X, Image as ImageIcon, Package2, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ItemMeasurementsProps {
  item: SubworkItem;
  isOpen: boolean;
  onClose: () => void;
  onItemUpdated?: (itemSrNo: number) => void;
  availableRates: ItemRate[];
  rateDescriptions: string[];
  selectedSrNo: number;
}

const ItemMeasurements: React.FC<ItemMeasurementsProps> = ({
  item,
  isOpen,
  onClose,
  onItemUpdated,
  availableRates,
  rateDescriptions,
  selectedSrNo,
}) => {
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
  const [currentItem, setCurrentItem] = useState<SubworkItem>(item);
  const [selectedDescription, setSelectedDescription] = useState<string>('');
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [newMeasurement, setNewMeasurement] = useState<Partial<ItemMeasurement>>({
    factor: 1,
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
  const [availableItems, setAvailableItems] = useState<Array<{ sr_no: number, item_number: string, description: string, total_quantity: number, unit: string }>>([]);
  const [isReferencing, setIsReferencing] = useState(false);
  const [selectedReferenceItem, setSelectedReferenceItem] = useState<number | null>(null);

  // Item-level operation state
  const [itemOperation, setItemOperation] = useState<{
    operation_type: 'none' | 'multiply' | 'divide' | 'add' | 'subtract';
    operation_value: number;
    unit_conversion_factor: number;
    final_unit: string;
  }>({
    operation_type: 'none',
    operation_value: 0,
    unit_conversion_factor: 1,
    final_unit: ''
  });

  // Get the selected rate for calculations
  const getSelectedRate = () => {
    if (newMeasurement.selected_rate_id) {
      const selectedRate = availableRates.find(rate => rate.sr_no === newMeasurement.selected_rate_id);
      return selectedRate ? selectedRate.rate : item.ssr_rate;
    }
    return item.ssr_rate;
  };

  useEffect(() => {
    if (isOpen && item.sr_no) {
      fetchData();
      fetchAvailableItems();
    }
  }, [isOpen, item.sr_no, activeTab]);

  useEffect(() => {
    setCurrentItem(item);
    // Load item operation settings
    setItemOperation({
      operation_type: item.operation_type || 'none',
      operation_value: item.operation_value || 0,
      unit_conversion_factor: item.unit_conversion_factor || 1,
      final_unit: item.final_unit || ''
    });
  }, [item]);

  useEffect(() => {
    calculateRateGroups();
  }, [measurements, itemRates]);

  const calculateQuantity = () => {
    // If manual quantity is enabled, use the manual quantity value
    if (newMeasurement.is_manual_quantity && newMeasurement.manual_quantity !== undefined) {
      return newMeasurement.manual_quantity;
    }

    // Otherwise calculate from dimensions including factor
    return (newMeasurement.factor || 1) *
      (newMeasurement.no_of_units || 0) *
      (newMeasurement.length || 0) *
      (newMeasurement.width_breadth || 0) *
      (newMeasurement.height_depth || 0);
  };

  // Calculate final quantity for the entire item based on total of all measurements
  const calculateItemFinalQuantity = (totalQuantity: number) => {
    const operationType = itemOperation.operation_type || 'none';
    const operationValue = itemOperation.operation_value || 0;

    let finalQty = totalQuantity;

    // Apply operation
    switch (operationType) {
      case 'multiply':
        finalQty = totalQuantity * operationValue;
        break;
      case 'divide':
        finalQty = operationValue !== 0 ? totalQuantity / operationValue : totalQuantity;
        break;
      case 'add':
        finalQty = totalQuantity + operationValue;
        break;
      case 'subtract':
        finalQty = totalQuantity - operationValue;
        break;
      case 'none':
      default:
        finalQty = totalQuantity;
        break;
    }

    // Apply unit conversion factor (like dividing by 1000 to convert KG to MT)
    const conversionFactor = itemOperation.unit_conversion_factor || 1;
    if (conversionFactor !== 1) {
      finalQty = finalQty / conversionFactor;
    }

    return finalQty;
  };

  const calculateLineAmount = () => {
    const quantity = calculateQuantity();
    const amount = quantity * getSelectedRate();
    return newMeasurement.is_deduction ? -amount : amount;

    // Use selected rate or default to item's SSR rate
    let rate = currentItem?.ssr_rate || 0;
    if (newMeasurement.selected_rate_id && itemRates.length > 0) {
      const selectedRate = itemRates.find(r => r.sr_no === newMeasurement.selected_rate_id);
      if (selectedRate) {
        rate = selectedRate.rate;
      }
    }
  };

  const calculateRateGroups = () => {
    const groups: { [key: string]: { rate: number, quantity: number, description?: string } } = {};

    measurements.forEach(measurement => {
      const rate = getSelectedRateForMeasurement(measurement);
      const rateKey = rate.toString();

      if (!groups[rateKey]) {
        // Find rate description from itemRates
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

  // Safely refresh session with timeout to avoid hanging awaits after tab change
  const refreshSessionSafely = async (timeout = 3000) => {
    try {
      const refreshPromise = supabase.auth.refreshSession();
      const result = await Promise.race([
        refreshPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('session-refresh-timeout')), timeout))
      ]);
      return result;
    } catch (e) {
      console.warn('Session refresh failed or timed out:', e);
      return null;
    }
  };

  // Helper to race any promise (eg. Supabase queries) with a timeout to avoid indefinite hangs
  const withTimeout = async (promise: Promise<any>, ms = 7000) => {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('supabase-timeout')), ms))
    ]);
  };

  const handleMeasurementExcelUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file || !currentItem || !user) return;

    try {
      setUploadingExcel(true);

      const fileExt = file.name.split('.').pop();
      const storedFileName = `${currentItem.sr_no}_${Date.now()}.${fileExt}`;
      const filePath = `measurements/${storedFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('estimate-designs')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error(`Failed to upload file: ${uploadError.message}`);
      }

      const { data } = supabase.storage
        .from('estimate-designs')
        .getPublicUrl(filePath);

      const publicUrl = data.publicUrl;

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);

      if (!rows.length) {
        alert('Excel file is empty. Please add data to the Excel file.');
        event.target.value = '';
        return;
      }

      const nextSrNo = await getNextMeasurementSrNo();

      const insertRows = rows.map((row, index) => {
        const quantity = Number(row.Quantity || row.quantity || 0);
        return {
          subwork_item_id: currentItem.sr_no,
          measurement_sr_no: nextSrNo + index,
          description_of_items: row.Description || row.description || null,
          unit: currentItem.ssr_unit,
          factor: 1,
          no_of_units: 1,
          length: 1,
          width_breadth: 1,
          height_depth: 1,
          is_manual_quantity: true,
          manual_quantity: quantity,
          calculated_quantity: quantity,
          is_deduction: false,
          rate: currentItem.ssr_rate || 0,
          line_amount: quantity * (currentItem.ssr_rate || 0),
          excel_url: publicUrl,
          excel_name: file.name,
          created_by: user.id,
        };
      });

      const { error: insertError } = await supabase
        .schema('estimate')
        .from('item_measurements')
        .insert(insertRows);

      if (insertError) {
        console.error('Database insert error:', insertError);
        throw new Error(`Failed to save measurements: ${insertError.message}`);
      }

      await fetchData();
      await updateItemSSRQuantity();

      alert(`${rows.length} measurement(s) uploaded successfully from Excel!`);
      setShowAddModal(false);
      event.target.value = '';

    } catch (error) {
      console.error('Error uploading measurement Excel:', error);
      alert(error.message || 'Error uploading measurement Excel. Please try again.');
      event.target.value = '';
    } finally {
      setUploadingExcel(false);
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

  const fetchAvailableItems = async () => {
    try {
      // Get all items from the same subwork
      const { data: items, error: itemsError } = await supabase
        .schema('estimate')
        .from('subwork_items')
        .select('sr_no, item_number, description_of_item, ssr_unit')
        .eq('subwork_id', currentItem.subwork_id)
        .neq('sr_no', currentItem.sr_no) // Exclude the current item
        .order('item_number', { ascending: true });

      if (itemsError) throw itemsError;

      // For each item, get the total calculated quantity from measurements
      const itemsWithQuantities = await Promise.all(
        (items || []).map(async (item) => {
          const { data: measurements, error: measurementsError } = await supabase
            .schema('estimate')
            .from('item_measurements')
            .select('calculated_quantity, is_deduction')
            .eq('subwork_item_id', item.sr_no);

          if (measurementsError) {
            console.error('Error fetching measurements for item:', item.sr_no, measurementsError);
            return null;
          }

          // Calculate total quantity (accounting for deductions)
          const totalQuantity = (measurements || []).reduce((sum, m) => {
            if (m.is_deduction) {
              return sum - Math.abs(m.calculated_quantity);
            } else {
              return sum + m.calculated_quantity;
            }
          }, 0);

          // Only include items that have measurements
          if (measurements && measurements.length > 0) {
            return {
              sr_no: item.sr_no,
              item_number: item.item_number,
              description: item.description_of_item,
              total_quantity: totalQuantity,
              unit: item.ssr_unit || ''
            };
          }
          return null;
        })
      );

      // Filter out null values and set the state
      setAvailableItems(itemsWithQuantities.filter(item => item !== null) as Array<{ sr_no: number, item_number: string, description: string, total_quantity: number, unit: string }>);
    } catch (error) {
      console.error('Error fetching available items:', error);
    }
  };

  const getNextMeasurementSrNoFromState = () => {
    if (!measurements || measurements.length === 0) return 1;

    const lastSrNo = Math.max(
      ...measurements.map(m => m.measurement_sr_no || 0)
    );

    return lastSrNo + 1;
  };

 const handleAddMeasurement = async () => {debugger
    if (!user) return;
    try {
      const nextSrNo = await getNextMeasurementSrNoFromState();
      const calculatedQuantity = (newMeasurement.no_of_units || 0) *
        (newMeasurement.length || 0) *
        (newMeasurement.width_breadth || 0) *
        (newMeasurement.height_depth || 0);

      // Use the selected rate
      const rate = selectedRate;
      const lineAmount = calculatedQuantity * rate;

      // 🔹 Fetch subwork_item_id from item_rates using selected_rate_id
      const { data: rateData, error: rateFetchError } = await supabase
        .schema('estimate')
        .from('item_rates')
        .select('sr_no, subwork_item_sr_no, rate')
        .eq('description', selectedDescription)   // Now using description instead of sr_no
        .single();

      if (rateFetchError) throw rateFetchError;
      const subworkItemId = rateData?.subwork_item_sr_no;
      const rateSrNo = rateData?.sr_no;

      const { error } = await supabase
        .schema('estimate')
        .from('item_measurements')
        .insert([{
          ...newMeasurement,
          subwork_item_id: subworkItemId,   // 🔹 Corrected
          measurement_sr_no: nextSrNo,
          calculated_quantity: calculatedQuantity,
          line_amount: rateData?.rate * calculatedQuantity,
          unit: newMeasurement.unit || null,
          is_deduction: newMeasurement.is_deduction || false,
          is_manual_quantity: newMeasurement.is_manual_quantity || false,
          manual_quantity: newMeasurement.is_manual_quantity ? (newMeasurement.manual_quantity || 0) : null,
          selected_rate_id: newMeasurement.selected_rate_id || null,
          rate_sr_no: rateSrNo
        }]);

      if (error) throw error;

      // 🔹 Sum all calculated_quantity for this rate_sr_no from item_measurements table
      const { data: measurementsForRate, error: measurementsError } = await supabase
        .schema('estimate')
        .from('item_measurements')
        .select('calculated_quantity')
        .eq('rate_sr_no', rateSrNo);

      if (measurementsError) throw measurementsError;

      // Calculate total quantity sum
      const totalCalculatedQuantity = measurementsForRate?.reduce((sum, m) => sum + (m.calculated_quantity || 0), 0) || 0;

      const fetchedRate = rateData?.rate;
      const rateTotalAmount = totalCalculatedQuantity * fetchedRate;

      const { error: updateRateError } = await supabase
        .schema('estimate')
        .from('item_rates')
        .update({
          ssr_quantity: totalCalculatedQuantity,
          rate_total_amount: rateTotalAmount
        })
        .eq('sr_no', rateSrNo);

      if (updateRateError) throw updateRateError;

      setShowAddModal(false);
      setNewMeasurement({
        no_of_units: 0,
        length: 0,
        width_breadth: 0,
        height_depth: 0,
        selected_rate_id: 0
      });
      setSelectedRate(0);

      // Refresh data first, then update SSR quantity
      fetchData();

      // Update SSR quantity after adding measurement
      setTimeout(async () => {
        await updateItemSSRQuantity();
      }, 100);
    } catch (error) {
      console.error('Error adding measurement:', error);
    }
  };


  const copyLastMeasurement = () => {
    if (measurements.length > 0) {
      const lastMeasurement = measurements[measurements.length - 1];
      setNewMeasurement({
        header: lastMeasurement.header,
        description_of_items: lastMeasurement.description_of_items,
        factor: lastMeasurement.factor || 1,
        no_of_units: lastMeasurement.no_of_units,
        is_deduction: lastMeasurement.is_deduction || false,
        length: lastMeasurement.length,
        width_breadth: lastMeasurement.width_breadth,
        height_depth: lastMeasurement.height_depth
      });
    }
  };

  const handleReferenceItemChange = (itemSrNo: number) => {
    setSelectedReferenceItem(itemSrNo);
    const referencedItem = availableItems.find(item => item.sr_no === itemSrNo);
    if (referencedItem) {
      setNewMeasurement({
        ...newMeasurement,
        factor: 1,
        no_of_units: 1,
        length: 1,
        width_breadth: 1,
        height_depth: 1,
        is_manual_quantity: true,
        manual_quantity: referencedItem.total_quantity,
        unit: referencedItem.unit,
        description_of_items: `Reference from Item ${referencedItem.item_number}`
      });
    }
  };

  const handleReferencingToggle = (checked: boolean) => {
    setIsReferencing(checked);
    if (!checked) {
      setSelectedReferenceItem(null);
      setNewMeasurement({
        ...newMeasurement,
        is_manual_quantity: false,
        manual_quantity: 0
      });
    } else {
      // Enable manual quantity when referencing
      setNewMeasurement({
        ...newMeasurement,
        is_manual_quantity: true
      });
    }
  };

  const updateItemSSRQuantity = async () => {
    try {
      // Get all measurements for this item
      // Calculate the new total quantity from measurements
      const newTotalQuantity = measurements.reduce((total, measurement) => {
        if (measurement.is_deduction) {
          return total - Math.abs(measurement.calculated_quantity);
        } else {
          return total + measurement.calculated_quantity;
        }
      }, 0);

      const totalQuantity = measurements.reduce((sum, measurement) => {
        if (measurement.is_deduction) {
          return sum - Math.abs(measurement.calculated_quantity);
        } else {
          return sum + measurement.calculated_quantity;
        }
      }, 0);

      // Calculate new total amount
      const newTotalAmount = newTotalQuantity * currentItem.ssr_rate;

      const { error: updateError } = await supabase
        .schema('estimate')
        .from('subwork_items')
        .update({
          ssr_quantity: totalQuantity,
          total_item_amount: newTotalAmount
        })
        .eq('sr_no', currentItem.sr_no);

      if (updateError) throw updateError;

      // Update the local current item object to reflect changes
      setCurrentItem(prev => ({
        ...prev,
        ssr_quantity: totalQuantity,
        total_item_amount: newTotalAmount
      }));

      // Notify parent component to refresh the item data
      if (onItemUpdated) {
        onItemUpdated(currentItem.sr_no);
      }

    } catch (error) {
      console.error('Error updating SSR quantity:', error);
    }
  };

  const handleEditMeasurement = (measurement: ItemMeasurement) => {
    setSelectedMeasurement(measurement);
    setNewMeasurement({
      header: measurement.header,
      description_of_items: measurement.description_of_items,
      factor: measurement.factor || 1,
      no_of_units: measurement.no_of_units,
      length: measurement.length,
      width_breadth: measurement.width_breadth,
      height_depth: measurement.height_depth,
      unit: measurement.unit || '',
      is_deduction: measurement.is_deduction || false,
      is_manual_quantity: measurement.is_manual_quantity || false,
      manual_quantity: measurement.manual_quantity || 0
    });

    // Set selectedRate to the rate_sr_no or selected_rate_id for dropdown selection
    const rateId = measurement.selected_rate_id || measurement.rate_sr_no || 0;
    setSelectedRate(rateId);

    setShowEditModal(true);
  };


  const handleUpdateMeasurement = async () => {
    if (!selectedMeasurement || !user) return;

    if (selectedRate === 0) {
      alert('Please select a rate');
      return;
    }

    try {
      // 🔄 Refresh session before operations (best-effort, with timeout)
      await refreshSessionSafely(3000);

      const calculatedQuantity = calculateQuantity();

      // Validate calculated quantity
      if (calculatedQuantity === 0 || isNaN(calculatedQuantity)) {
        alert('Please enter valid measurement values or manual quantity');
        return;
      }

      const rate = selectedRate;

      // Fetch rate data (remove .single(), use first entry)
      let rateData: any = null;
      try {
        const rateResp: any = await withTimeout(
          supabase
            .schema('estimate')
            .from('item_rates')
            .select('sr_no, rate, subwork_item_sr_no')
            .eq('subwork_item_sr_no', selectedMeasurement.subwork_item_id),
          7000
        );

        const { data: rateDataArray, error: rateFetchError } = rateResp || {};
        if (rateFetchError) {
          console.error('Rate fetch error:', rateFetchError);
          throw new Error(`Failed to fetch rate data: ${rateFetchError.message}`);
        }
        if (!rateDataArray || rateDataArray.length === 0) throw new Error('No rate data found');
        rateData = rateDataArray[0];
      } catch (err) {
        console.error('Rate fetch timeout or error:', err);
        throw new Error('Failed to fetch rate data (timeout or network issue)');
      }

      const rateSrNo = rateData?.sr_no;

      const { error } = await supabase
        .schema('estimate')
        .from('item_measurements')
        .update({
          header: newMeasurement.header,
          description_of_items: newMeasurement.description_of_items,
          unit: newMeasurement.unit,
          factor: newMeasurement.factor || 1,
          no_of_units: newMeasurement.no_of_units,
          length: newMeasurement.length,
          width_breadth: newMeasurement.width_breadth,
          height_depth: newMeasurement.height_depth,
          calculated_quantity: calculatedQuantity,
          line_amount: rateData?.rate * calculatedQuantity,
          is_manual_quantity: newMeasurement.is_manual_quantity || false,
          manual_quantity: newMeasurement.manual_quantity || 0,
          is_deduction: newMeasurement.is_deduction || false,
          rate_sr_no: rateSrNo
        })
        .eq('subwork_item_id', selectedMeasurement.subwork_item_id)
        .eq('measurement_sr_no', selectedMeasurement.measurement_sr_no);

      if (error) {
        console.error('Update measurement error:', error);
        throw new Error(`Failed to update measurement: ${error.message}`);
      }

      // Sum all calculated_quantity for this rate_sr_no from item_measurements table
      let totalCalculatedQuantity2 = 0;
      try {
        const measResp: any = await withTimeout(
          supabase
            .schema('estimate')
            .from('item_measurements')
            .select('calculated_quantity')
            .eq('rate_sr_no', rateSrNo),
          7000
        );

        const { data: measurementsForRate, error: measurementsError } = measResp || {};
        if (measurementsError) {
          console.error('Fetch measurements error:', measurementsError);
          throw new Error(`Failed to fetch measurements: ${measurementsError.message}`);
        }

        totalCalculatedQuantity2 = measurementsForRate?.reduce((sum, m) => sum + (m.calculated_quantity || 0), 0) || 0;
      } catch (err) {
        console.error('Measurements fetch timeout or error:', err);
        throw new Error('Failed to fetch measurements (timeout or network issue)');
      }

      const fetchedRate = rateData?.rate;
      const rateTotalAmount = totalCalculatedQuantity2 * fetchedRate;

      try {
        const updateResp: any = await withTimeout(
          supabase
            .schema('estimate')
            .from('item_rates')
            .update({
              ssr_quantity: totalCalculatedQuantity2,
              rate_total_amount: rateTotalAmount
            })
            .eq('sr_no', rateSrNo),
          7000
        );

        const { error: updateRateError } = updateResp || {};
        if (updateRateError) {
          console.error('Update rate error:', updateRateError);
          throw new Error(`Failed to update rate: ${updateRateError.message}`);
        }
      } catch (err) {
        console.error('Update rate timeout or error:', err);
        throw new Error('Failed to update rate (timeout or network issue)');
      }

      setShowEditModal(false);
      setSelectedMeasurement(null);
      setNewMeasurement({
        factor: 1,
        no_of_units: 0,
        length: 0,
        width_breadth: 0,
        height_depth: 0
      });
      setSelectedRate(0);

      // Fetch fresh data
      await fetchData();

      // Update item SSR quantity after a brief delay to ensure data is committed
      setTimeout(async () => {
        await updateItemSSRQuantity();
      }, 200);

      alert('Measurement updated successfully!');

    } catch (error) {
      console.error('Error updating measurement:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Failed to update measurement: ${errorMessage}`);
    }
  };

  const handleSaveItemOperations = async () => {
    if (!user) return;

    try {
      // Calculate total quantity from all measurements
      const totalQuantity = measurements.reduce((sum, m) => {
        const qty = m.is_deduction ? -m.calculated_quantity : m.calculated_quantity;
        return sum + qty;
      }, 0);

      // Calculate final quantity with operation
      const finalQty = calculateItemFinalQuantity(totalQuantity);

      // If operation is 'none', clear final_quantity and related fields
      const updateData = itemOperation.operation_type === 'none'
        ? {
          operation_type: null,
          operation_value: null,
          unit_conversion_factor: 1,
          final_unit: null,
          final_quantity: null
        }
        : {
          operation_type: itemOperation.operation_type,
          operation_value: itemOperation.operation_value,
          unit_conversion_factor: itemOperation.unit_conversion_factor || 1,
          final_unit: itemOperation.final_unit || null,
          final_quantity: finalQty
        };

      // Update subwork_items
      const { error } = await supabase
        .schema('estimate')
        .from('subwork_items')
        .update(updateData)
        .eq('sr_no', currentItem.sr_no);

      if (error) {
        console.error('Error updating subwork_items:', error);
        throw error;
      }

      // Update item_rates with the correct quantity
      const { data: rates, error: ratesError } = await supabase
        .schema('estimate')
        .from('item_rates')
        .select('sr_no, rate')
        .eq('subwork_item_sr_no', currentItem.sr_no);

      if (ratesError) {
        console.error('Error fetching rates:', ratesError);
        throw ratesError;
      }

      // Determine which quantity to use for rates
      const quantityForRates = itemOperation.operation_type === 'none' ? totalQuantity : finalQty;

      // Update each rate with new quantity and recalculated amount
      let totalItemAmount = 0;
      if (rates && rates.length > 0) {
        for (const rate of rates) {
          const rateAmount = rate.rate * quantityForRates;
          totalItemAmount += rateAmount;

          const { error: updateRateError } = await supabase
            .schema('estimate')
            .from('item_rates')
            .update({
              ssr_quantity: quantityForRates,
              rate_total_amount: rateAmount
            })
            .eq('sr_no', rate.sr_no);

          if (updateRateError) {
            console.error('Error updating rate:', updateRateError);
            throw updateRateError;
          }
        }

        // Update total_item_amount in subwork_items
        const { error: totalAmountError } = await supabase
          .schema('estimate')
          .from('subwork_items')
          .update({ total_item_amount: totalItemAmount })
          .eq('sr_no', currentItem.sr_no);

        if (totalAmountError) {
          console.error('Error updating total amount:', totalAmountError);
          throw totalAmountError;
        }
      }

      // Refresh data and notify parent
      await fetchData();

      if (onItemUpdated) {
        onItemUpdated(currentItem.sr_no);
      }

      alert('Final quantity calculation saved successfully!');
      onClose();
    } catch (error) {
      console.error('Error saving item operations:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to save final quantity calculation: ${errorMessage}`);
    }
  };

  const handleDeleteMeasurement = async (measurement: ItemMeasurement) => {
    if (!confirm('Are you sure you want to delete this measurement?')) {
      return;
    }

    try {
      const { error } = await supabase
        .schema('estimate')
        .from('item_measurements')
        .delete()
        .eq('subwork_item_id', measurement.subwork_item_id)
        .eq('measurement_sr_no', measurement.measurement_sr_no);

      if (error) throw error;

      fetchData();

      // Update SSR quantity after deletion
      setTimeout(async () => {
        await updateItemSSRQuantity();
      }, 100);
    } catch (error) {
      console.error('Error deleting measurement:', error);
    }
  };

  const handleAddLead = async () => {
    if (!newLead.material || !user) return;

    try {
      const netLeadCharges = (newLead.lead_charges || 0) - (newLead.initial_lead_charges || 0);

      const { error } = await supabase
        .schema('estimate')
        .from('item_leads')
        .insert([{
          ...newLead,
          subwork_item_id: currentItem.sr_no,
          net_lead_charges: netLeadCharges
        }]);

      if (error) throw error;

      setShowAddModal(false);
      setNewLead({
        material: '',
        lead_in_km: 0,
        lead_charges: 0,
        initial_lead_charges: 0
      });
      fetchData();
    } catch (error) {
      console.error('Error adding lead:', error);
    }
  };

  const handleAddMaterial = async () => {
    if (!newMaterial.material_name || !user) return;

    try {
      const totalCost = (newMaterial.required_quantity || 0) * (newMaterial.rate_per_unit || 0);

      const { error } = await supabase
        .schema('estimate')
        .from('item_materials')
        .insert([{
          ...newMaterial,
          subwork_item_id: currentItem.sr_no,
          total_material_cost: totalCost
        }]);

      if (error) throw error;

      setShowAddModal(false);
      setNewMaterial({
        material_name: '',
        required_quantity: 0,
        rate_per_unit: 0
      });
      fetchData();
    } catch (error) {
      console.error('Error adding material:', error);
    }
  };

  const getSelectedRateForMeasurement = (measurement: ItemMeasurement): number => {
    if (measurement.selected_rate_id) {
      const selectedRate = availableRates.find(rate => rate.sr_no === measurement.selected_rate_id);
      return selectedRate ? selectedRate.rate : item.ssr_rate;
    }
    return item.ssr_rate;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('hi-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount);
  };

  const totalMeasurementQuantity = measurements.reduce((sum, m) => {
    const qty = m.is_deduction ? -m.calculated_quantity : m.calculated_quantity;
    return sum + qty;
  }, 0);
  const totalMeasurementAmount = measurements.reduce((sum, m) => sum + m.line_amount, 0);
  const totalLeadCharges = leads.reduce((sum, l) => sum + l.net_lead_charges, 0);
  const totalMaterialCost = materials.reduce((sum, m) => sum + m.total_material_cost, 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-60">
      <div className="relative top-5 mx-auto p-5 border w-11/12 max-w-7xl shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                Item {item.item_number} - Detailed Analysis
              </h3>
              <p className="text-sm text-gray-500">{item.description_of_item}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Item Summary */}
          {/* <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-blue-900 mb-2">SSR Quantity:</label>
                {Object.entries(rateGroups).map(([rateKey, group]) => (
                  <div key={rateKey} className="mb-2">
                    <p className="text-sm font-semibold text-blue-800">
                      {group.quantity.toFixed(3)} {item.ssr_unit}
                    </p>
                    {group.description && (
                      <p className="text-xs text-blue-600">({group.description})</p>
                    )}
                  </div>
                ))}
                <p className="text-xs text-blue-600 mt-1">(Auto-calculated from measurements)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-blue-900 mb-2">SSR Rate:</label>
                {Object.entries(rateGroups).map(([rateKey, group]) => (
                  <div key={rateKey} className="mb-2">
                    <p className="text-sm font-semibold text-blue-800">
                      ₹{group.rate.toFixed(2)}
                    </p>
                    <p className="text-xs text-blue-600">/{item.ssr_unit}</p>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-blue-900 mb-2">SSR Amount:</label>
                {Object.entries(rateGroups).map(([rateKey, group]) => (
                  <div key={rateKey} className="mb-2">
                    <p className="text-sm font-semibold text-green-800">
                      ₹{(group.quantity * group.rate).toFixed(2)}
                    </p>
                    <p className="text-xs text-blue-600">
                      {group.quantity.toFixed(3)} × ₹{group.rate}
                    </p>
                  </div>
                ))}
              </div>

              <div>
                <span className="text-blue-700 font-medium">Category:</span>
                <p className="text-blue-900">{currentItem.category || 'N/A'}</p>
              </div>
            </div>
          </div> */}

          {/* Tabs */}
          <div className="border-b border-gray-200 mb-4">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('measurements')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'measurements'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                <Calculator className="w-4 h-4 inline mr-2" />
                Measurements ({measurements.length})
              </button>
              {/* <button
                onClick={() => setActiveTab('leads')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'leads'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                <Truck className="w-4 h-4 inline mr-2" />
                Lead Charges ({leads.length})
              </button>
              <button
                onClick={() => setActiveTab('materials')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'materials'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                <Package2 className="w-4 h-4 inline mr-2" />
                Materials ({materials.length})
              </button> */}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="max-h-96 overflow-y-auto">
            {/* Measurements Tab */}
            {activeTab === 'measurements' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-gray-600">
                    Total Quantity: {totalMeasurementQuantity.toFixed(3)} {currentItem.ssr_unit}
                    {/* |
                    Total Amount: {formatCurrency(totalMeasurementAmount)} */}
                  </div>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Measurement
                  </button>
                </div>

                {loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  </div>
                ) : measurements.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sr No</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Factor</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Units</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Length</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Width</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Height</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Quantity
                          </th>
                          {/* <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Amount
                          </th> */}
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {measurements.map((measurement) => (
                          <tr key={measurement.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-sm text-gray-900">{measurement.measurement_sr_no}</td>
                            <td className="px-3 py-2 text-sm text-gray-900">{measurement.description_of_items || '-'}</td>
                            <td className="px-3 py-2 text-sm text-gray-900">{measurement.factor || 1}</td>
                            <td className="px-3 py-2 text-sm text-gray-900">{measurement.no_of_units}</td>
                            <td className="px-3 py-2 text-sm text-gray-900">{measurement.length}</td>
                            <td className="px-3 py-2 text-sm text-gray-900">{measurement.width_breadth}</td>
                            <td className="px-3 py-2 text-sm text-gray-900">{measurement.height_depth}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm">
                              <div className="flex flex-col">
                                <span className={`font-medium ${measurement.is_deduction ? 'text-red-600' : 'text-gray-900'}`}>
                                  {measurement.is_deduction ? '-' : ''}{measurement.calculated_quantity.toFixed(3)} {measurement.unit || currentItem.ssr_unit}
                                </span>
                                {measurement.is_manual_quantity && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                    Manual
                                  </span>
                                )}
                                {measurement.is_deduction && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                    Deduction
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                              ₹{measurement.line_amount.toFixed(2)}
                            </td> */}
                            <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
                              <div className="flex items-center space-x-2">
                                {measurement.excel_url && (
                                  <a
                                    href={measurement.excel_url}
                                    download={measurement.excel_name || 'measurement.xlsx'}
                                    className="text-blue-600 hover:text-blue-900 p-1 rounded"
                                    title="Download Excel"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <Download className="w-4 h-4" />
                                  </a>
                                )}
                                <button
                                  onClick={() => handleEditMeasurement(measurement)}
                                  className="text-green-600 hover:text-green-900 p-1 rounded"
                                  title="Edit Measurement"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteMeasurement(measurement)}
                                  className="text-red-600 hover:text-red-900 p-1 rounded"
                                  title="Delete Measurement"
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
                    <Calculator className="mx-auto h-12 w-12 text-gray-300" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No measurements found</h3>
                    <p className="mt-1 text-sm text-gray-500">Add detailed measurements for this item.</p>
                  </div>
                )}

                {/* Final Quantity Calculation - Item Level */}
                {measurements.length > 0 && (
                  <div className="mt-6 border-t pt-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Final Quantity Calculation</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Apply operations to the total calculated quantity from all measurements
                    </p>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Apply Operation
                          </label>
                          <select
                            value={itemOperation.operation_type}
                            onChange={(e) => setItemOperation({ ...itemOperation, operation_type: e.target.value as any })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="none">None</option>
                            <option value="multiply">Multiply by</option>
                            <option value="divide">Divide by</option>
                            <option value="add">Add</option>
                            <option value="subtract">Subtract</option>
                          </select>
                        </div>

                        {itemOperation.operation_type !== 'none' && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Value
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              value={itemOperation.operation_value}
                              onChange={(e) => setItemOperation({ ...itemOperation, operation_value: parseFloat(e.target.value) || 0 })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                              placeholder="Enter value"
                            />
                          </div>
                        )}

                        {itemOperation.operation_type !== 'none' && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Unit Conversion (Divide by)
                            </label>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={itemOperation.unit_conversion_factor}
                              onChange={(e) => setItemOperation({ ...itemOperation, unit_conversion_factor: parseFloat(e.target.value) || 1 })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                              placeholder="e.g., 1000"
                            />
                            <p className="text-xs text-gray-500 mt-1">e.g., 1000 for KG to MT</p>
                          </div>
                        )}
                      </div>

                      {itemOperation.operation_type !== 'none' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Final Unit
                          </label>
                          <select
                            value={itemOperation.final_unit}
                            onChange={(e) => setItemOperation({ ...itemOperation, final_unit: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="">Select final unit</option>
                            <option value="CUM">CUM</option>
                            <option value="/BAG">/BAG</option>
                            <option value="MT">MT</option>
                            <option value="NOS">NOS</option>
                            <option value="SQM">SQM</option>
                            <option value="RMT">RMT</option>
                            <option value="/LITRE">/LITRE</option>
                            <option value="/SET">/SET</option>
                            <option value="KG">KG</option>
                            <option value="TONNE">TONNE</option>
                          </select>
                        </div>
                      )}

                      <div className="bg-white rounded-md p-4 space-y-2">
                        {(() => {
                          const totalQty = measurements.reduce((sum, m) => {
                            const qty = m.is_deduction ? -m.calculated_quantity : m.calculated_quantity;
                            return sum + qty;
                          }, 0);

                          // Get unit from measurements (use first measurement's unit or default to SSR unit)
                          const measurementUnit = measurements.length > 0 && measurements[0].unit
                            ? measurements[0].unit
                            : currentItem.ssr_unit;

                          // Calculate intermediate quantity (after operation, before conversion)
                          let intermediateQty = totalQty;
                          if (itemOperation.operation_type !== 'none') {
                            switch (itemOperation.operation_type) {
                              case 'multiply':
                                intermediateQty = totalQty * (itemOperation.operation_value || 0);
                                break;
                              case 'divide':
                                intermediateQty = (itemOperation.operation_value || 0) !== 0 ? totalQty / (itemOperation.operation_value || 0) : totalQty;
                                break;
                              case 'add':
                                intermediateQty = totalQty + (itemOperation.operation_value || 0);
                                break;
                              case 'subtract':
                                intermediateQty = totalQty - (itemOperation.operation_value || 0);
                                break;
                            }
                          }

                          const finalQty = calculateItemFinalQuantity(totalQty);

                          return (
                            <>
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600">Total from Measurements:</span>
                                <span className="text-sm font-medium text-gray-900">
                                  {totalQty.toFixed(3)} {measurementUnit}
                                </span>
                              </div>

                              {itemOperation.operation_type !== 'none' && (
                                <>
                                  <div className="flex justify-between items-center text-sm text-gray-600 border-t pt-2">
                                    <span>
                                      After {itemOperation.operation_type === 'multiply' ? 'multiply by' :
                                        itemOperation.operation_type === 'divide' ? 'divide by' :
                                          itemOperation.operation_type === 'add' ? 'add' : 'subtract'} {itemOperation.operation_value}:
                                    </span>
                                    <span className="font-medium text-gray-900">
                                      {intermediateQty.toFixed(3)}
                                    </span>
                                  </div>

                                  {itemOperation.unit_conversion_factor && itemOperation.unit_conversion_factor !== 1 && (
                                    <div className="flex justify-between items-center text-sm text-gray-600">
                                      <span>Unit conversion (÷{itemOperation.unit_conversion_factor}):</span>
                                      <span className="font-medium text-gray-900">
                                        {finalQty.toFixed(3)}
                                      </span>
                                    </div>
                                  )}

                                  <div className="flex justify-between items-center border-t pt-2">
                                    <span className="text-lg font-semibold text-blue-600">Final Quantity:</span>
                                    <span className="text-lg font-bold text-blue-900">
                                      {finalQty.toFixed(3)} {itemOperation.final_unit || measurementUnit}
                                    </span>
                                  </div>
                                </>
                              )}
                            </>
                          );
                        })()}
                      </div>

                      <button
                        onClick={handleSaveItemOperations}
                        className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                      >
                        Save Final Quantity Calculation
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Lead Charges Tab */}
            {activeTab === 'leads' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-gray-600">
                    Total Lead Charges: {formatCurrency(totalLeadCharges)}
                  </div>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Lead
                  </button>
                </div>

                {loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
                  </div>
                ) : leads.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sr No</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Quarry Location</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Lead (km)</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Lead Charges</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Initial Charges</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Net Charges</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {leads.map((lead) => (
                          <tr key={lead.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-sm text-gray-900">{lead.sr_no}</td>
                            <td className="px-3 py-2 text-sm text-gray-900">{lead.material}</td>
                            <td className="px-3 py-2 text-sm text-gray-900">{lead.location_of_quarry || '-'}</td>
                            <td className="px-3 py-2 text-sm text-gray-900">{lead.lead_in_km}</td>
                            <td className="px-3 py-2 text-sm text-gray-900">₹{lead.lead_charges.toFixed(2)}</td>
                            <td className="px-3 py-2 text-sm text-gray-900">₹{lead.initial_lead_charges.toFixed(2)}</td>
                            <td className="px-3 py-2 text-sm font-medium text-gray-900">
                              {formatCurrency(lead.net_lead_charges)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Truck className="mx-auto h-12 w-12 text-gray-300" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No lead charges found</h3>
                    <p className="mt-1 text-sm text-gray-500">Add lead charges for material transportation.</p>
                  </div>
                )}
              </div>
            )}

            {/* Materials Tab */}
            {activeTab === 'materials' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-gray-600">
                    Total Material Cost: {formatCurrency(totalMaterialCost)}
                  </div>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-purple-600 hover:bg-purple-700"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Material
                  </button>
                </div>

                {loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
                  </div>
                ) : materials.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Required Qty</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rate per Unit</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total Cost</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {materials.map((material) => (
                          <tr key={material.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-sm text-gray-900">{material.material_name}</td>
                            <td className="px-3 py-2 text-sm text-gray-900">{material.required_quantity}</td>
                            <td className="px-3 py-2 text-sm text-gray-900">{material.unit || '-'}</td>
                            <td className="px-3 py-2 text-sm text-gray-900">₹{material.rate_per_unit.toFixed(2)}</td>
                            <td className="px-3 py-2 text-sm font-medium text-gray-900">
                              {formatCurrency(material.total_material_cost)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Package2 className="mx-auto h-12 w-12 text-gray-300" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No materials found</h3>
                    <p className="mt-1 text-sm text-gray-500">Add materials required for this item.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Modals */}
      {showAddModal && activeTab === 'measurements' && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-70">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Add Measurement</h3>
                <div className="flex items-center space-x-2">
                  {measurements.length > 0 && (
                    <button
                      type="button"
                      onClick={copyLastMeasurement}
                      className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      title="Copy values from the last measurement"
                    >
                      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy Above
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowAddModal(false);
                      setIsReferencing(false);
                      setSelectedReferenceItem(null);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Header</label>
                  <input
                    type="text"
                    value={newMeasurement.header || ''}
                    onChange={(e) => setNewMeasurement({ ...newMeasurement, header: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter header (optional)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={newMeasurement.description_of_items || ''}
                    onChange={(e) => setNewMeasurement({ ...newMeasurement, description_of_items: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter description (optional)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unit
                  </label>
                  <select
                    value={newMeasurement.unit || ''}
                    onChange={(e) => setNewMeasurement({ ...newMeasurement, unit: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Unit</option>
                    <option value="CUM">CUM</option>
                    <option value="/BAG">/BAG</option>
                    <option value="MT">MT</option>
                    <option value="NOS">NOS</option>
                    <option value="SQM">SQM</option>
                    <option value="RMT">RMT</option>
                    <option value="/LITRE">/LITRE</option>
                    <option value="/SET">/SET</option>
                  </select>
                </div>

                {/* Rate Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Rate
                  </label>
                  <select
                    value={selectedDescription}
                    onChange={e => setSelectedDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Rate</option>
                    {rateDescriptions.map((desc, idx) => (
                      <option key={idx} value={desc}>
                        {desc.length > 100 ? desc.substring(0, 85) + '...' : desc}
                      </option>
                    ))}
                  </select>


                </div>

                {/* Reference Another Item */}
                {availableItems.length > 0 && (
                  <div className="border-t pt-4 space-y-3">
                    <div className="flex items-center">
                      <input
                        id="reference-item-checkbox"
                        type="checkbox"
                        checked={isReferencing}
                        onChange={(e) => handleReferencingToggle(e.target.checked)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="reference-item-checkbox" className="ml-2 block text-sm font-medium text-gray-900">
                        Reference quantity from another item
                      </label>
                    </div>
                    <p className="text-xs text-gray-500 ml-6">
                      Pull the final calculated quantity from an existing item in this subwork
                    </p>

                    {isReferencing && (
                      <div className="ml-6">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Select Item to Reference
                        </label>
                        <select
                          value={selectedReferenceItem || ''}
                          onChange={(e) => handleReferenceItemChange(Number(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Select an item</option>
                          {availableItems.map((item) => (
                            <option key={item.sr_no} value={item.sr_no}>
                              Item {item.item_number} - {item.description.substring(0, 60)}
                              {item.description.length > 60 ? '...' : ''} ({item.total_quantity.toFixed(3)} {item.unit})
                            </option>
                          ))}
                        </select>
                        {selectedReferenceItem && (
                          <div className="mt-2 p-2 bg-blue-50 rounded text-sm">
                            <p className="text-blue-800 font-medium">
                              Referenced Quantity: {availableItems.find(item => item.sr_no === selectedReferenceItem)?.total_quantity.toFixed(3)} {availableItems.find(item => item.sr_no === selectedReferenceItem)?.unit}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Dimensions */}
                {!isReferencing && (
                  <div className="grid grid-cols-5 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Factor</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={newMeasurement.factor || 1}
                        onChange={(e) => setNewMeasurement({ ...newMeasurement, factor: parseFloat(e.target.value) || 1 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">No of Units</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={newMeasurement.no_of_units || ''}
                        onChange={(e) => setNewMeasurement({ ...newMeasurement, no_of_units: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Length</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={newMeasurement.length || ''}
                        onChange={(e) => setNewMeasurement({ ...newMeasurement, length: e.target.value || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Width/Breadth</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={newMeasurement.width_breadth || ''}
                        onChange={(e) => setNewMeasurement({ ...newMeasurement, width_breadth: e.target.value || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Height/Depth</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={newMeasurement.height_depth || ''}
                        onChange={(e) => setNewMeasurement({ ...newMeasurement, height_depth: e.target.value || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                )}

                {!isReferencing && (
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <input
                        id="edit-manual-quantity"
                        type="checkbox"
                        checked={newMeasurement.is_manual_quantity || false}
                        onChange={(e) => setNewMeasurement({
                          ...newMeasurement,
                          is_manual_quantity: e.target.checked,
                          manual_quantity: e.target.checked ? (newMeasurement.manual_quantity || 0) : 0
                        })}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="edit-manual-quantity" className="ml-2 block text-sm text-gray-900">
                        Enter quantity manually (don't calculate from L×B×H)
                      </label>
                    </div>
                    <p className="text-xs text-gray-500 ml-6">
                      Check this if you want to enter a specific quantity instead of calculating from dimensions
                    </p>

                    {newMeasurement.is_manual_quantity && (
                      <div className="ml-6">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Manual Quantity
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={newMeasurement.manual_quantity || ''}
                          onChange={(e) => setNewMeasurement({
                            ...newMeasurement,
                            manual_quantity: parseFloat(e.target.value) || 0
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Enter manual quantity"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Excel Upload */}
                {!isReferencing && (
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <label className="block text-sm font-medium text-gray-700">
                        Or Upload Measurement Excel
                      </label>
                    </div>
                    <p className="text-xs text-gray-500">
                      Upload Excel with quantity calculations. File will be attached for reference.
                    </p>

                    <input
                      type="file"
                      id="measurement-excel-upload"
                      accept=".xlsx,.xls"
                      onChange={handleMeasurementExcelUpload}
                      className="hidden"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        document.getElementById('measurement-excel-upload')?.click()
                      }
                      disabled={uploadingExcel}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md
                 border border-blue-300 text-blue-700 bg-blue-50
                 hover:bg-blue-100 disabled:opacity-50"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {uploadingExcel ? 'Uploading...' : 'Upload Measurement Excel'}
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center">
                    <input
                      id="edit-deduction"
                      type="checkbox"
                      checked={newMeasurement.is_deduction || false}
                      onChange={(e) => setNewMeasurement({ ...newMeasurement, is_deduction: e.target.checked })}
                      className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                    />
                    <label htmlFor="edit-deduction" className="ml-2 block text-sm text-gray-900 text-red-700">
                      This is a deduction (subtract from total)
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 ml-6">
                    Check this for openings, voids, or other items that should be subtracted from the total quantity
                  </p>
                </div>

                {/* Preview */}
                <div className="bg-gray-50 p-4 rounded-md">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Calculated Quantity:</span>
                    <span className={`font-medium ${newMeasurement.is_deduction ? 'text-red-600' : 'text-gray-900'}`}>
                      {newMeasurement.is_deduction ? '-' : ''}{calculateQuantity().toFixed(3)} {newMeasurement.unit || currentItem.ssr_unit}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs mt-1 text-gray-500">
                    <span>Rate Used:</span>
                    <span>₹{getSelectedRate().toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setIsReferencing(false);
                    setSelectedReferenceItem(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddMeasurement}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  Add Measurement
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Lead Modal */}
      {showAddModal && activeTab === 'leads' && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-70">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Add Lead Charges</h3>
                <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Material *</label>
                  <input
                    type="text"
                    value={newLead.material || ''}
                    onChange={(e) => setNewLead({ ...newLead, material: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                    placeholder="Enter material name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location of Quarry</label>
                  <input
                    type="text"
                    value={newLead.location_of_quarry || ''}
                    onChange={(e) => setNewLead({ ...newLead, location_of_quarry: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                    placeholder="Enter quarry location"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Lead (km)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={newLead.lead_in_km || ''}
                      onChange={(e) => setNewLead({ ...newLead, lead_in_km: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Lead Charges (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newLead.lead_charges || ''}
                      onChange={(e) => setNewLead({ ...newLead, lead_charges: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Initial Charges (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newLead.initial_lead_charges || ''}
                      onChange={(e) => setNewLead({ ...newLead, initial_lead_charges: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                </div>

                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Net Lead Charges:</span>
                    <span className="font-medium text-gray-900">
                      ₹{((newLead.lead_charges || 0) - (newLead.initial_lead_charges || 0)).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddLead}
                  disabled={!newLead.material}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                >
                  Add Lead
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Material Modal */}
      {showAddModal && activeTab === 'materials' && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-70">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Add Material</h3>
                <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Material Name *</label>
                  <input
                    type="text"
                    value={newMaterial.material_name || ''}
                    onChange={(e) => setNewMaterial({ ...newMaterial, material_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                    placeholder="Enter material name"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Required Quantity</label>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={newMaterial.required_quantity || ''}
                      onChange={(e) => setNewMaterial({ ...newMaterial, required_quantity: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                    <input
                      type="text"
                      value={newMaterial.unit || ''}
                      onChange={(e) => setNewMaterial({ ...newMaterial, unit: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                      placeholder="e.g., kg, ton, nos"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rate per Unit (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newMaterial.rate_per_unit || ''}
                      onChange={(e) => setNewMaterial({ ...newMaterial, rate_per_unit: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                    />
                  </div>
                </div>

                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Total Material Cost:</span>
                    <span className="font-medium text-gray-900">
                      ₹{((newMaterial.required_quantity || 0) * (newMaterial.rate_per_unit || 0)).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddMaterial}
                  disabled={!newMaterial.material_name}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
                >
                  Add Material
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Measurement Modal */}
      {showEditModal && selectedMeasurement && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-70">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Edit Measurement</h3>
                <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Header
                  </label>
                  <input
                    type="text"
                    value={newMeasurement.header || ''}
                    onChange={(e) => setNewMeasurement({ ...newMeasurement, header: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter header (optional)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={newMeasurement.description_of_items || ''}
                    onChange={(e) => setNewMeasurement({ ...newMeasurement, description_of_items: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter description (optional)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unit
                  </label>
                  <select
                    value={newMeasurement.unit || ''}
                    onChange={(e) => setNewMeasurement({ ...newMeasurement, unit: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Unit</option>
                    <option value="CUM">CUM</option>
                    <option value="/BAG">/BAG</option>
                    <option value="MT">MT</option>
                    <option value="NOS">NOS</option>
                    <option value="SQM">SQM</option>
                    <option value="RMT">RMT</option>
                    <option value="/LITRE">/LITRE</option>
                    <option value="/SET">/SET</option>
                  </select>
                </div>

                {/* Rate Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Rate *
                  </label>
                  <select
                    value={selectedRate}
                    onChange={e => {
                      const rateIndex = parseInt(e.target.value, 10);
                      setSelectedRate(rateIndex);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value={0}>Select Rate</option>
                    {rateDescriptions.map((desc, index) => (
                      <option key={index + 1} value={index + 1}>
                        {desc.length > 100 ? desc.slice(0, 85) + '...' : desc}
                      </option>
                    ))}
                  </select>


                </div>

                {/* Dimensions */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Factor</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newMeasurement.factor || 1}
                      onChange={(e) => setNewMeasurement({ ...newMeasurement, factor: parseFloat(e.target.value) || 1 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">No of Units</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={newMeasurement.no_of_units || ''}
                      onChange={(e) => setNewMeasurement({ ...newMeasurement, no_of_units: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Length</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newMeasurement.length || ''}
                      onChange={(e) => setNewMeasurement({ ...newMeasurement, length: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Width/Breadth</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newMeasurement.width_breadth || ''}
                      onChange={(e) => setNewMeasurement({ ...newMeasurement, width_breadth: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Height/Depth</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newMeasurement.height_depth || ''}
                      onChange={(e) => setNewMeasurement({ ...newMeasurement, height_depth: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center">
                    <input
                      id="edit-manual-quantity"
                      type="checkbox"
                      checked={newMeasurement.is_manual_quantity || false}
                      onChange={(e) => setNewMeasurement({
                        ...newMeasurement,
                        is_manual_quantity: e.target.checked,
                        manual_quantity: e.target.checked ? (newMeasurement.manual_quantity || 0) : 0
                      })}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="edit-manual-quantity" className="ml-2 block text-sm text-gray-900">
                      Enter quantity manually (don't calculate from L×B×H)
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 ml-6">
                    Check this if you want to enter a specific quantity instead of calculating from dimensions
                  </p>

                  {newMeasurement.is_manual_quantity && (
                    <div className="ml-6">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Manual Quantity
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={newMeasurement.manual_quantity || ''}
                        onChange={(e) => setNewMeasurement({
                          ...newMeasurement,
                          manual_quantity: parseFloat(e.target.value) || 0
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter manual quantity"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center">
                    <input
                      id="edit-deduction"
                      type="checkbox"
                      checked={newMeasurement.is_deduction || false}
                      onChange={(e) => setNewMeasurement({ ...newMeasurement, is_deduction: e.target.checked })}
                      className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                    />
                    <label htmlFor="edit-deduction" className="ml-2 block text-sm text-gray-900 text-red-700">
                      This is a deduction (subtract from total)
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 ml-6">
                    Check this for openings, voids, or other items that should be subtracted from the total quantity
                  </p>
                </div>

                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Calculated Quantity:</span>
                    <span className="font-medium text-gray-900">
                      {calculateQuantity().toFixed(3)} {newMeasurement.unit || item.ssr_unit}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                    <span>Rate Used:</span>
                    <span>
                      ₹{getSelectedRate().toFixed(2)} per {newMeasurement.unit || item.ssr_unit}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateMeasurement}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  Update Measurement
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Design Photos Modal */}
      {showPhotosModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white max-h-[90vh] overflow-y-auto">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Design Photos</h3>
                <button
                  onClick={() => {
                    setShowPhotosModal(false);
                    setPhotoError('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {photoError && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
                  {photoError}
                </div>
              )}

              {/* Upload Section */}
              <div className="mb-6 p-4 border-2 border-dashed border-gray-300 rounded-lg">
                <div className="text-center">
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="mt-4">
                    <label htmlFor="photo-upload" className="cursor-pointer">
                      <span className="mt-2 block text-sm font-medium text-gray-900">
                        Upload Design Photos
                      </span>
                      <span className="mt-1 block text-xs text-gray-500">
                        PNG, JPG, GIF up to 5MB each. Maximum 5 photos.
                      </span>
                    </label>
                    <input
                      id="photo-upload"
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      disabled={uploadingPhoto || designPhotos.length >= 5}
                      className="hidden"
                    />
                    <button
                      onClick={() => document.getElementById('photo-upload')?.click()}
                      disabled={uploadingPhoto || designPhotos.length >= 5}
                      className="mt-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {uploadingPhoto ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Choose Photos
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Photos Grid */}
              {designPhotos.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {designPhotos.map((photo) => (
                    <div key={photo.id} className="relative group">
                      <div className="aspect-w-16 aspect-h-12 bg-gray-200 rounded-lg overflow-hidden">
                        <img
                          src={photo.photo_url}
                          alt={photo.photo_name}
                          className="w-full h-48 object-cover group-hover:opacity-75 transition-opacity"
                        />
                      </div>
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleDeletePhoto(photo.id, photo.photo_url)}
                          className="bg-red-600 text-white rounded-full p-1 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="mt-2">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {photo.photo_name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {(photo.file_size / 1024 / 1024).toFixed(2)} MB
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(photo.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <ImageIcon className="mx-auto h-12 w-12 text-gray-300" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No photos uploaded</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Upload design photos to document this work item.
                  </p>
                </div>
              )}

              <div className="flex justify-end mt-6">
                <button
                  onClick={() => {
                    setShowPhotosModal(false);
                    setPhotoError('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemMeasurements;