import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import LoadingSpinner from './common/LoadingSpinner';
import { Users, Plus, Trash2, Search, Building, UserCheck, Shield } from 'lucide-react';

interface Work {
  works_id: string;
  work_name: string;
  division: string;
  status: string;
}

interface User {
  id: string;
  email: string;
  name?: string;
}

interface Role {
  id: number;
  name: string;
  description?: string;
}

interface Assignment {
  id: string;
  work_id: string;
  user_id: string;
  role_id: number;
  created_at: string;
  user_email?: string;
  user_name?: string;
  role_name?: string;
  work_name?: string;
}

const WorkAssignments: React.FC = () => {
  const { user } = useAuth();
  const [works, setWorks] = useState<Work[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWork, setSelectedWork] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    user_id: '',
    role_id: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedWork) {
      fetchAssignments(selectedWork);
    }
  }, [selectedWork]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [worksRes, rolesRes] = await Promise.all([
        supabase.schema('estimate').from('works').select('works_id, work_name, division, status').order('sr_no', { ascending: false }),
        supabase.schema('public').from('roles').select('*').in('application', ['estimate', 'mb','estimate,mb']),
      ]);

      if (worksRes.error) {
        console.error('Works fetch error:', worksRes.error);
        setError('Error loading works: ' + worksRes.error.message);
        throw worksRes.error;
      }
      if (rolesRes.error) {
        console.error('Roles fetch error:', rolesRes.error);
        setError('Error loading roles: ' + rolesRes.error.message);
        throw rolesRes.error;
      }

      console.log('Fetched works:', worksRes.data?.length);
      console.log('Fetched roles:', rolesRes.data);

      setWorks(worksRes.data || []);
      setRoles(rolesRes.data || []);

      const { data: userRolesData, error: usersError } = await supabase
        .schema('public')
        .from('user_roles')
        .select('user_id, name, role_id, roles!inner(application)')
        .in('roles.application', ['estimate', 'mb','estimate,mb']);

      if (usersError) {
        console.error('Users fetch error:', usersError);
        setError('Error loading users: ' + usersError.message);
        throw usersError;
      }

      const mappedUsers = (userRolesData || []).map((ur: any) => ({
        id: ur.user_id,
        email: '',
        name: ur.name || 'Unknown User',
      }));

      const uniqueUsers = Array.from(new Map(mappedUsers.map((u: User) => [u.id, u])).values());

      if (user?.id) {
        const currentUserExists = uniqueUsers.some(u => u.id === user.id);
        if (!currentUserExists) {
          const { data: currentUserRole, error: currentUserError } = await supabase
            .schema('public')
            .from('user_roles')
            .select('name')
            .eq('user_id', user.id)
            .maybeSingle();

          if (!currentUserError && currentUserRole) {
            uniqueUsers.push({
              id: user.id,
              email: user.email || '',
              name: currentUserRole.name || user.email || 'Current User',
            });
          }
        }
      }

      setUsers(uniqueUsers);

      console.log('Mapped users:', uniqueUsers.length);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      setError('Failed to load data. Please check console for details.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignments = async (workId: string) => {
    try {
      const { data, error } = await supabase
        .schema('estimate')
        .from('work_assignments')
        .select('*')
        .eq('work_id', workId);

      if (error) throw error;

      const enrichedAssignments = (data || []).map((assignment: any) => {
        const userInfo = users.find(u => u.id === assignment.user_id);
        const roleInfo = roles.find(r => r.id === assignment.role_id);
        const workInfo = works.find(w => w.works_id === assignment.work_id);

        return {
          ...assignment,
          user_email: userInfo?.email || 'Unknown',
          user_name: userInfo?.name || 'Unknown',
          role_name: roleInfo?.name || 'Unknown',
          work_name: workInfo?.work_name || 'Unknown',
        };
      });

      setAssignments(enrichedAssignments);
    } catch (error) {
      console.error('Error fetching assignments:', error);
    }
  };

  const handleAddAssignment = async () => {
    if (!selectedWork || !formData.user_id || !formData.role_id) {
      setError('Please fill all fields');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const { error: insertError } = await supabase
        .schema('estimate')
        .from('work_assignments')
        .insert([
          {
            work_id: selectedWork,
            user_id: formData.user_id,
            role_id: parseInt(formData.role_id),
            assigned_by: user?.id,
          },
        ]);

      if (insertError) {
        console.error('Database error:', insertError);
        throw insertError;
      }

      setShowModal(false);
      setFormData({ user_id: '', role_id: '' });
      setError(null);
      fetchAssignments(selectedWork);
      alert('Assignment added successfully');
    } catch (error: any) {
      console.error('Error adding assignment:', error);
      if (error.code === '23505') {
        setError('This user is already assigned to this work');
      } else if (error.message) {
        setError(`Failed to add assignment: ${error.message}`);
      } else {
        setError('Failed to add assignment. You may not have permission to assign users.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    if (!confirm('Are you sure you want to remove this assignment?')) return;

    try {
      const { error } = await supabase
        .schema('estimate')
        .from('work_assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;

      fetchAssignments(selectedWork);
      alert('Assignment removed successfully');
    } catch (error) {
      console.error('Error deleting assignment:', error);
      alert('Failed to remove assignment');
    }
  };

  const filteredWorks = works.filter(
    work =>
      work.work_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      work.works_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedWorkInfo = works.find(w => w.works_id === selectedWork);

  if (loading) {
    return <LoadingSpinner text="Loading work assignments..." />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 shadow-xl">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-white/20 backdrop-blur-sm rounded-2xl shadow-lg">
              <Users className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white drop-shadow-lg">Work Assignments</h1>
              <p className="text-blue-100 text-base mt-1 drop-shadow">
                Assign users to works based on their roles
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Building className="w-4 h-4 inline mr-1" />
              Select Work
            </label>
            <select
              value={selectedWork}
              onChange={e => setSelectedWork(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select Work...</option>
              {works.map(work => (
                <option key={work.works_id} value={work.works_id}>
                  {work.works_id} - {work.work_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Search className="w-4 h-4 inline mr-1" />
              Search Works
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search works..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {selectedWorkInfo && (
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Building className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">
                  {selectedWorkInfo.works_id} - {selectedWorkInfo.work_name}
                </h3>
                <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                  <span className="flex items-center">
                    <Building className="w-4 h-4 mr-1" />
                    {selectedWorkInfo.division || 'N/A'}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>Assign User</span>
            </button>
          </div>
        </div>
      )}

      <div className="px-6 py-6">
        {selectedWork ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h3 className="font-semibold text-gray-900 flex items-center">
                <UserCheck className="w-5 h-5 mr-2 text-blue-600" />
                Assigned Users ({assignments.length})
              </h3>
            </div>

            {assignments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gradient-to-r from-blue-50 to-indigo-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                        Assigned Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {assignments.map(assignment => (
                      <tr key={assignment.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-900">{assignment.user_name}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                            <Shield className="w-3 h-3 mr-1" />
                            {assignment.role_name}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {new Date(assignment.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleDeleteAssignment(assignment.id)}
                            className="text-red-600 hover:text-red-900 p-2 rounded-lg hover:bg-red-100 transition-all duration-200"
                            title="Remove Assignment"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-6 py-12 text-center text-gray-500">
                <UserCheck className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No assignments yet</h3>
                <p className="text-gray-500">Click "Assign User" to add users to this work.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Users className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Select a work to manage assignments</h3>
            <p className="text-gray-500">Choose a work from the dropdown above to view and manage user assignments.</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md relative shadow-lg">
            <h2 className="text-xl font-semibold mb-4">Assign User to Work</h2>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg relative">
                <span className="block sm:inline">{error}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select User</label>
                <select
                  value={formData.user_id}
                  onChange={e => setFormData({ ...formData, user_id: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">Select User...</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Role</label>
                <select
                  value={formData.role_id}
                  onChange={e => setFormData({ ...formData, role_id: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">Select Role...</option>
                  {roles.map(role => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={handleAddAssignment}
                disabled={saving || !formData.user_id || !formData.role_id}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold shadow-md hover:scale-[1.03] transition-transform duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {saving ? 'Assigning...' : 'Assign'}
              </button>
              <button
                onClick={() => {
                  setShowModal(false);
                  setError(null);
                  setFormData({ user_id: '', role_id: '' });
                }}
                disabled={saving}
                className="px-6 py-3 bg-gray-300 text-gray-800 rounded-xl font-semibold shadow-sm hover:bg-gray-400 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkAssignments;
