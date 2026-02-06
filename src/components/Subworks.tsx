import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useRefreshOnVisibility } from '../hooks/useRefreshOnVisibility'; // ✅ ADD
import { Work, SubWork } from '../types';
import LoadingSpinner from './common/LoadingSpinner';
import SubworkItems from './SubworkItems';
import LeadStatement from './LeadStatement';
import QuarryChart from './QuarryChart';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Eye,
  FileText,
  IndianRupee,
  Calculator,
  Camera,
  Upload,
  Image as ImageIcon,
  X
} from 'lucide-react';

const Subworks: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const location = useLocation();
  const [works, setWorks] = useState<Work[]>([]);
  const [subworks, setSubworks] = useState<SubWork[]>([]);
  const [selectedWorkId, setSelectedWorkId] = useState<string>('');
  const [selectedSubworkIds, setSelectedSubworkIds] = useState<string[]>([]);
  const [subworkItemCounts, setSubworkItemCounts] = useState<{ [key: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedSubwork, setSelectedSubwork] = useState<SubWork | null>(null);
  const totalEstimateSum = works.reduce(
    (acc, work) => acc + (work.total_estimated_cost || 0),
    0
  );
  const [newSubwork, setNewSubwork] = useState<Partial<SubWork>>({
    subworks_name: ''
  });
  const [showItemsModal, setShowItemsModal] = useState(false);
  const [currentSubworkForItems, setCurrentSubworkForItems] =
    useState<{ id: string; name: string } | null>(null);

  // Design photo states
  const [showDesignModal, setShowDesignModal] = useState(false);
  const [selectedSubworkForDesign, setSelectedSubworkForDesign] =
    useState<SubWork | null>(null);
  const [designPhotos, setDesignPhotos] = useState<any[]>([]);
  const [uploadingDesign, setUploadingDesign] = useState(false);

  // Subwork totals - separated by category
  const [subworkTotals, setSubworkTotals] = useState<Record<string, { regular: number; royalty: number; testing: number }>>({});

  const calculateOverallTotals = () => {
    let regularTotal = 0;
    let royaltyTotal = 0;
    let testingTotal = 0;

    Object.values(subworkTotals || {}).forEach(totals => {
      regularTotal += totals.regular || 0;
      royaltyTotal += totals.royalty || 0;
      testingTotal += totals.testing || 0;
    });

    return { regularTotal, royaltyTotal, testingTotal };
  };

  const { regularTotal: totalRegular, royaltyTotal: totalRoyalty, testingTotal: totalTesting } = calculateOverallTotals();
  const totalSubworkEstimate = totalRegular + totalRoyalty + totalTesting;

  // Lead / CSR / SSR
  const [showLeadChargesModal, setShowLeadChargesModal] = useState(false);
  const [showCSRModal, setShowCSRModal] = useState(false);
  const [leadChargesData, setLeadChargesData] = useState<any[]>([]);
  const [csrData, setCSRData] = useState<any[]>([]);
  const [loadingLeadCharges, setLoadingLeadCharges] = useState(false);
  const [loadingCSR, setLoadingCSR] = useState(false);
  const [showSSRModal, setShowSSRModal] = useState(false);
  const [ssrData, setSSRData] = useState<any[]>([]);
  const [loadingSSR, setLoadingSSR] = useState(false);

  // Lead statement
  const [showLeadStatementModal, setShowLeadStatementModal] = useState(false);
  const [selectedWorkForLeadStatement, setSelectedWorkForLeadStatement] =
    useState<{ id: string; name: string } | null>(null);

  // Quarry chart state
const [showQuarryChartModal, setShowQuarryChartModal] = useState(false);

  useEffect(() => {
    fetchWorks();
  }, [selectedWorkId]);

  // ✅ NEW: Refetch works when page becomes visible (background refresh)
  useRefreshOnVisibility(
    async () => {
      try {
        await supabase.auth.refreshSession();
      } catch (e) {
        console.warn('Session refresh failed on visibility (subworks):', e);
      }
      await fetchWorks(selectedWorkId, true);
    },
    [selectedWorkId]
  );

  useEffect(() => {
    if (location.state?.selectedWorksId) {
      setSelectedWorkId(location.state.selectedWorksId);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    if (selectedWorkId) {
      fetchSubworks(selectedWorkId);
    }
  }, [selectedWorkId]);

  useEffect(() => {
    if (selectedSubworkIds.length > 0) {
      fetchItemCounts();
      fetchSubworkTotals();
    }
  }, [selectedSubworkIds]);

  useEffect(() => {
    if (subworks.length > 0) {
      fetchSubworkTotals();
    }
  }, [subworks]);

  const fetchWorks = async (selectedId = '', background = false) => {
    try {
      if (!background) setLoading(true);

      const { data, error } = await supabase
        .schema('estimate')
        .from('works')
        .select('*')
        .order('sr_no', { ascending: false });

      if (error) throw error;

      setWorks(data || []);

      if (
        data &&
        data.length > 0 &&
        !selectedWorkId &&
        !location.state?.selectedWorksId
      ) {
        setSelectedWorkId(data[0].works_id);
      }
    } catch (error) {
      console.error('Error fetching works:', error);
    } finally {
      if (!background) setLoading(false);
    }
  };

  const fetchSubworks = async (workId: string) => {
    if (!workId) return;
    try {
      setLoading(true);

      const { data: subworksData, error: subworksError } = await supabase
        .schema('estimate')
        .from('subworks')
        .select('*')
        .eq('works_id', workId)
        .order('sr_no', { ascending: true });
      if (subworksError) throw subworksError;

      setSubworks(subworksData || []);

      const subworkIds = (subworksData || []).map(sw => sw.subworks_id);
      if (subworkIds.length > 0) {
        // Fetch item counts
        const { data: itemsData, error: itemsError } = await supabase
          .schema('estimate')
          .from('subwork_items')
          .select('subwork_id')
          .in('subwork_id', subworkIds);
        if (itemsError) throw itemsError;

        const counts: Record<string, number> = {};
        (itemsData || []).forEach(item => {
          const id = item.subwork_id;
          counts[id] = (counts[id] || 0) + 1;
        });

        setSubworkItemCounts(counts);

        // Fetch totals separately using the updated function
        await fetchSubworkTotals();
      } else {
        setSubworkTotals({});
        setSubworkItemCounts({});
      }
    } catch (error) {
      console.error('Error fetching subworks:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchItemCounts = async () => {
    try {
      const counts: { [key: string]: number } = {};

      for (const subworkId of selectedSubworkIds) {
        const { count, error } = await supabase
          .schema('estimate')
          .from('subwork_items')
          .select('*', { count: 'exact', head: true })
          .eq('subwork_id', subworkId);

        if (error) throw error;
        counts[subworkId] = count || 0;
      }

      setSubworkItemCounts(counts);
    } catch (error) {
      console.error('Error fetching item counts:', error);
    }
  };

  const fetchSubworkTotals = async () => {
    try {
      const totals: Record<string, { regular: number; royalty: number; testing: number }> = {};

      if (!subworks || subworks.length === 0) return;

      const subworkIds = subworks.map(sw => sw.subworks_id);
      const subworkSrNos = subworks.map(sw => sw.sr_no);

      // Create mapping between subworks_id and sr_no
      const subworkIdToSrNo: Record<string, number> = {};
      const subworkSrNoToId: Record<number, string> = {};
      subworks.forEach(sw => {
        subworkIdToSrNo[sw.subworks_id] = sw.sr_no;
        subworkSrNoToId[sw.sr_no] = sw.subworks_id;
      });

      const { data: subworkItems, error: itemsError } = await supabase
        .schema('estimate')
        .from('subwork_items')
        .select('sr_no, subwork_id, category')
        .in('subwork_id', subworkIds);

      if (itemsError) throw itemsError;

      if (!subworkItems || subworkItems.length === 0) {
        for (const subwork of subworks) {
          totals[subwork.subworks_id] = { regular: 0, royalty: 0, testing: 0 };

          await supabase
            .schema('estimate')
            .from('subworks')
            .update({ subwork_amount: 0 })
            .eq('subworks_id', subwork.subworks_id);
        }
        setSubworkTotals(totals);
        return;
      }

      const itemSrNos = subworkItems.map(i => i.sr_no);

      // Fetch all rates with descriptions for calculation
      const { data: rateRows, error: rateError } = await supabase
        .schema('estimate')
        .from('item_rates')
        .select('subwork_item_sr_no, rate, rate_total_amount, description')
        .in('subwork_item_sr_no', itemSrNos);

      if (rateError) throw rateError;

      // Fetch royalty measurements for all subworks (using sr_no)
      const { data: royaltyMeasurements, error: royaltyError } = await supabase
        .schema('estimate')
        .from('royalty_measurements')
        .select('subwork_id, hb_metal, murum, sand')
        .in('subwork_id', subworkSrNos);

      if (royaltyError) throw royaltyError;

      // Fetch testing measurements for all items
      const { data: testingMeasurements, error: testingError } = await supabase
        .schema('estimate')
        .from('testing_measurements')
        .select('subwork_item_id, required_tests')
        .in('subwork_item_id', itemSrNos);

      if (testingError) throw testingError;

      // Calculate royalty totals per subwork (convert sr_no to subworks_id)
      const royaltyTotalsPerSubwork: Record<string, { hb_metal: number; murum: number; sand: number }> = {};
      (royaltyMeasurements || []).forEach(measurement => {
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

      // Calculate testing totals per item
      const testingTotalsPerItem: Record<number, number> = {};
      (testingMeasurements || []).forEach(measurement => {
        testingTotalsPerItem[measurement.subwork_item_id] = Number(measurement.required_tests) || 0;
      });

      // Initialize totals for all subworks
      subworkIds.forEach(id => {
        totals[id] = { regular: 0, royalty: 0, testing: 0 };
      });

      // Calculate totals by category
      subworkItems.forEach(item => {
        const subworkId = item.subwork_id;
        const category = item.category;
        const itemRates = (rateRows || []).filter(r => r.subwork_item_sr_no === item.sr_no);

        if (!totals[subworkId]) {
          totals[subworkId] = { regular: 0, royalty: 0, testing: 0 };
        }

        let totalItemAmt = 0;

        if (category === 'royalty' && royaltyTotalsPerSubwork[subworkId]) {
          // Calculate royalty based on measurements
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
          totals[subworkId].royalty += totalItemAmt;
        } else if (category === 'testing' && testingTotalsPerItem[item.sr_no]) {
          // Calculate testing based on measurements
          const testingQty = testingTotalsPerItem[item.sr_no];
          itemRates.forEach(rate => {
            totalItemAmt += testingQty * Number(rate.rate || 0);
          });
          totals[subworkId].testing += totalItemAmt;
        } else {
          // For regular items, use stored rate_total_amount
          totalItemAmt = itemRates.reduce((sum, rate) => sum + (Number(rate.rate_total_amount) || 0), 0);
          totals[subworkId].regular += totalItemAmt;
        }
      });

      // Update subwork_amount with total of all categories
      for (const subworkId in totals) {
        const total = totals[subworkId].regular + totals[subworkId].royalty + totals[subworkId].testing;
        await supabase
          .schema('estimate')
          .from('subworks')
          .update({ subwork_amount: total })
          .eq('subworks_id', subworkId);
      }

      setSubworkTotals(totals);
    } catch (error) {
      console.error('Error fetching subwork totals:', error);
    }
  };

  const fetchDesignPhotos = async (subworkId: string) => {
    try {
      const { data, error } = await supabase
        .schema('estimate')
        .from('subwork_design_photos')
        .select('*')
        .eq('subwork_id', subworkId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDesignPhotos(data || []);
    } catch (error) {
      console.error('Error fetching design photos:', error);
    }
  };

  const fetchLeadCharges = async () => {
    try {
      setLoadingLeadCharges(true);

      const { data, error } = await supabase
        .schema('estimate')
        .from('Lead_Charges_Materials_22-23')
        .select('*');

      if (error) {
        console.error('Supabase Error:', error);
        throw error;
      }

      const sortedData = (data || []).sort((a, b) => {
        const aNum = parseInt(a['sr no']);
        const bNum = parseInt(b['sr no']);
        return aNum - bNum;
      });

      setLeadChargesData(sortedData);
    } catch (error) {
      console.error('Error fetching lead charges:', error);
      alert('Error loading Lead Charges data. Please check the console for details.');
    } finally {
      setLoadingLeadCharges(false);
    }
  };

  const fetchCSRData = async () => {
    try {
      setLoadingCSR(true);

      const { data, error } = await supabase
        .schema('estimate')
        .from('CSR-2022-2023')
        .select('*');

      if (error) {
        console.error('Supabase Error:', error);
        throw error;
      }

      const sortedData = (data || []).sort((a, b) => {
        const aNum = parseInt(a['Sr No']);
        const bNum = parseInt(b['Sr No']);
        return aNum - bNum;
      });

      setCSRData(sortedData);
    } catch (error) {
      console.error('Error fetching CSR data:', error);
      alert('Error loading CSR data. Please check the console for details.');
    } finally {
      setLoadingCSR(false);
    }
  };

  const fetchSSRData = async () => {
    try {
      setLoadingSSR(true);

      const { data, error } = await supabase
        .schema('estimate')
        .from('SSR_2022_23')
        .select('*');

      if (error) throw error;

      console.debug('SSR raw response:', {
        length: (data || []).length,
        sample: (data || []).slice(0, 3)
      });

      const mapped = (data || []).map((row: any) => {
        const keys = Object.keys(row || {});
        const findKey = (pred: (k: string) => boolean) =>
          keys.find(k => pred(k)) ?? undefined;

        const srKey =
          findKey(k =>
            k.replace(/\s|\.|\n|\r/gi, '').toLowerCase().includes('srno')
          ) || 'id';
        const chapterKey = findKey(k => k.toLowerCase().includes('chapter'));
        const ssrItemKey = findKey(k =>
          k.replace(/\s|\.|\n|\r/gi, '').toLowerCase().includes('ssritem')
        );
        const referenceKey = findKey(k =>
          k.toLowerCase().includes('reference')
        );
        const descriptionKey = findKey(k =>
          k.toLowerCase().includes('description')
        );
        const additionalKey = findKey(k =>
          k.toLowerCase().includes('additional')
        );
        const unitKey = findKey(k => k.toLowerCase().includes('unit'));
        const completedKey = findKey(
          k =>
            /completed|proposed/i.test(k.replace(/\s|\n|\r/gi, '')) ||
            k.toLowerCase().includes('completed')
        );
        const labourKey = findKey(k => k.toLowerCase().includes('labour'));

        return {
          id: row.id,
          sr_no: row[srKey] ?? row.id,
          chapter: chapterKey ? row[chapterKey] : null,
          ssr_item_no: ssrItemKey ? row[ssrItemKey] : null,
          reference_no: referenceKey ? row[referenceKey] : null,
          description: descriptionKey ? row[descriptionKey] : null,
          additional_specification: additionalKey ? row[additionalKey] : null,
          unit: unitKey ? row[unitKey] : null,
          completed_rate: completedKey ? row[completedKey] : null,
          labour_rate: labourKey ? row[labourKey] : null
        };
      });

      mapped.sort((a: any, b: any) => {
        const aNum = parseInt(
          String(a.sr_no || a.id || '0').replace(/[^0-9]/g, '') || '0',
          10
        );
        const bNum = parseInt(
          String(b.sr_no || b.id || '0').replace(/[^0-9]/g, '') || '0',
          10
        );
        return aNum - bNum;
      });

      if (!mapped || mapped.length === 0) {
        console.warn(
          'SSR fetch returned 0 rows. If the table has data in Supabase console, check RLS for estimate.SSR_2022_23.'
        );
      }

      setSSRData(mapped);
    } catch (error) {
      console.error('Error fetching SSR data:', error);
      alert('Error loading SSR 2022-23 data');
    } finally {
      setLoadingSSR(false);
    }
  };

  const handleOpenLeadCharges = () => {
    setShowLeadChargesModal(true);
    fetchLeadCharges();
  };

  const handleOpenCSR = () => {
    setShowCSRModal(true);
    fetchCSRData();
  };

  const handleOpenLeadStatement = () => {
    if (!selectedWorkId) {
      alert('Please select a work first.');
      return;
    }
    const selectedWork = works.find(w => w.works_id === selectedWorkId);
    if (selectedWork) {
      setSelectedWorkForLeadStatement({
        id: selectedWork.works_id,
        name: selectedWork.work_name
      });
      setShowLeadStatementModal(true);
    }
  };

  const handleDesignUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file || !selectedSubworkForDesign || !user) return;

    try {
      setUploadingDesign(true);

      const fileExt = file.name.split('.').pop();
      const fileName = `${selectedSubworkForDesign.subworks_id}_${Date.now()}.${fileExt}`;
      const filePath = `estimate-designs/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('estimate-designs')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl }
      } = supabase.storage.from('estimate-designs').getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .schema('estimate')
        .from('subwork_design_photos')
        .insert([
          {
            subwork_id: selectedSubworkForDesign.subworks_id,
            photo_url: publicUrl,
            photo_name: file.name,
            description: `Design/Diagram for ${selectedSubworkForDesign.subworks_name}`,
            uploaded_by: user.id
          }
        ]);

      if (dbError) throw dbError;

      fetchDesignPhotos(selectedSubworkForDesign.subworks_id);
    } catch (error) {
      console.error('Error uploading design photo:', error);
      alert('Error uploading design photo');
    } finally {
      setUploadingDesign(false);
    }
  };

  const handleDeleteDesignPhoto = async (photoId: string) => {
    if (!confirm('Are you sure you want to delete this design photo?')) return;

    try {
      const { error } = await supabase
        .schema('estimate')
        .from('subwork_design_photos')
        .delete()
        .eq('id', photoId);

      if (error) throw error;

      if (selectedSubworkForDesign) {
        fetchDesignPhotos(selectedSubworkForDesign.subworks_id);
      }
    } catch (error) {
      console.error('Error deleting design photo:', error);
      alert('Error deleting design photo');
    }
  };

  const handleViewDesigns = (subwork: SubWork) => {
    setSelectedSubworkForDesign(subwork);
    setShowDesignModal(true);
    fetchDesignPhotos(subwork.subworks_id);
  };

  const generateSubworkId = async (worksId: string): Promise<string> => {
    try {
      const { data, error } = await supabase
        .schema('estimate')
        .from('subworks')
        .select('subworks_id')
        .eq('works_id', worksId)
        .order('sr_no', { ascending: false })
        .limit(1);

      if (error) throw error;

      let nextNumber = 1;
      if (data && data.length > 0) {
        const lastSubworkId = data[0].subworks_id;
        const lastNumber = parseInt(lastSubworkId.split('-').pop() || '0');
        nextNumber = lastNumber + 1;
      }

      return `${worksId}-${nextNumber}`;
    } catch (error) {
      console.error('Error generating subwork ID:', error);
      return `${worksId}-1`;
    }
  };

  const handleAddSubwork = async () => {
    if (!newSubwork.subworks_name || !selectedWorkId || !user) return;

    try {
      const subworksId = await generateSubworkId(selectedWorkId);

      const { error } = await supabase
        .schema('estimate')
        .from('subworks')
        .insert([
          {
            works_id: selectedWorkId,
            subworks_id: subworksId,
            subworks_name: newSubwork.subworks_name,
            created_by: user.id
          }
        ]);

      if (error) throw error;

      setShowAddModal(false);
      setNewSubwork({ subworks_name: '' });
      fetchSubworks(selectedWorkId);
    } catch (error) {
      console.error('Error adding subwork:', error);
    }
  };

  const handleViewSubwork = (subwork: SubWork) => {
    setSelectedSubwork(subwork);
    setShowViewModal(true);
  };

  const handleEditSubwork = (subwork: SubWork) => {
    setSelectedSubwork(subwork);
    setNewSubwork({
      subworks_name: subwork.subworks_name
    });
    setShowEditModal(true);
  };

  const handleUpdateSubwork = async () => {
    if (!newSubwork.subworks_name || !selectedSubwork) return;

    try {
      const { error } = await supabase
        .schema('estimate')
        .from('subworks')
        .update({ subworks_name: newSubwork.subworks_name })
        .eq('sr_no', selectedSubwork.sr_no);

      if (error) throw error;

      setShowEditModal(false);
      setSelectedSubwork(null);
      setNewSubwork({ subworks_name: '' });
      fetchSubworks(selectedWorkId);
    } catch (error) {
      console.error('Error updating subwork:', error);
    }
  };

  const handleDeleteSubwork = async (subwork: SubWork) => {
    if (
      !confirm(
        'Are you sure you want to delete this subwork? This action cannot be undone.'
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase
        .schema('estimate')
        .from('subworks')
        .delete()
        .eq('sr_no', subwork.sr_no);

      if (error) throw error;
      fetchSubworks(selectedWorkId);
    } catch (error) {
      console.error('Error deleting subwork:', error);
    }
  };

  useEffect(() => {
  // Reset selections when work changes
  setSelectedSubworkIds([]);
  setSubworkItemCounts({});
  setCurrentSubworkForItems(null);
}, [selectedWorkId]);


  const handleSubworkCheckbox = (subworkId: string) => {
    setSelectedSubworkIds(prev => {
      if (prev.includes(subworkId)) {
        return prev.filter(id => id !== subworkId);
      } else {
        return [...prev, subworkId];
      }
    });
  };

 const handleViewItems = () => {
  const validSelections = selectedSubworkIds.filter(id =>
    subworks.some(sw => sw.subworks_id === id)
  );

  if (validSelections.length === 0) {
    alert('Please select at least one subwork to view items');
    return;
  }

  const firstSelected = subworks.find(
    sw => sw.subworks_id === validSelections[0]
  );

  if (firstSelected) {
    setCurrentSubworkForItems({
      id: firstSelected.subworks_id,
      name: firstSelected.subworks_name
    });
  }

  setShowItemsModal(true);
};

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('hi-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  const getTotalItemsCount = () => {
    return selectedSubworkIds.reduce((total, subworkId) => {
      return total + (subworkItemCounts[subworkId] || 0);
    }, 0);
  };

  const selectedWork = works.find(work => work.works_id === selectedWorkId);

  const filteredSubworks = subworks.filter(
    subwork =>
      subwork.subworks_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      subwork.subworks_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Quarry chart UI helpers

  const resetQuarryGrid = (rows: number, cols: number) => {
    setQuarryRows(rows);
    setQuarryCols(cols);
    setQuarryGrid(
      Array.from({ length: rows }, () => Array(cols).fill(' '))
    );
  };

  const handleQuarryCellClick = (r: number, c: number) => {
    setQuarryGrid(prev => {
      const next = prev.map(row => [...row]);

      if (quarrySelectedTool === 'line-h') {
        next[r] = next[r].map((ch, idx) =>
          idx >= Math.max(0, c - 3) && idx <= Math.min(quarryCols - 1, c + 3)
            ? '─'
            : ch
        );
      } else if (quarrySelectedTool === 'line-v') {
        for (
          let i = Math.max(0, r - 3);
          i <= Math.min(quarryRows - 1, r + 3);
          i++
        ) {
          next[i][c] = '│';
        }
      } else if (quarrySelectedTool === 'node') {
        next[r][c] = quarryChar || '●';
      } else if (quarrySelectedTool === 'text') {
        if (!quarryCurrentLabel) return prev;
        const chars = quarryCurrentLabel.split('');
        chars.forEach((ch, idx) => {
          const col = c + idx;
          if (col < quarryCols) {
            next[r][col] = ch;
          }
        });
      }

      return next;
    });
  };

  const handleOpenQuarryChart = () => {
    setShowQuarryChartModal(true);
  };

  if (loading) {
    return <LoadingSpinner text={t('common.loading')} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('subworks.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage detailed sub-work items and their estimates
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Work Selection */}
            <div className="sm:w-48">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Select Work ID
              </label>
              <select
                value={selectedWorkId}
                onChange={e => setSelectedWorkId(e.target.value)}
                className="block w-full pl-2 pr-6 py-1.5 text-xs border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md"
              >
                <option value="">Select Work ID...</option>
                {works.map(work => (
                  <option key={work.works_id} value={work.works_id}>
                    {work.works_id}
                  </option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div className="sm:w-56 relative">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Search Sub Works
              </label>
              <div
                className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none"
                style={{ top: '20px' }}
              >
                <Search className="h-3 w-3 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search sub works..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="block w-full pl-6 pr-2 py-1.5 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Selected Work Info */}
      {selectedWork && (
        <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-indigo-100 rounded-2xl border border-indigo-200 p-4 shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-semibold text-indigo-900">
                {selectedWork.works_id} - {selectedWork.work_name}
              </h3>
              <p className="text-sm text-indigo-700 mt-1">
                Division: {selectedWork.division || 'N/A'}
              </p>
              <div className="mt-2 space-y-1">
                <div className="flex items-center text-sm text-indigo-900 font-semibold">
                  <IndianRupee className="w-3 h-3 mr-1" />
                  <span>
                    Total Estimate: {formatCurrency(totalRegular)}
                  </span>
                </div>
                {totalRoyalty > 0 && (
                  <div className="flex items-center text-xs text-amber-700 ml-4">
                    <span>Royalty: {formatCurrency(totalRoyalty)}</span>
                  </div>
                )}
                {totalTesting > 0 && (
                  <div className="flex items-center text-xs text-purple-700 ml-4">
                    <span>Testing: {formatCurrency(totalTesting)}</span>
                  </div>
                )}
              </div>
            </div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-indigo-500 to-blue-600 text-white shadow-lg">
              {selectedWork.status}
            </span>
          </div>
        </div>
      )}

      {/* Main Content */}
      {selectedWorkId ? (
        <div className="space-y-4">
          {/* Toolbar outside Sub Works card */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Schedules square */}
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-500 to-teal-600 shadow-sm px-4 py-3 flex flex-wrap gap-2 items-center">
              <span className="text-xs font-semibold text-white mr-2">
                Schedules
              </span>
              <button
                onClick={handleOpenCSR}
                className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-100 transition"
              >
                <FileText className="w-3 h-3 mr-1" />
                CSR 22-23
              </button>
              <button
                onClick={() => {
                  setShowSSRModal(true);
                  fetchSSRData();
                }}
                className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-100 transition"
              >
                <FileText className="w-3 h-3 mr-1" />
                SSR 22-23
              </button>
            </div>

            {/* Leads + Quarry */}
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-500 to-teal-600 shadow-sm px-4 py-3 flex flex-wrap gap-2 items-center">
              <span className="text-xs font-semibold text-white mr-2">
                Leads
              </span>
              <button
                onClick={handleOpenLeadCharges}
                className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-100 transition"
              >
                <FileText className="w-3 h-3 mr-1" />
                Lead Charges
              </button>
              <button
                onClick={handleOpenLeadStatement}
                disabled={!selectedWorkId}
                className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-100 transition disabled:opacity-50"
              >
                <FileText className="w-3 h-3 mr-1" />
                Lead Statement
              </button>
              <button
                onClick={handleOpenQuarryChart}
                className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-100 transition"
              >
                <FileText className="w-3 h-3 mr-1" />
                Quarry Chart
              </button>
            </div>
          </div>

          {/* Sub Works card */}
          <div className="bg-gradient-to-br from-white to-slate-50 shadow-xl rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-emerald-500 to-teal-600">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="p-2 bg-white/20 rounded-lg mr-3">
                    <Calculator className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">
                    Sub Works
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAddModal(true)}
                    disabled={!selectedWorkId}
                    className="inline-flex items-center px-4 py-1.5 rounded-full text-xs font-semibold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-100 shadow-sm disabled:opacity-50"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Sub Work
                  </button>
                  <button
                    onClick={handleViewItems}
                    disabled={selectedSubworkIds.length === 0}
                    className="inline-flex items-center px-4 py-1.5 rounded-full text-xs font-semibold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-100 shadow-sm disabled:opacity-50"
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    View Items (
                    {selectedSubworkIds.length > 0
                      ? `${getTotalItemsCount()} items`
                      : '0 items'}
                    )
                  </button>
                </div>
              </div>
            </div>

            {filteredSubworks.length > 0 ? (
              <div className="divide-y divide-gray-200">
                {filteredSubworks.map(subwork => (
                  <div
                    key={subwork.sr_no}
                    onClick={() =>
                      handleSubworkCheckbox(subwork.subworks_id)
                    }
                    className={`p-4 hover:bg-gradient-to-r hover:from-emerald-50 hover:to-teal-50 transition-all duration-200 cursor-pointer ${
                      selectedSubworkIds.includes(subwork.subworks_id)
                        ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-l-4 border-emerald-500'
                        : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <div
                            className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                              selectedSubworkIds.includes(
                                subwork.subworks_id
                              )
                                ? 'bg-gradient-to-br from-emerald-500 to-teal-600 border-emerald-600'
                                : 'border-gray-300'
                            }`}
                          >
                            {selectedSubworkIds.includes(
                              subwork.subworks_id
                            ) && (
                              <svg
                                className="w-3 h-3 text-white"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </div>
                          <span className="text-sm font-medium text-gray-900">
                            {subwork.subworks_id}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                          {subwork.subworks_name}
                        </p>
                        <div className="mt-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">
                              Items:{' '}
                              {subworkItemCounts[subwork.subworks_id] || 0}
                            </span>
                            <span className="text-sm font-semibold text-green-600">
                              {formatCurrency(
                                subworkTotals[subwork.subworks_id]?.regular || 0
                              )}
                            </span>
                          </div>
                          {subworkTotals[subwork.subworks_id]?.royalty > 0 && (
                            <div className="flex justify-end mt-0.5">
                              <span className="text-xs text-amber-600">
                                Royalty: {formatCurrency(subworkTotals[subwork.subworks_id].royalty)}
                              </span>
                            </div>
                          )}
                          {subworkTotals[subwork.subworks_id]?.testing > 0 && (
                            <div className="flex justify-end mt-0.5">
                              <span className="text-xs text-purple-600">
                                Testing: {formatCurrency(subworkTotals[subwork.subworks_id].testing)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setCurrentSubworkForItems({
                              id: subwork.subworks_id,
                              name: subwork.subworks_name
                            });
                            setShowItemsModal(true);
                          }}
                          className="text-green-600 hover:text-green-900 p-2 rounded-lg hover:bg-green-100 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-green-300"
                          title="Add Items"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleViewDesigns(subwork);
                          }}
                          className="text-purple-600 hover:text-purple-900 p-2 rounded-lg hover:bg-purple-100 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-300"
                          title="Design/Diagrams"
                        >
                          <Camera className="w-4 h-4" />
                        </button>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleViewSubwork(subwork);
                          }}
                          className="text-blue-600 hover:text-blue-900 p-2 rounded-lg hover:bg-blue-100 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
                          title="View Subwork"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleEditSubwork(subwork);
                          }}
                          className="text-emerald-600 hover:text-emerald-900 p-2 rounded-lg hover:bg-emerald-100 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                          title="Edit Subwork"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleDeleteSubwork(subwork);
                          }}
                          className="text-red-600 hover:text-red-900 p-2 rounded-lg hover:bg-red-100 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-300"
                          title="Delete Subwork"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="mx-auto w-20 h-20 bg-gradient-to-br from-emerald-100 to-teal-200 rounded-2xl flex items-center justify-center mb-4">
                  <Calculator className="h-10 w-10 text-emerald-600" />
                </div>
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  No sub works found
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Add sub work items to break down the estimate.
                </p>
                <div className="mt-6">
                  <button
                    onClick={() => setShowAddModal(true)}
                    disabled={!selectedWorkId}
                    className="inline-flex items-center px-6 py-3 border border-transparent shadow-lg text-sm font-semibold rounded-2xl text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-emerald-300 transition-all duration-300"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Sub Work
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="mx-auto w-20 h-20 bg-gradient-to-br from-gray-200 to-gray-300 rounded-2xl flex items-center justify-center mb-4">
            <FileText className="h-10 w-10 text-gray-500" />
          </div>
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            Select a work to view sub works
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Choose a main work item to manage its detailed sub work breakdown.
          </p>
        </div>
      )}

      {/* Subwork Items Component */}
      {showItemsModal && currentSubworkForItems && (
        <SubworkItems
          subworkId={currentSubworkForItems.id}
          subworkName={currentSubworkForItems.name}
          isOpen={showItemsModal}
          onClose={() => setShowItemsModal(false)}
        />
      )}

      {/* Design Photos Modal */}
      {showDesignModal && selectedSubworkForDesign && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Design/Diagrams - {selectedSubworkForDesign.subworks_name}
                </h3>
                <button
                  onClick={() => {
                    setShowDesignModal(false);
                    setSelectedSubworkForDesign(null);
                    setDesignPhotos([]);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  ✕
                </button>
              </div>

              {/* Upload Section */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <div className="text-center">
                  <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600 mb-3">
                    Upload design drawings, diagrams, or photos
                  </p>
                  <label className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 cursor-pointer">
                    {uploadingDesign ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Camera className="w-4 h-4 mr-2" />
                        Choose File
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*,.pdf,.dwg,.dxf"
                      onChange={handleDesignUpload}
                      disabled={uploadingDesign}
                      className="hidden"
                    />
                  </label>
                  <p className="text-xs text-gray-500 mt-2">
                    Supports: Images, PDF, DWG, DXF files
                  </p>
                </div>
              </div>

              {/* Photos Grid */}
              {designPhotos.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {designPhotos.map(photo => (
                    <div
                      key={photo.id}
                      className="relative bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="aspect-w-16 aspect-h-12 bg-gray-100">
                        {photo.photo_url.toLowerCase().includes('.pdf') ? (
                          <div className="flex items-center justify-center h-48">
                            <FileText className="h-12 w-12 text-red-500" />
                            <span className="ml-2 text-sm text-gray-600">
                              PDF Document
                            </span>
                          </div>
                        ) : (
                          <img
                            src={photo.photo_url}
                            alt={photo.photo_name}
                            className="w-full h-48 object-cover"
                          />
                        )}
                      </div>
                      <div className="p-3">
                        <h4 className="text-sm font-medium text-gray-900 truncate">
                          {photo.photo_name}
                        </h4>
                        {photo.description && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                            {photo.description}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-2">
                          {new Date(photo.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="absolute top-2 right-2 flex space-x-1">
                        <a
                          href={photo.photo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 bg-white bg-opacity-80 rounded-full hover:bg-opacity-100 transition-all"
                          title="View Full Size"
                        >
                          <Eye className="w-4 h-4 text-gray-600" />
                        </a>
                        <button
                          onClick={() => handleDeleteDesignPhoto(photo.id)}
                          className="p-1 bg-white bg-opacity-80 rounded-full hover:bg-opacity-100 transition-all"
                          title="Delete Photo"
                        >
                          <X className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <ImageIcon className="mx-auto h-12 w-12 text-gray-300" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">
                    No designs uploaded
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Upload design drawings, diagrams, or photos for this
                    subwork.
                  </p>
                </div>
              )}

              <div className="flex justify-end mt-6">
                <button
                  onClick={() => {
                    setShowDesignModal(false);
                    setSelectedSubworkForDesign(null);
                    setDesignPhotos([]);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Subwork Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Add New Sub Work
                </h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Works ID
                  </label>
                  <input
                    type="text"
                    value={selectedWorkId}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sub Works Name *
                  </label>
                  <input
                    type="text"
                    value={newSubwork.subworks_name || ''}
                    onChange={e =>
                      setNewSubwork({
                        ...newSubwork,
                        subworks_name: e.target.value
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter sub work name"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddSubwork}
                  disabled={!newSubwork.subworks_name}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Sub Work
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Subwork Modal */}
      {showViewModal && selectedSubwork && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  View Sub Work Details
                </h3>
                <button
                  onClick={() => setShowViewModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sr No
                  </label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                    {selectedSubwork.sr_no}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Works ID
                  </label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                    {selectedSubwork.works_id}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sub Works ID
                  </label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                    {selectedSubwork.subworks_id}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sub Works Name
                  </label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                    {selectedSubwork.subworks_name}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Created Date
                  </label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                    {new Date(
                      selectedSubwork.created_at
                    ).toLocaleDateString('en-IN')}
                  </p>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowViewModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Subwork Modal */}
      {showEditModal && selectedSubwork && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Edit Sub Work
                </h3>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Works ID
                  </label>
                  <input
                    type="text"
                    value={selectedSubwork.works_id}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sub Works ID
                  </label>
                  <input
                    type="text"
                    value={selectedSubwork.subworks_id}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sub Works Name *
                  </label>
                  <input
                    type="text"
                    value={newSubwork.subworks_name || ''}
                    onChange={e =>
                      setNewSubwork({
                        ...newSubwork,
                        subworks_name: e.target.value
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter sub work name"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateSubwork}
                  disabled={!newSubwork.subworks_name}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Update Sub Work
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lead Charges Modal */}
      {showLeadChargesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
          <div className="relative w-full max-w-7xl bg-white rounded-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">
                  Lead Charges &amp; Materials (2022-2023)
                </h2>
                <button
                  onClick={() => setShowLeadChargesModal(false)}
                  className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-2 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="px-6 py-6">
              {loadingLeadCharges ? (
                <div className="flex justify-center items-center py-12">
                  <LoadingSpinner />
                </div>
              ) : leadChargesData.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 border border-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r">
                          Sr No
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r">
                          Lead in KM
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r">
                          Cost per Trip
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r">
                          Murrum, Building Rubish, Earth
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r">
                          Manure Sludge
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r">
                          Excavated Rock
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r">
                          Sand, Stone
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r">
                          Stone Aggregate 40mm+
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r">
                          KM
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r">
                          Cost per Trip 2
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r">
                          ConcreteBlock
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r">
                          Cement, Lime, Stone Block
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r">
                          Bricks
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r">
                          Tiles
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r">
                          Steel
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r">
                          Flooring Tiles
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                          Asphalt in Drum
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {leadChargesData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900 border-r">
                            {row['sr no']}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 border-r">
                            {row['Lead in KM']}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 border-r">
                            {row['Cost per Trip Lead Charges']}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 border-r">
                            {row['Murrum, Building Rubish, Earth']}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 border-r">
                            {row['Manure  Sludge']}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 border-r">
                            {row['Excavated Rock soling stone']}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 border-r">
                            {
                              row[
                                'Sand, Stone below 40 mm, Normal Brick sider aggre. Timber'
                              ]
                            }
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 border-r">
                            {
                              row[
                                'Stone aggregate 40mm Normal size and above'
                              ]
                            }
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 border-r">
                            {row['KM']}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 border-r">
                            {row['Cost per Trip Lead Charges_1']}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 border-r">
                            {row['ConcreteBlock (FORM)']}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 border-r">
                            {
                              row[
                                'Cement, Lime, Stone Block, GI, CI, CC & AC Pipes / Sheet& Plate'
                              ]
                            }
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 border-r">
                            {row['Bricks']}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 border-r">
                            {
                              row[
                                'Tiles Half Round Tiles /Roofing Tiles/Manlore Tiles'
                              ]
                            }
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 border-r">
                            {
                              row[
                                'Steel (MS, TMT, H.Y.S.D.) Structural Steel'
                              ]
                            }
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 border-r">
                            {row['Flooring Tiles Ceramic/ Marbonate']}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {row['Asphalt in Drum']}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  No lead charges data available
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => setShowLeadChargesModal(false)}
                className="px-6 py-2.5 bg-gray-600 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSR Modal */}
      {showCSRModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
          <div className="relative w-full max-w-6xl bg-white rounded-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">
                  CSR 2022-2023
                </h2>
                <button
                  onClick={() => setShowCSRModal(false)}
                  className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-2 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="px-6 py-6">
              {loadingCSR ? (
                <div className="flex justify-center items-center py-12">
                  <LoadingSpinner />
                </div>
              ) : csrData.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 border border-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r">
                          Sr No
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r">
                          Item No
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r">
                          Item
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r">
                          Unit
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r">
                          Completed Item
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r">
                          Labour
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider border-r">
                          Page No
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                          Reference
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {csrData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900 border-r">
                            {row['Sr No']}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 border-r">
                            {row['Item No']}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 border-r">
                            {row['Item']}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 border-r">
                            {row['Unit']}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 border-r">
                            {row['Completed Item']}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 border-r">
                            {row['Labour']}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 border-r">
                            {row['Page No']}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {row['Reference']}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  No CSR data available
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => setShowCSRModal(false)}
                className="px-6 py-2.5 bg-gray-600 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SSR Modal */}
      {showSSRModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
          <div className="relative w-full max-w-7xl bg-white rounded-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">
                  SSR 2022-2023
                </h2>
                <button
                  onClick={() => setShowSSRModal(false)}
                  className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="px-6 py-6">
              {loadingSSR ? (
                <div className="flex justify-center py-12">
                  <LoadingSpinner />
                </div>
              ) : ssrData.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 border border-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-xs font-medium border-r">
                          Sr No
                        </th>
                        <th className="px-3 py-2 text-xs font-medium border-r">
                          Chapter
                        </th>
                        <th className="px-3 py-2 text-xs font-medium border-r">
                          SSR Item No
                        </th>
                        <th className="px-3 py-2 text-xs font-medium border-r">
                          Reference No
                        </th>
                        <th className="px-3 py-2 text-xs font-medium border-r">
                          Description
                        </th>
                        <th className="px-3 py-2 text-xs font-medium border-r">
                          Additional Spec
                        </th>
                        <th className="px-3 py-2 text-xs font-medium border-r">
                          Unit
                        </th>
                        <th className="px-3 py-2 text-xs font-medium border-r">
                          Completed Rate
                        </th>
                        <th className="px-3 py-2 text-xs font-medium">
                          Labour Rate
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {ssrData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-sm border-r">
                            {row.sr_no}
                          </td>
                          <td className="px-3 py-2 text-sm border-r">
                            {row.chapter}
                          </td>
                          <td className="px-3 py-2 text-sm border-r">
                            {row.ssr_item_no}
                          </td>
                          <td className="px-3 py-2 text-sm border-r">
                            {row.reference_no}
                          </td>
                          <td className="px-3 py-2 text-sm border-r">
                            {row.description}
                          </td>
                          <td className="px-3 py-2 text-sm border-r">
                            {row.additional_specification}
                          </td>
                          <td className="px-3 py-2 text-sm border-r">
                            {row.unit}
                          </td>
                          <td className="px-3 py-2 text-sm border-r">
                            {row.completed_rate}
                          </td>
                          <td className="px-3 py-2 text-sm">
                            {row.labour_rate}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  No SSR data available
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => setShowSSRModal(false)}
                className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

          {/* Lead Statement Modal */}
      {showLeadStatementModal && selectedWorkForLeadStatement && (
        <LeadStatement
          worksId={selectedWorkForLeadStatement.id}
          workName={selectedWorkForLeadStatement.name}
          isOpen={showLeadStatementModal}
          onClose={() => {
            setShowLeadStatementModal(false);
            setSelectedWorkForLeadStatement(null);
          }}
        />
      )}

      {/* Quarry Chart Modal */}
      <QuarryChart
        isOpen={showQuarryChartModal}
        onClose={() => setShowQuarryChartModal(false)}
        worksId={selectedWorkId}
      />
    </div>
  );
};

export default Subworks;

