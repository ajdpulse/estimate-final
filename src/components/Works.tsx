import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import LoadingSpinner from './common/LoadingSpinner';
import { Work, RecapCalculations, TaxEntry } from '../types';
import WorksRecapSheet from './WorksRecapSheet';
import EstimateApprovalActions from './EstimateApprovalActions';
import WorkAssignments from './WorkAssignments';
import { useRefreshOnVisibility } from '../hooks/useRefreshOnVisibility'; // ✅ ADD
import { Plus, Search, Filter, CreditCard as Edit2, Trash2, Eye, FileText, IndianRupee, Calendar, Building } from 'lucide-react';

const Works: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'management' | 'assignments'>('management');
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedWork, setSelectedWork] = useState<Work | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [unitInputs, setUnitInputs] = useState<{ [subworkId: string]: number }>({});
  const [selectedWorkForPdf, setSelectedWorkForPdf] = useState<Work | null>(null);
  const [savedCalculations, setSavedCalculations] = useState<{ [workId: string]: { calculations: RecapCalculations; taxes: TaxEntry[] } }>({});
  const [newWork, setNewWork] = useState<Partial<Work>>({
    type: 'Technical Sanction',
    division: 'Z.P.(Works) Division, Chandrapur'
  });

  useEffect(() => {
    fetchWorks();
  }, []);

  // ✅ NEW: Refetch works when page becomes visible (background refresh - no loading spinner)
  useRefreshOnVisibility(
    () => fetchWorks(typeFilter, true),
    [typeFilter]
  );

  const handleUnitChange = (subworkId: string, value: string) => {
    const num = parseFloat(value) || 0;
    setUnitInputs(prev => ({ ...prev, [subworkId]: num }));
    setSaved(false);
  };

  // ✅ background flag: if true, don't show loading spinner (for visibility-triggered refreshes)
  const fetchWorks = async (filterType = 'all', background = false) => {
  try {
    if (!background) setLoading(true);

    // Base query
    let query = supabase
      .schema('estimate')
      .from('works')
      .select('*')
      .order('sr_no', { ascending: false });

    // Apply filter condition dynamically
    if (filterType !== 'all') {
      query = query.eq('type', filterType);
    }

    const { data, error } = await query;
    if (error) throw error;

    setWorks(data || []);
  } catch (error) {
    console.error('Error fetching works:', error);
  } finally {
    if (!background) setLoading(false);
  }
};

