import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { useRefreshOnVisibility } from '../hooks/useRefreshOnVisibility'; // ✅ ADD
import { EstimateWork } from '../types';
import LoadingSpinner from './common/LoadingSpinner';
import {
  BarChart3,
  FileText,
  Clock,
  IndianRupee,
  TrendingUp,
  Activity
} from 'lucide-react';

interface DashboardStats {
  totalWorks: number;
  pendingApprovals: number;
  mySubmissions: number;
  totalAmount: number;
  recentWorks: Work[];
  grandTotalAmount: number;
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // ✅ NEW: Refetch dashboard data when page becomes visible
  useRefreshOnVisibility(
    async () => {
      try {
        // attempt to refresh auth session before fetching data
        await supabase.auth.refreshSession();
      } catch (e) {
        console.warn('Session refresh failed on visibility (dashboard):', e);
      }
      await fetchDashboardData(true);
    },
    []
  );

  const fetchDashboardData = async (background = false) => {
    try {
      if (!background) setLoading(true);

      // Fetch works (RLS will filter based on assignments automatically)
      const { data: works } = await supabase
        .schema('estimate')
        .from('works')
        .select('*')
        .order('sr_no', { ascending: false });

      // Fetch pending approvals where user is current approver
      const { data: pendingApprovalsData } = await supabase
        .schema('estimate')
        .from('approval_workflows')
        .select('*')
        .eq('current_approver_id', user?.id)
        .eq('status', 'pending_approval');

      // Fetch my submissions
      const { data: mySubmissionsData } = await supabase
        .schema('estimate')
        .from('approval_workflows')
        .select('*')
        .eq('initiated_by', user?.id);

      if (works) {
        // Get works that have actual estimate/measurement activity
        const recentWorksWithActivity = [];

        for (const work of works.slice(0, 10)) {
          const { data: subworks } = await supabase
            .schema('estimate')
            .from('subworks')
            .select('subworks_id')
            .eq('works_id', work.works_id)
            .limit(1);

          if (subworks && subworks.length > 0) {
            const { data: items } = await supabase
              .schema('estimate')
              .from('subwork_items')
              .select('sr_no')
              .eq('subwork_id', subworks[0].subworks_id)
              .limit(1);

            if (items && items.length > 0) {
              const { data: measurements } = await supabase
                .schema('estimate')
                .from('item_measurements')
                .select('sr_no')
                .eq('subwork_item_id', items[0].sr_no)
                .limit(1);

              if (measurements && measurements.length > 0) {
                recentWorksWithActivity.push(work);
              } else if (items.length > 0) {
                recentWorksWithActivity.push(work);
              }
            }
          }

          if (recentWorksWithActivity.length >= 5) break;
        }

        const totalWorks = works.length;
        const pendingApprovals = pendingApprovalsData?.length || 0;
        const mySubmissions = mySubmissionsData?.length || 0;
        const totalAmount = works.reduce((sum, work) => sum + work.total_estimated_cost, 0);

        const grandTotalAmount = works.reduce((sum, work) => {
          try {
            if (work.recap_json) {
              const recap = JSON.parse(work.recap_json);
              if (recap && recap.calculations && typeof recap.calculations.grandTotal === 'number') {
                return sum + recap.calculations.grandTotal;
              }
            }
          } catch (e) { }
          return sum;
        }, 0);

        setStats({
          totalWorks,
          pendingApprovals,
          mySubmissions,
          totalAmount,
          recentWorks: recentWorksWithActivity,
          grandTotalAmount,
        });
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      if (!background) setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('hi-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-800', label: t('status.draft') },
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: t('status.pending') },
      approved: { bg: 'bg-green-100', text: 'text-green-800', label: t('status.approved') },
      rejected: { bg: 'bg-red-100', text: 'text-red-800', label: t('status.rejected') },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  if (loading) {
    return <LoadingSpinner text={t('common.loading')} />;
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02]">
        <div className="px-6 py-4">
          <div className="flex items-center">
            <div>
              <h1 className="text-xl font-bold text-white drop-shadow-lg">
                {t('dashboard.welcome')}, {user?.user_metadata?.full_name || user?.email}
              </h1>
              <p className="text-indigo-100 text-sm mt-1">E-Estimate Management System</p>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-emerald-50 to-teal-100 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 border border-emerald-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg">
                <FileText className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-emerald-700">
                {t('dashboard.totalWorks')}
              </p>
              <p className="text-2xl font-bold text-emerald-900">
                {stats?.totalWorks || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-yellow-100 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 border border-amber-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="p-3 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-xl shadow-lg">
                <Clock className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-amber-700">
                {t('dashboard.pendingApprovals')}
              </p>
              <p className="text-2xl font-bold text-amber-900">
                {stats?.pendingApprovals || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 border border-green-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg">
                <IndianRupee className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-green-700">
                {t('dashboard.totalAmount')}
              </p>
              <p className="text-2xl font-bold text-green-900">
                {formatCurrency(stats?.grandTotalAmount || 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-violet-50 to-purple-100 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 border border-violet-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="p-3 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl shadow-lg">
                <FileText className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-violet-700">
                My Submissions
              </p>
              <p className="text-2xl font-bold text-violet-900">
                {stats?.mySubmissions || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-gradient-to-br from-slate-50 to-gray-100 rounded-2xl shadow-lg border border-slate-200">
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-500 to-blue-600 rounded-t-2xl">
          <div className="flex items-center">
            <div className="p-2 bg-white/20 rounded-lg mr-3">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-white">
              {t('dashboard.recentActivity')}
            </h2>
          </div>
        </div>
        <div className="p-6">
          {stats?.recentWorks && stats.recentWorks.length > 0 ? (
            <div className="space-y-4">
              {stats.recentWorks.map((work) => (
                <div key={work.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-gray-900">
                      {work.works_id} - {work.work_name}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Division: {work.division || 'N/A'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(work.created_at).toLocaleDateString('hi-IN')}
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-sm font-medium text-gray-900">
                      {(() => {
                        try {
                          const recapJsonData = JSON.parse(work.recap_json);
                          return formatCurrency(recapJsonData.calculations.grandTotal);
                        } catch {
                          return null;
                        }
                      })()}
                    </span>
                    {getStatusBadge(work.status)}
                  </div>

                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">
                No recent activity found
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-gradient-to-br from-slate-50 to-gray-100 rounded-2xl shadow-lg border border-slate-200 p-6">
        <div className="flex items-center mb-6">
          <div className="p-2 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-lg mr-3">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button className="group flex flex-col items-center p-6 bg-gradient-to-br from-blue-50 to-indigo-100 border border-blue-200 rounded-2xl hover:from-blue-100 hover:to-indigo-200 hover:shadow-lg hover:scale-105 transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-blue-300">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg group-hover:shadow-xl transition-shadow duration-300 mb-3">
              <FileText className="h-6 w-6 text-white" />
            </div>
            <span className="text-sm font-semibold text-blue-900 group-hover:text-blue-800">{t('works.addNew')}</span>
          </button>
          <button className="group flex flex-col items-center p-6 bg-gradient-to-br from-green-50 to-emerald-100 border border-green-200 rounded-2xl hover:from-green-100 hover:to-emerald-200 hover:shadow-lg hover:scale-105 transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-green-300">
            <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg group-hover:shadow-xl transition-shadow duration-300 mb-3">
              <BarChart3 className="h-6 w-6 text-white" />
            </div>
            <span className="text-sm font-semibold text-green-900 group-hover:text-green-800">View Reports</span>
          </button>
          <button className="group flex flex-col items-center p-6 bg-gradient-to-br from-purple-50 to-pink-100 border border-purple-200 rounded-2xl hover:from-purple-100 hover:to-pink-200 hover:shadow-lg hover:scale-105 transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-purple-300">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl shadow-lg group-hover:shadow-xl transition-shadow duration-300 mb-3">
              <TrendingUp className="h-6 w-6 text-white" />
            </div>
            <span className="text-sm font-semibold text-purple-900 group-hover:text-purple-800">Analytics</span>
          </button>
          <button className="group flex flex-col items-center p-6 bg-gradient-to-br from-orange-50 to-red-100 border border-orange-200 rounded-2xl hover:from-orange-100 hover:to-red-200 hover:shadow-lg hover:scale-105 transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-orange-300">
            <div className="p-3 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl shadow-lg group-hover:shadow-xl transition-shadow duration-300 mb-3">
              <Clock className="h-6 w-6 text-white" />
            </div>
            <span className="text-sm font-semibold text-orange-900 group-hover:text-orange-800">Pending Reviews</span>
          </button>
        </div>
      </div>
    </div>
  );

};

export default Dashboard;