const handleAddWork = async () => {
  if (!newWork.work_name || !user) return;

  try {
    const { data: insertedWork, error: workError } = await supabase
      .schema('estimate')
      .from('works')
      .insert([{
        ...newWork,
        created_by: user.id
      }])
      .select()
      .single();

    if (workError) throw workError;

    if (insertedWork?.works_id) {
      const { data: userRole } = await supabase
        .schema('public')
        .from('user_roles')
        .select('role_id, roles!inner(application)')
        .eq('user_id', user.id)
        .in('roles.application', ['estimate', 'mb', 'estimate,mb'])
        .maybeSingle();

      if (userRole?.role_id) {
        await supabase
          .schema('estimate')
          .from('work_assignments')
          .insert([{
            work_id: insertedWork.works_id,
            user_id: user.id,
            role_id: userRole.role_id,
            assigned_by: user.id
          }]);
      }
    }

    setShowAddModal(false);

    // ✅ keep selected type instead of forcing TS
    setNewWork({
      type: newWork.type || 'Technical Sanction',
      division: 'Z.P.(Works) Division, Chandrapur'
    });

    fetchWorks();
  } catch (error) {
    console.error('Error adding work:', error);
  }
};


  const handleViewWork = (work: Work) => {
    setSelectedWork(work);
    setShowViewModal(true);
  };

  const handleEditWork = (work: Work) => {
    setSelectedWork(work);
    setNewWork({
      type: work.type,
      work_name: work.work_name,
      division: work.division || '',
      sub_division: work.sub_division || '',
      fund_head: work.fund_head || '',
      major_head: work.major_head || '',
      minor_head: work.minor_head || '',
      service_head: work.service_head || '',
      departmental_head: work.departmental_head || '',
      sanctioning_authority: work.sanctioning_authority || '',
      ssr: work.ssr || '',
      status: work.status,
      total_estimated_cost: work.total_estimated_cost,
      village: work.village,
      taluka: work.grampanchayat,
      grampanchayat: work.taluka,
    });
    setShowEditModal(true);
  };

  const handleUpdateWork = async () => {
    
    if (!newWork.work_name || !selectedWork) return;

    try {
      const { error } = await supabase
        .schema('estimate')
        .from('works')
        .update(newWork)
        .eq('sr_no', selectedWork.sr_no);

      if (error) throw error;

      setShowEditModal(false);
      setSelectedWork(null);
      setNewWork({
        type: 'Technical Sanction'
      });
      fetchWorks();
    } catch (error) {
      console.error('Error updating work:', error);
    }
  };

  const PageHeader: React.FC<{ pageNumber?: number }> = ({ pageNumber }) => (
    <div className="text-center mb-6 pb-4 border-b-2 border-gray-300">
      <h1 className="text-lg font-bold text-red-600 mb-2">{documentSettings.header.zilla}</h1>
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

  const handleDeleteWork = async (work: Work) => {
    if (!confirm(`Are you sure you want to delete "${work.work_name}"? This will permanently delete all related data including subworks, items, measurements, and approvals. This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .schema('estimate')
        .from('works')
        .delete()
        .eq('sr_no', work.sr_no);

      if (error) {
        console.error('Error deleting work:', error);
        alert(`Failed to delete work: ${error.message}`);
        return;
      }

      alert('Work deleted successfully!');
      fetchWorks();
    } catch (error: any) {
      console.error('Error deleting work:', error);
      alert(`An error occurred while deleting the work: ${error.message || 'Unknown error'}`);
    }
  };

  const handleWorksIdClick = (worksId: string) => {
    // Navigate to subworks tab with the selected works ID
    navigate('/subworks', { state: { selectedWorksId: worksId } });
  };

  const getTypeBadge = (type: string) => {
    const typeConfig = {
      'TS': { bg: 'bg-blue-100', text: 'text-blue-800', label: 'TS' },
      'TA': { bg: 'bg-green-100', text: 'text-green-800', label: 'TA' },
    };

    const config = typeConfig[type as keyof typeof typeConfig] || typeConfig['TS'];

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Draft' },
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending' },
      approved: { bg: 'bg-green-100', text: 'text-green-800', label: 'Approved' },
      rejected: { bg: 'bg-red-100', text: 'text-red-800', label: 'Rejected' },
      in_progress: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'In Progress' },
      completed: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Completed' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('hi-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount);
  };

  const handlePdfView = (work: Work) => {
    setSelectedWorkForPdf(work);
    setShowPdfModal(true);
  };

  const filteredWorks = works.filter(work => {
    const matchesSearch = work.work_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (work.works_id && work.works_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (work.division && work.division.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesType = typeFilter === 'all' || work.type === typeFilter;
    return matchesSearch && matchesType;
  });

  if (loading) {
    return <LoadingSpinner text={t('common.loading')} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('works.title')}</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage and track all construction works and estimates
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('management')}
            className={`
              whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
              ${activeTab === 'management'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
            `}
          >
            Work Management
          </button>
          <button
            onClick={() => setActiveTab('assignments')}
            className={`
              whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
              ${activeTab === 'assignments'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
            `}
          >
            Work Assignments
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'management' ? (
        <div className="space-y-6">
          {/* Add Work Button */}
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center px-6 py-3 border border-transparent rounded-2xl shadow-lg text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-300 transition-all duration-300"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('works.addNew')}
            </button>
          </div>

          {/* Filters and Search */}
          <div className="bg-gradient-to-r from-slate-50 to-gray-100 rounded-2xl shadow-lg border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="flex-1 relative max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-3 w-3 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder={t('works.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-xl leading-5 bg-white/80 backdrop-blur-sm placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:bg-white transition-all duration-200"
            />
          </div>

          {/* Type Filter */}
          <div className="flex items-center space-x-2 max-w-xs">
            <Filter className="h-3 w-3 text-gray-400" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="block pl-3 pr-8 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl bg-white/80 backdrop-blur-sm hover:bg-white transition-all duration-200"
            >
              <option value="all">All Types</option>
              <option value="Technical Approval">Technical Approval (TA)</option>
              <option value="Technical Sanction">Technical Sanction (TS)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Works List */}
      <div className="bg-gradient-to-br from-white to-slate-50 shadow-xl rounded-2xl border border-slate-200 overflow-hidden">
        {filteredWorks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-indigo-500 to-blue-600">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                    Sr No
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                    Works ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                    Year
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                    TS/TA No
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                    Work Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                    Sub Division
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                    Fund Head
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                    Total Estimated Cost
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                    Approval
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                    {t('works.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredWorks.map((work) => (
                  <tr key={work.sr_no} className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200">
                    <td className="px-4 py-2 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {work.sr_no}
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <div className="text-sm font-medium text-blue-600">
                        <button
                          onClick={() => handleWorksIdClick(work.works_id)}
                          className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                          title="Click to view sub works"
                        >
                          {work.works_id}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {work.year || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {getTypeBadge(work.type)}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {work.ssr || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-2 max-w-xs">
                      <div className="text-sm font-medium text-gray-900 truncate" title={work.work_name}>
                        {work.work_name}
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                      <div className="text-sm text-gray-900">
                        {work.sub_division || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {work.fund_head || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {getStatusBadge(work.status)}
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <div className="flex items-center text-sm font-medium text-gray-900">
                        <IndianRupee className="w-4 h-4 mr-1" />
                         {work.recap_json ? formatCurrency(JSON.parse(work.recap_json).calculations?.grandTotal || 0) : '-'}
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <EstimateApprovalActions
                        workId={work.works_id}
                        currentStatus={work.estimate_status || 'draft'}
                        onStatusUpdate={fetchWorks}
                      />
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handlePdfView(work)}
                          className="text-purple-600 hover:text-purple-900 p-2 rounded-lg hover:bg-purple-100 transition"
                          title="View Recap Sheet"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleViewWork(work)}
                          className="text-blue-600 hover:text-blue-900 p-2 rounded-lg hover:bg-blue-100 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
                          title="View Work"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEditWork(work)}
                          className="text-green-600 hover:text-green-900 p-2 rounded-lg hover:bg-green-100 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-green-300"
                          title="Edit Work"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteWork(work)}
                          className="text-red-600 hover:text-red-900 p-2 rounded-lg hover:bg-red-100 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-300"
                          title="Delete Work"
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
            <div className="mx-auto w-20 h-20 bg-gradient-to-br from-gray-200 to-gray-300 rounded-2xl flex items-center justify-center mb-4">
              <FileText className="h-10 w-10 text-gray-500" />
            </div>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No works found</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by creating a new work estimate.
            </p>
            <div className="mt-6">
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center px-6 py-3 border border-transparent shadow-lg text-sm font-semibold rounded-2xl text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-300 transition-all duration-300"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('works.addNew')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Work Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">{t('addWork.title')}</h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">{t('common.close')}</span>
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('addWork.type')} *
                  </label>
                  <select
                    value={newWork.type}
                    onChange={(e) => setNewWork({ ...newWork, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="Technical Approval">Technical Approval (TA)</option>
                    <option value="Technical Sanction">Technical Sanction (TS)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('addWork.workName')} *
                  </label>
                  <input
                    type="text"
                    value={newWork.work_name || ''}
                    onChange={(e) => setNewWork({ ...newWork, work_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder={t('addWork.enterWorkName')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Year
                  </label>
                  <select
                    value={newWork.year || ''}
                    onChange={(e) => setNewWork({ ...newWork, year: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Year</option>
                    <option value="2023-24">2023-24</option>
                    <option value="2024-25">2024-25</option>
                    <option value="2025-26">2025-26</option>
                    <option value="2026-27">2026-27</option>
                    <option value="2027-28">2027-28</option>
                    <option value="2028-29">2028-29</option>
                    <option value="2029-30">2029-30</option>
                    <option value="2030-31">2030-31</option>
                    <option value="2031-32">2031-32</option>
                    <option value="2032-33">2032-33</option>
                    <option value="2033-34">2033-34</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {newWork.type === 'TS' ? 'Technical Sanction No.' : 'Technical Approval No.'}
                  </label>
                  <input
                    type="text"
                    value={newWork.ssr || ''}
                    onChange={(e) => setNewWork({ ...newWork, ssr: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder={newWork.type === 'TS' ? 'Enter Technical Sanction No.' : 'Enter Technical Approval No.'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('addWork.division')}
                  </label>
                  <input
                    type="text"
                    value="Z.P.(Works) Division, Chandrapur"
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('addWork.subDivision')}
                  </label>
                  <select
                    value={newWork.sub_division || ''}
                    onChange={(e) => setNewWork({ ...newWork, sub_division: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Sub Division</option>
                    <option value="Z.P.(Works) Sub-Division, Mul">Z.P.(Works) Sub-Division, Mul</option>
                    <option value="Z.P.(Works) Sub-Division, Chimur">Z.P.(Works) Sub-Division, Chimur</option>
                    <option value="Z.P.(Works) Sub-Division, Warora">Z.P.(Works) Sub-Division, Warora</option>
                    <option value="Z.P.(Works) Sub-Division, Chandrapur">Z.P.(Works) Sub-Division, Chandrapur</option>
                    <option value="Z.P.(Works) Sub-Division, Rajura">Z.P.(Works) Sub-Division, Rajura</option>
                    <option value="Z.P.(Works) Sub-Division, Jiwati">Z.P.(Works) Sub-Division, Jiwati</option>
                    <option value="Z.P.(Works) Sub-Division, Pombhurna">Z.P.(Works) Sub-Division, Pombhurna</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('addWork.fundHead')}
                  </label>
                  <input
                    type="text"
                    value={newWork.fund_head || ''}
                    onChange={(e) => setNewWork({ ...newWork, fund_head: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder={t('addWork.enterFundHead')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('addWork.majorHead')}
                  </label>
                  <input
                    type="text"
                    value={newWork.major_head || ''}
                    onChange={(e) => setNewWork({ ...newWork, major_head: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder={t('addWork.enterMajorHead')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('addWork.minorHead')}
                  </label>
                  <input
                    type="text"
                    value={newWork.minor_head || ''}
                    onChange={(e) => setNewWork({ ...newWork, minor_head: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder={t('addWork.enterMinorHead')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('addWork.serviceHead')}
                  </label>
                  <input
                    type="text"
                    value={newWork.service_head || ''}
                    onChange={(e) => setNewWork({ ...newWork, service_head: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder={t('addWork.enterServiceHead')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('addWork.departmentalHead')}
                  </label>
                  <input
                    type="text"
                    value={newWork.departmental_head || ''}
                    onChange={(e) => setNewWork({ ...newWork, departmental_head: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder={t('addWork.enterDepartmentalHead')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('addWork.sanctioningAuthority')}
                  </label>
                  <input
                    type="text"
                    value={newWork.sanctioning_authority || ''}
                    onChange={(e) => setNewWork({ ...newWork, sanctioning_authority: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder={t('addWork.enterSanctioningAuthority')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={newWork.status || 'draft'}
                    onChange={(e) => setNewWork({ ...newWork, status: e.target.value as Work['status'] })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="draft">Draft</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Total Estimated Cost (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newWork.total_estimated_cost || ''}
                    onChange={(e) => setNewWork({ ...newWork, total_estimated_cost: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter total estimated cost"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Taluka
                  </label>
                  <input
                    type="text"
                    value={newWork.village || ''}
                    onChange={(e) => setNewWork({ ...newWork, village: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter Village"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Grampanchayat
                  </label>
                  <input
                    type="text"
                    value={newWork.grampanchayat || ''}
                    onChange={(e) => setNewWork({ ...newWork, grampanchayat: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter Grampanchayat"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Taluka
                  </label>
                  <select
                    value={newWork.taluka || ''}
                    onChange={(e) => setNewWork({ ...newWork, taluka: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Taluka</option>
                    <option value="Pombhurna">Pombhurna</option>
                    <option value="Korapna">Korapna</option>
                    <option value="Gondpipri">Gondpipri</option>
                    <option value="Chandrapur">Chandrapur</option>
                    <option value="Chimur">Chimur</option>
                    <option value="Jivati">Jivati</option>
                    <option value="Dongargaon">Dongargaon</option>
                    <option value="Nagbhid">Nagbhid</option>
                    <option value="Ballarpur">Ballarpur</option>
                    <option value="Bramhapuri">Bramhapuri</option>
                    <option value="Bhadravati">Bhadravati</option>
                    <option value="Mul">Mul</option>
                    <option value="Rajura">Rajura</option>
                    <option value="Warora">Warora</option>
                    <option value="Sawali">Sawali</option>
                    <option value="Sindewahi">Sindewahi</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleAddWork}
                  disabled={!newWork.work_name}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('addWork.addWork')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Work Modal */}
      {showViewModal && selectedWork && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">View Work Details</h3>
                <button
                  onClick={() => setShowViewModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">{selectedWork.type}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Work Name</label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">{selectedWork.work_name}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SSR</label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">{selectedWork.ssr || '-'}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Division</label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">{selectedWork.division || '-'}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sub Division</label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">{selectedWork.sub_division || '-'}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fund Head</label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">{selectedWork.fund_head || '-'}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Major Head</label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">{selectedWork.major_head || '-'}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Minor Head</label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">{selectedWork.minor_head || '-'}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Service Head</label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">{selectedWork.service_head || '-'}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Departmental Head</label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">{selectedWork.departmental_head || '-'}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sanctioning Authority</label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">{selectedWork.sanctioning_authority || '-'}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">{getStatusBadge(selectedWork.status)}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Estimated Cost</label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">{formatCurrency(selectedWork.total_estimated_cost)}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Created Date</label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                    {new Date(selectedWork.created_at).toLocaleDateString('en-IN')}
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

      {/* Edit Work Modal */}
      {showEditModal && selectedWork && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Edit Work</h3>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Type *
                  </label>
                  <select
                    value={newWork.type}
                    onChange={(e) => setNewWork({ ...newWork, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="Technical Approval">Technical Approval (TA)</option>
                    <option value="Technical Sanction">Technical Sanction (TS)</option>
                   
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Work Name *
                  </label>
                  <input
                    type="text"
                    value={newWork.work_name}
                    onChange={(e) => setNewWork({ ...newWork, work_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter work name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Year
                  </label>
                  <select
                    value={newWork.year || ''}
                    onChange={(e) => setNewWork({ ...newWork, year: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Year</option>
                    <option value="2023-24">2023-24</option>
                    <option value="2024-25">2024-25</option>
                    <option value="2025-26">2025-26</option>
                    <option value="2026-27">2026-27</option>
                    <option value="2027-28">2027-28</option>
                    <option value="2028-29">2028-29</option>
                    <option value="2029-30">2029-30</option>
                    <option value="2030-31">2030-31</option>
                    <option value="2031-32">2031-32</option>
                    <option value="2032-33">2032-33</option>
                    <option value="2033-34">2033-34</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {newWork.type === 'TS' ? 'Technical Sanction No.' : 'Technical Approval No.'}
                  </label>
                  <input
                    type="text"
                    value={newWork.ssr}
                    onChange={(e) => setNewWork({ ...newWork, ssr: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder={newWork.type === 'TS' ? 'Enter Technical Sanction No.' : 'Enter Technical Approval No.'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Division
                  </label>
                  <input
                    type="text"
                    value="Z.P.(Works) Division, Chandrapur"
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sub Division
                  </label>
                  <select
                    value={newWork.sub_division || ''}
                    onChange={(e) => setNewWork({ ...newWork, sub_division: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Sub Division</option>
                    <option value="Z.P.(Works) Sub-Division, Mul">Z.P.(Works) Sub-Division, Mul</option>
                    <option value="Z.P.(Works) Sub-Division, Chimur">Z.P.(Works) Sub-Division, Chimur</option>
                    <option value="Z.P.(Works) Sub-Division, Warora">Z.P.(Works) Sub-Division, Warora</option>
                    <option value="Z.P.(Works) Sub-Division, Chandrapur">Z.P.(Works) Sub-Division, Chandrapur</option>
                    <option value="Z.P.(Works) Sub-Division, Rajura">Z.P.(Works) Sub-Division, Rajura</option>
                    <option value="Z.P.(Works) Sub-Division, Jiwati">Z.P.(Works) Sub-Division, Jiwati</option>
                    <option value="Z.P.(Works) Sub-Division, Pombhurna">Z.P.(Works) Sub-Division, Pombhurna</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fund Head
                  </label>
                  <input
                    type="text"
                    value={newWork.fund_head}
                    onChange={(e) => setNewWork({ ...newWork, fund_head: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter fund head"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Major Head
                  </label>
                  <input
                    type="text"
                    value={newWork.major_head}
                    onChange={(e) => setNewWork({ ...newWork, major_head: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter major head"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Minor Head
                  </label>
                  <input
                    type="text"
                    value={newWork.minor_head}
                    onChange={(e) => setNewWork({ ...newWork, minor_head: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter minor head"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Service Head
                  </label>
                  <input
                    type="text"
                    value={newWork.service_head}
                    onChange={(e) => setNewWork({ ...newWork, service_head: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter service head"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Departmental Head
                  </label>
                  <input
                    type="text"
                    value={newWork.departmental_head}
                    onChange={(e) => setNewWork({ ...newWork, departmental_head: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter departmental head"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sanctioning Authority
                  </label>
                  <input
                    type="text"
                    value={newWork.sanctioning_authority}
                    onChange={(e) => setNewWork({ ...newWork, sanctioning_authority: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter sanctioning authority"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Total Estimated Cost (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newWork.total_estimated_cost || ''}
                    onChange={(e) => setNewWork({ ...newWork, total_estimated_cost: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter total estimated cost"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                   Village
                  </label>
                  <input
                    type="text"
                    value={newWork.village || ''}
                    onChange={(e) => setNewWork({ ...newWork, village: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder={t('addWork.entervillage')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Grampanchayat
                  </label>
                  <input
                    type="text"
                    value={newWork.grampanchayat || ''}
                    onChange={(e) => setNewWork({ ...newWork, grampanchayat: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder={t('addWork.entergrampanchayat')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Taluka
                  </label>
                  <select
                    value={newWork.taluka || ''}
                    onChange={(e) => setNewWork({ ...newWork, taluka: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Taluka</option>
                    <option value="Pombhurna">Pombhurna</option>
                    <option value="Korapna">Korapna</option>
                    <option value="Gondpipri">Gondpipri</option>
                    <option value="Chandrapur">Chandrapur</option>
                    <option value="Chimur">Chimur</option>
                    <option value="Jivati">Jivati</option>
                    <option value="Dongargaon">Dongargaon</option>
                    <option value="Nagbhid">Nagbhid</option>
                    <option value="Ballarpur">Ballarpur</option>
                    <option value="Bramhapuri">Bramhapuri</option>
                    <option value="Bhadravati">Bhadravati</option>
                    <option value="Mul">Mul</option>
                    <option value="Rajura">Rajura</option>
                    <option value="Warora">Warora</option>
                    <option value="Sawali">Sawali</option>
                    <option value="Sindewahi">Sindewahi</option>
                  </select>
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
                  onClick={handleUpdateWork}
                  disabled={!newWork.work_name}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Update Work
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPdfModal && selectedWorkForPdf && (
  <div className="fixed inset-0 z-50 bg-gray-600 bg-opacity-50 flex justify-center items-center p-4">
    <div className="bg-white rounded-lg shadow-lg max-w-6xl w-full max-h-[90vh] overflow-auto relative p-4">
      <button
        onClick={() => setShowPdfModal(false)}
        className="absolute top-2 right-2 text-gray-600 hover:text-gray-900 z-10"
      >
        Close
      </button>

      <WorksRecapSheet
        workId={selectedWorkForPdf.works_id}  // ✅ FIXED
        readonly={false}
        unitInputs={unitInputs}
        onUnitChange={handleUnitChange}
        setShowPdfModal = {setShowPdfModal}
      />
    </div>
  </div>
)}
        </div>
      ) : (
        <WorkAssignments />
      )}
    </div>
  );
};

export default Works;
