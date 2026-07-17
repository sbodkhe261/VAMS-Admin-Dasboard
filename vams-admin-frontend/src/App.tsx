import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { 
  ShieldAlert, 
  Activity, 
  Users, 
  CheckCircle, 
  Settings, 
  PlusCircle, 
  LogOut, 
  Building, 
  AlertTriangle,
  Bell
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:3001';
axios.defaults.baseURL = API_BASE_URL;

// Add token interceptor to axios
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('vams_admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const companyId = localStorage.getItem('vams_admin_selected_company_id');
  if (companyId && companyId !== 'all') {
    config.headers['x-company-id'] = companyId;
  }
  return config;
}, (err) => Promise.reject(err));

interface AlertSummary {
  totalDefects: number;
  openDefects: number;
  resolvedDefects: number;
  reopenedDefects: number;
  reassignedDefects: number;
}

interface UserPerformance {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  companyId?: string;
  companyName?: string;
  currentlyAssigned: number;
  resolvedCount: number;
  reopenedCount: number;
  reassignedCount: number;
}

interface AuditTimelineEvent {
  id: string;
  alertId: string;
  actionType: string;
  details: string;
  createdAt: string;
  operator: string;
}

interface CompanyData {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  settings: {
    maxUsers: number;
    allowedRoles: string[];
    whatsappEnabled: boolean;
    whatsappApiKey: string | null;
    whatsappSenderNum: string | null;
    soundEmergency: string;
  } | null;
  users: UserPerformance[];
  alerts: {
    id: string;
    vin: string;
    defectName: string;
    severity: string;
    status: string;
    assignedToUserId: string | null;
    assignedToUser: { id: string; name: string; role: string; } | null;
    createdAt: string;
    updatedAt: string;
  }[];
}

// COMMON_DEFECTS removed


export default function App() {
  // Authentication State
  const [token, setToken] = useState<string | null>(localStorage.getItem('vams_admin_token'));
  const [userProfile, setUserProfile] = useState<any>(null);
  
  // Login fields
  const [loginTab, setLoginTab] = useState<'tenant' | 'global'>('tenant');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyIdOrName, setCompanyIdOrName] = useState('');
  const [authError, setAuthError] = useState('');
  
  // Super Admin - Companies list & selector
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(localStorage.getItem('vams_admin_selected_company_id'));

  // Interactive UI State for Multi-Tenant Workspace
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);
  const [companySubTab, setCompanySubTab] = useState<'users' | 'tasks' | 'policies'>('users');

  // Company creation form state
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyMaxUsers, setNewCompanyMaxUsers] = useState(0);
  const [newCompanySuccess, setNewCompanySuccess] = useState('');
  const [newCompanyError, setNewCompanyError] = useState('');

  // Dashboard Data
  const [analytics, setAnalytics] = useState<{
    summary: AlertSummary;
    severityDistribution: Record<string, number>;
    categoryDistribution: Record<string, number>;
    userPerformance: UserPerformance[];
    companiesData?: CompanyData[];
    auditTimeline: AuditTimelineEvent[];
  } | null>(null);

  const [activeTab, setActiveTab] = useState<'overview' | 'dispatch' | 'users' | 'policy' | 'companies' | 'alerts'>('overview');

  // Manual Dispatch State
  const [manualAssigneeId, setManualAssigneeId] = useState('');
  const [manualSeverity, setManualSeverity] = useState('MEDIUM');
  const [manualCompanyId, setManualCompanyId] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [dispatchSuccess, setDispatchSuccess] = useState('');
  const [dispatchError, setDispatchError] = useState('');

  // Alert Definitions & Broadcast State
  const [definitions, setDefinitions] = useState<any[]>([]);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [editingDef, setEditingDef] = useState<any | null>(null);
  const [defAlertId, setDefAlertId] = useState('');
  const [defName, setDefName] = useState('');
  const [defDesc, setDefDesc] = useState('');
  const [defType, setDefType] = useState('Safety');
  const [defSeverity, setDefSeverity] = useState('MEDIUM');
  const [defPrimaryAssignee, setDefPrimaryAssignee] = useState('');
  const [defEscalationChain, setDefEscalationChain] = useState<string[]>([]);
  const [defEscalationTimeout, setDefEscalationTimeout] = useState<number>(30);
  const [defCriticalOverride, setDefCriticalOverride] = useState(false);
  const [alertError, setAlertError] = useState('');
  const [alertSuccess, setAlertSuccess] = useState('');
  const [alertSearch, setAlertSearch] = useState('');
  const [alertSeverityFilter, setAlertSeverityFilter] = useState('ALL');

  // Manual Dispatch - Alert Definition select
  const [manualAlertDefinitionId, setManualAlertDefinitionId] = useState('');

  // Broadcast Message State
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastTargetUserIds, setBroadcastTargetUserIds] = useState<string[]>([]);
  const [broadcastSuccess, setBroadcastSuccess] = useState('');
  const [broadcastError, setBroadcastError] = useState('');
  const [isSavingAlert, setIsSavingAlert] = useState(false);
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);

  // Policy Forms State
  const [policyMaxUsers, setPolicyMaxUsers] = useState(0);
  const [policyAllowedRoles, setPolicyAllowedRoles] = useState<string[]>([]);
  const [policyWhatsappEnabled, setPolicyWhatsappEnabled] = useState(false);
  const [policyWhatsappApiKey, setPolicyWhatsappApiKey] = useState('');
  const [policyWhatsappSenderNum, setPolicyWhatsappSenderNum] = useState('');
  const [policyTier, setPolicyTier] = useState<string>('BASIC');
  const [policyRulebook, setPolicyRulebook] = useState<any>({});
  const [policyIsActive, setPolicyIsActive] = useState<boolean>(true);

  // Fetch logged in profile details
  useEffect(() => {
    if (token) {
      try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        const payload = JSON.parse(jsonPayload);
        setUserProfile(payload);
        
        if (payload.role !== 'SUPER_ADMIN') {
          setSelectedCompanyId(payload.companyId);
          localStorage.setItem('vams_admin_selected_company_id', payload.companyId);
        } else {
          // If Super Admin, default to 'all' if no valid scope is selected
          const storedScope = localStorage.getItem('vams_admin_selected_company_id');
          const scopeVal = storedScope || 'all';
          setSelectedCompanyId(scopeVal);
          localStorage.setItem('vams_admin_selected_company_id', scopeVal);
          fetchCompanies();
        }
      } catch (e) {
        handleLogout();
      }
    }
  }, [token]);

  // Real-time socket client connection for instant updates
  useEffect(() => {
    if (!token) return;

    const wsUrl = 'http://127.0.0.1:3000';
    console.log('[Socket] Connecting to core real-time socket server:', wsUrl);
    const socket = io(wsUrl, {
      query: { token },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected successfully, active socket ID:', socket.id);
    });

    const refreshDashboard = (data?: any) => {
      console.log('[Socket Event Received] Triggering dashboard telemetry refresh:', data);
      fetchAnalytics();
      if (selectedCompanyId && selectedCompanyId !== 'all') {
        fetchSettings();
        fetchDefinitions();
        fetchBroadcasts();
      }
    };

    // Listen to all real-time lifecycle updates
    socket.on('ALERT_CREATED', refreshDashboard);
    socket.on('ALERT_UPDATED', refreshDashboard);
    socket.on('ALERT_RESOLVED', refreshDashboard);
    socket.on('ALERT_REOPENED', refreshDashboard);
    socket.on('ALERT_ASSIGNED', refreshDashboard);
    socket.on('BROADCAST_CREATED', refreshDashboard);
    socket.on('COMMENT_ADDED', refreshDashboard);

    socket.on('disconnect', () => {
      console.log('[Socket] Disconnected from server');
    });

    return () => {
      socket.disconnect();
    };
  }, [token, selectedCompanyId]);

  // Fetch analytics when selectedCompanyId changes and set up a polling interval for real-time dashboard updates
  useEffect(() => {
    if (!token || !selectedCompanyId) return;

    fetchAnalytics();
    if (selectedCompanyId !== 'all') {
      fetchSettings();
      fetchDefinitions();
      fetchBroadcasts();
    }

    const interval = setInterval(() => {
      fetchAnalytics();
    }, 5000); // Poll every 5 seconds for real-time stats updates

    return () => clearInterval(interval);
  }, [token, selectedCompanyId]);

  const fetchCompanies = async () => {
    try {
      const res = await axios.get('/companies');
      setCompanies(res.data);
    } catch (err) {
      console.error('Failed to fetch company list:', err);
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewCompanyError('');
    setNewCompanySuccess('');
    if (!newCompanyName.trim()) {
      setNewCompanyError('Company name is required');
      return;
    }
    try {
      const res = await axios.post('/companies', {
        name: newCompanyName,
        settings: {
          maxUsers: newCompanyMaxUsers,
        }
      });
      setNewCompanySuccess(`Company "${res.data.name}" registered successfully!`);
      setNewCompanyName('');
      setNewCompanyMaxUsers(0);
      fetchCompanies();
    } catch (err: any) {
      setNewCompanyError(err.response?.data?.message || 'Failed to create company');
    }
  };

  const toggleCompanyActive = async (id: string, currentStatus: boolean) => {
    try {
      await axios.patch(`/companies/${id}/status`, { isActive: !currentStatus });
      fetchCompanies();
      fetchAnalytics();
    } catch (err) {
      console.error('Failed to toggle company status:', err);
      alert('Failed to update company status');
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await axios.get('/alerts/analytics');
      setAnalytics(res.data);
    } catch (err) {
      console.error('Failed to fetch dashboard metrics:', err);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await axios.get('/companies/settings');
      setPolicyMaxUsers(res.data.maxUsers);
      setPolicyAllowedRoles(res.data.allowedRoles || []);
      setPolicyWhatsappEnabled(res.data.whatsappEnabled);
      setPolicyWhatsappApiKey(res.data.whatsappApiKey || '');
      setPolicyWhatsappSenderNum(res.data.whatsappSenderNum || '');
      setPolicyTier(res.data.company?.tier || 'BASIC');
      setPolicyIsActive(res.data.company?.isActive !== false);
      setPolicyRulebook(res.data.rulebook || {});
    } catch (err) {
      console.error('Failed to fetch company configurations:', err);
    }
  };

  const fetchDefinitions = async () => {
    try {
      const res = await axios.get('/alerts/definitions');
      setDefinitions(res.data);
    } catch (err) {
      console.error('Failed to fetch alert definitions:', err);
    }
  };

  const fetchBroadcasts = async () => {
    try {
      const res = await axios.get('/alerts/broadcasts');
      setBroadcasts(res.data);
    } catch (err) {
      console.error('Failed to fetch broadcasts:', err);
    }
  };

  const handleCreateOrUpdateDefinition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingAlert) return;
    setAlertError('');
    setAlertSuccess('');

    if (!defAlertId || !defName || !defType || !defPrimaryAssignee) {
      setAlertError('Alert ID, Alert Name, Category/Type, and Primary Assignee are required.');
      return;
    }

    const payload = {
      alertId: defAlertId,
      name: defName,
      definition: defDesc,
      type: defType,
      severity: defSeverity,
      primaryAssigneeId: defPrimaryAssignee,
      escalationChain: defEscalationChain,
      escalationTimeout: Number(defEscalationTimeout),
      criticalOverride: defCriticalOverride,
    };

    setIsSavingAlert(true);
    try {
      if (editingDef) {
        await axios.put(`/alerts/definitions/${editingDef.id}`, payload);
        setAlertSuccess('Alert definition updated successfully!');
      } else {
        await axios.post('/alerts/definitions', payload);
        setAlertSuccess('Alert definition created successfully!');
      }
      setDefAlertId('');
      setDefName('');
      setDefDesc('');
      setDefType('Safety');
      setDefSeverity('MEDIUM');
      setDefPrimaryAssignee('');
      setDefEscalationChain([]);
      setDefEscalationTimeout(30);
      setDefCriticalOverride(false);
      setEditingDef(null);
      fetchDefinitions();
    } catch (err: any) {
      setAlertError(err.response?.data?.message || 'Failed to save alert definition');
    } finally {
      setIsSavingAlert(false);
    }
  };

  const handleDeleteDefinition = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this alert definition?')) return;
    try {
      await axios.delete(`/alerts/definitions/${id}`);
      fetchDefinitions();
    } catch (err) {
      console.error('Failed to delete alert definition:', err);
      alert('Failed to delete alert definition');
    }
  };



  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSendingBroadcast) return;
    setBroadcastError('');
    setBroadcastSuccess('');

    if (!broadcastTitle || !broadcastMessage) {
      setBroadcastError('Title and message are required.');
      return;
    }

    setIsSendingBroadcast(true);
    try {
      await axios.post('/alerts/broadcast', {
        title: broadcastTitle,
        message: broadcastMessage,
        targetUserIds: broadcastTargetUserIds.length > 0 ? broadcastTargetUserIds : undefined,
      });
      if (broadcastTargetUserIds.length > 0) {
        setBroadcastSuccess(`Broadcast message dispatched successfully to ${broadcastTargetUserIds.length} selected users!`);
      } else {
        setBroadcastSuccess('Broadcast message dispatched successfully to all users!');
      }
      setBroadcastTitle('');
      setBroadcastMessage('');
      setBroadcastTargetUserIds([]);
      fetchBroadcasts();
    } catch (err: any) {
      setBroadcastError(err.response?.data?.message || 'Failed to dispatch broadcast');
    } finally {
      setIsSendingBroadcast(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await axios.post('/auth/login', {
        email,
        passwordHash: password, // Sent directly as passwordHash in backend schema
        companyIdOrName: loginTab === 'tenant' ? (companyIdOrName || undefined) : undefined,
      });
      const jwtToken = res.data.accessToken;
      localStorage.setItem('vams_admin_token', jwtToken);
      setToken(jwtToken);
    } catch (err: any) {
      setAuthError(err.response?.data?.message || 'Login credentials invalid');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('vams_admin_token');
    localStorage.removeItem('vams_admin_selected_company_id');
    setToken(null);
    setUserProfile(null);
    setSelectedCompanyId(null);
    setAnalytics(null);
    setCompanies([]);
    setLoginTab('tenant');
    setActiveTab('overview');
    setExpandedCompanyId(null);
  };

  const handleManualDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setDispatchError('');
    setDispatchSuccess('');

    if (!manualAlertDefinitionId) {
      setDispatchError('Alert Type definition is required');
      return;
    }

    let assignedToUserId: string | undefined = undefined;
    let assignedToRole: string | undefined = undefined;

    if (manualAssigneeId) {
      if (manualAssigneeId.startsWith('user_')) {
        assignedToUserId = manualAssigneeId.replace('user_', '');
      } else if (manualAssigneeId.startsWith('role_')) {
        assignedToRole = manualAssigneeId.replace('role_', '');
      }
    }

    try {
      const headers: Record<string, string> = {};
      if (selectedCompanyId === 'all' && manualCompanyId) {
        headers['x-company-id'] = manualCompanyId;
      }

      const res = await axios.post('/alerts/manual', {
        alertDefinitionId: manualAlertDefinitionId,
        assignedToUserId,
        assignedToRole,
        severity: manualSeverity || undefined,
        notes: manualNotes || undefined,
      }, { headers });
      setDispatchSuccess(`Successfully dispatched manual alert: ${res.data.defectName || 'Alert'}`);
      setManualAlertDefinitionId('');
      setManualAssigneeId('');
      setManualSeverity('MEDIUM');
      setManualCompanyId('');
      setManualNotes('');
      fetchAnalytics();
    } catch (err: any) {
      setDispatchError(err.response?.data?.message || 'Failed to dispatch manual alert');
    }
  };

  const handleUpdatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    let finalRulebook = policyRulebook;
    if (typeof policyRulebook === 'string') {
      try {
        finalRulebook = JSON.parse(policyRulebook);
      } catch (err) {
        alert('Invalid JSON in Rulebook configuration field. Please correct the syntax before saving.');
        return;
      }
    }
    try {
      await axios.patch('/companies/settings', {
        maxUsers: policyMaxUsers,
        allowedRoles: policyAllowedRoles,
        whatsappEnabled: policyWhatsappEnabled,
        whatsappApiKey: policyWhatsappApiKey || null,
        whatsappSenderNum: policyWhatsappSenderNum || null,
        tier: policyTier,
        isActive: policyIsActive,
        rulebook: finalRulebook,
      });
      alert('Company configurations successfully updated!');
      fetchSettings();
      fetchAnalytics();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update company policy settings');
    }
  };

  const toggleAllowedRole = (role: string) => {
    if (policyAllowedRoles.includes(role)) {
      setPolicyAllowedRoles(policyAllowedRoles.filter(r => r !== role));
    } else {
      setPolicyAllowedRoles([...policyAllowedRoles, role]);
    }
  };

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      alert(`User status toggle requested for User ID: ${userId}. Local simulated update only. Setting profile to: ${!currentStatus}`);
    } catch (err) {
      console.error(err);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#07090e] p-6 font-sans">
        <div className="glass-panel p-8 max-w-md w-full border border-white/10 relative overflow-hidden rounded-2xl shadow-2xl">
          <div className="absolute top-[-50px] right-[-50px] w-36 h-36 bg-gradient-to-br from-[#3b82f6] to-[#8b5cf6] rounded-full blur-[40px] opacity-30"></div>
          
          <div className="flex flex-col items-center mb-8">
            <div className="grad-primary p-4 rounded-2xl glow-blue mb-4 flex items-center justify-center shadow-lg">
              <ShieldAlert className="w-8 h-8 text-white animate-pulse" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mb-2 text-center" style={{ fontFamily: 'var(--font-title)' }}>
              VAMS Universal Admin
            </h1>
            <p className="text-sm text-gray-400 text-center font-medium">
              Multi-tenant telemetry control system & alert dispatch portal
            </p>
          </div>

          {/* Tab selector for Portal login */}
          <div className="flex gap-2 p-1 bg-[#121620] border border-white/5 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => { setLoginTab('tenant'); setCompanyIdOrName(''); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
                loginTab === 'tenant'
                  ? 'bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] text-white shadow-lg'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Tenant Portal
            </button>
            <button
              type="button"
              onClick={() => { setLoginTab('global'); setCompanyIdOrName(''); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
                loginTab === 'global'
                  ? 'bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] text-white shadow-lg'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Global Admin Portal
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {loginTab === 'tenant' && (
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Company Name / Tenant ID
                </label>
                <input
                  type="text"
                  required={loginTab === 'tenant'}
                  value={companyIdOrName}
                  onChange={e => setCompanyIdOrName(e.target.value)}
                  placeholder="e.g. Tata Motors, Mahindra, etc."
                  className="w-full bg-[#121620] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#3b82f6] transition-all"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@company.com"
                className="w-full bg-[#121620] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#3b82f6] transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#121620] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#3b82f6] transition-all"
              />
            </div>

            {authError && (
              <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-xs text-red-400">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full btn-premium grad-primary py-3 rounded-xl font-semibold hover:opacity-90 mt-2 text-white shadow-lg"
            >
              Authenticate Admin Portal
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-[#07090e] flex font-sans text-white">
      {/* Side Navigation bar */}
      <aside className="w-64 bg-[#0a0d14] border-r border-white/5 p-6 flex flex-col justify-between shrink-0 h-full overflow-y-auto">
        <div>
          <div className="flex items-center gap-3 mb-10">
            <div className="grad-primary p-2.5 rounded-xl shadow-md flex items-center justify-center">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-title)' }}>
                VAMS Admin
              </h2>
              <span className="text-[10px] text-gray-500 tracking-widest uppercase font-semibold">
                {userProfile?.role === 'SUPER_ADMIN' ? 'Super Administrator' : 'Tenant Administrator'}
              </span>
            </div>
          </div>

          <nav className="space-y-2">
            <button
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'overview' 
                  ? 'bg-gradient-to-r from-[#3b82f6]/10 to-[#8b5cf6]/5 border-l-4 border-[#3b82f6] text-white' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Activity className="w-4 h-4" />
              Live Telemetry
            </button>

            {userProfile?.role === 'SUPER_ADMIN' && (
              <button
                onClick={() => { setActiveTab('companies'); fetchCompanies(); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'companies' 
                    ? 'bg-gradient-to-r from-[#3b82f6]/10 to-[#8b5cf6]/5 border-l-4 border-[#3b82f6] text-white' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Building className="w-4 h-4" />
                Global Company Matrix
              </button>
            )}

            <button
              onClick={() => setActiveTab('dispatch')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'dispatch' 
                  ? 'bg-gradient-to-r from-[#3b82f6]/10 to-[#8b5cf6]/5 border-l-4 border-[#3b82f6] text-white' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              Manual Alert Dispatch
            </button>

            <button
              onClick={() => { setActiveTab('alerts'); fetchDefinitions(); fetchBroadcasts(); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'alerts' 
                  ? 'bg-gradient-to-r from-[#3b82f6]/10 to-[#8b5cf6]/5 border-l-4 border-[#3b82f6] text-white' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Bell className="w-4 h-4" />
              Alert Management
            </button>

            <button
              onClick={() => setActiveTab('users')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'users' 
                  ? 'bg-gradient-to-r from-[#3b82f6]/10 to-[#8b5cf6]/5 border-l-4 border-[#3b82f6] text-white' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Users className="w-4 h-4" />
              User Performance
            </button>

            <button
              onClick={() => setActiveTab('policy')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'policy' 
                  ? 'bg-gradient-to-r from-[#3b82f6]/10 to-[#8b5cf6]/5 border-l-4 border-[#3b82f6] text-white' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Settings className="w-4 h-4" />
              Licensing & Policies
            </button>
          </nav>
        </div>

        <div>
          <div className="flex items-center gap-3 p-3 bg-[#111522] rounded-xl mb-4 border border-white/5">
            <div className="w-8 h-8 rounded-full grad-primary flex items-center justify-center font-bold text-sm text-white shadow-lg">
              {userProfile?.email?.slice(0, 2).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-white truncate">{userProfile?.email}</p>
              <span className="text-[9px] text-[#3b82f6] truncate font-medium">Active Session</span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#ff4d4d]/10 hover:bg-[#ff4d4d]/20 text-[#ff4d4d] text-xs font-semibold rounded-xl transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            End Admin Session
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight" style={{ fontFamily: 'var(--font-title)' }}>
              {selectedCompanyId === 'all' ? 'Global Operations Control Desk' : 'Tenant Operations Control Desk'}
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              {selectedCompanyId === 'all' 
                ? 'System-wide aggregates, multi-tenant matrices, and live resolution timeline diagnostics' 
                : 'Active company configurations, manual dispatch tools, and tenant statistics'}
            </p>
          </div>

          {userProfile?.role === 'SUPER_ADMIN' && (
            <div className="flex items-center gap-3 bg-[#0e121c] border border-white/5 rounded-xl px-4 py-2 shadow-lg">
              <Building className="w-4 h-4 text-gray-400" />
              <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Tenant Scope:</label>
              <select
                value={selectedCompanyId || 'all'}
                onChange={e => {
                  const val = e.target.value;
                  setSelectedCompanyId(val);
                  localStorage.setItem('vams_admin_selected_company_id', val);
                  setExpandedCompanyId(null);
                }}
                className="bg-[#171c2a] border border-white/10 rounded px-2.5 py-1 text-xs text-white focus:outline-none cursor-pointer"
              >
                <option value="all">All Companies (Global)</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
        </header>

        {/* Overview Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Stat Counters */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
              <div className="glass-panel p-6 relative overflow-hidden flex flex-col justify-between min-h-[140px] rounded-2xl border border-white/5">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Total Defects</span>
                <h3 className="text-3xl font-extrabold text-white mt-2" style={{ fontFamily: 'var(--font-title)' }}>
                  {analytics?.summary?.totalDefects ?? 0}
                </h3>
                <span className="text-[10px] text-gray-500 mt-2">Cumulative lifetime alerts</span>
              </div>

              <div className="glass-panel p-6 relative overflow-hidden flex flex-col justify-between border-l-4 border-amber-500 min-h-[140px] rounded-2xl">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Open Defects</span>
                <h3 className="text-3xl font-extrabold text-amber-500 mt-2" style={{ fontFamily: 'var(--font-title)' }}>
                  {analytics?.summary?.openDefects ?? 0}
                </h3>
                <span className="text-[10px] text-gray-500 mt-2">Awaiting engineering resolve</span>
              </div>

              <div className="glass-panel p-6 relative overflow-hidden flex flex-col justify-between border-l-4 border-emerald-500 min-h-[140px] rounded-2xl">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Resolved Defects</span>
                <h3 className="text-3xl font-extrabold text-emerald-500 mt-2" style={{ fontFamily: 'var(--font-title)' }}>
                  {analytics?.summary?.resolvedDefects ?? 0}
                </h3>
                <span className="text-[10px] text-gray-500 mt-2">Successfully closed tasks</span>
              </div>

              <div className="glass-panel p-6 relative overflow-hidden flex flex-col justify-between border-l-4 border-rose-500 min-h-[140px] rounded-2xl">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Reopened Defects</span>
                <h3 className="text-3xl font-extrabold text-rose-500 mt-2" style={{ fontFamily: 'var(--font-title)' }}>
                  {analytics?.summary?.reopenedDefects ?? 0}
                </h3>
                <span className="text-[10px] text-gray-500 mt-2">Recurrent faults reported</span>
              </div>

              <div className="glass-panel p-6 relative overflow-hidden flex flex-col justify-between border-l-4 border-sky-500 min-h-[140px] rounded-2xl">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Reassigned Defects</span>
                <h3 className="text-3xl font-extrabold text-sky-500 mt-2" style={{ fontFamily: 'var(--font-title)' }}>
                  {analytics?.summary?.reassignedDefects ?? 0}
                </h3>
                <span className="text-[10px] text-gray-500 mt-2">Handovers and re-routings</span>
              </div>
            </div>

            {/* Redesigned Multi-Tenant Explorer Grid */}
            {selectedCompanyId === 'all' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <Building className="w-5 h-5 text-blue-500" />
                      Multi-Tenant Workspace Explorer
                    </h2>
                    <p className="text-xs text-gray-400">Track and manage users, license limits, configurations, and tasks for each company from this single pane.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {analytics?.companiesData && analytics.companiesData.length > 0 ? (
                    analytics.companiesData.map(c => {
                      const isExpanded = expandedCompanyId === c.id;
                      const userCount = c.users.length;
                      const openAlerts = c.alerts.filter(a => a.status === 'OPEN' || a.status === 'IN_PROGRESS').length;
                      const maxLicense = c.settings?.maxUsers ?? 0;

                      return (
                        <div key={c.id} className="glass-panel border border-white/5 rounded-2xl overflow-hidden shadow-lg transition-all duration-300">
                          {/* Company summary row */}
                          <div className="p-6 flex flex-wrap items-center justify-between gap-4 bg-white/[0.01] hover:bg-white/[0.02] transition-all">
                            <div className="flex items-center gap-4">
                              <div className="grad-primary p-3 rounded-xl flex items-center justify-center shadow-md">
                                <Building className="w-6 h-6 text-white" />
                              </div>
                              <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">{c.name}</h3>
                                <span className="text-[10px] text-gray-500 font-mono block">Tenant ID: {c.id}</span>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-4 text-xs font-semibold text-gray-300">
                              <div className="bg-[#121620] px-4 py-2 border border-white/5 rounded-xl">
                                <p className="text-[10px] text-gray-500 uppercase">License</p>
                                <p className="text-sm font-bold text-white">{userCount} / {maxLicense === 0 ? '∞' : maxLicense} Users</p>
                              </div>
                              <div className="bg-[#121620] px-4 py-2 border border-white/5 rounded-xl">
                                <p className="text-[10px] text-gray-500 uppercase">Open Defects</p>
                                <p className="text-sm font-bold text-amber-500">{openAlerts} Active</p>
                              </div>
                              <div className="bg-[#121620] px-4 py-2 border border-white/5 rounded-xl">
                                <p className="text-[10px] text-gray-500 uppercase">System Status</p>
                                <span className={`inline-block mt-0.5 px-2 py-0.5 text-[10px] font-bold rounded ${
                                  c.isActive ? 'bg-emerald-950/40 text-emerald-500 border border-emerald-900/40' : 'bg-red-950/40 text-red-500 border border-red-900/40'
                                }`}>
                                  {c.isActive ? 'ACTIVE' : 'SUSPENDED'}
                                </span>
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setSelectedCompanyId(c.id);
                                  localStorage.setItem('vams_admin_selected_company_id', c.id);
                                }}
                                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-xs shadow-md transition-all flex items-center gap-1.5"
                              >
                                <Activity className="w-3.5 h-3.5" />
                                Scope Workspace
                              </button>

                              <button
                                onClick={() => {
                                  if (isExpanded) {
                                    setExpandedCompanyId(null);
                                  } else {
                                    setExpandedCompanyId(c.id);
                                    setCompanySubTab('users');
                                  }
                                }}
                                className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-white border border-white/10 rounded-xl font-semibold text-xs transition-all"
                              >
                                {isExpanded ? 'Collapse Workspace' : 'Inspect Workspace'}
                              </button>
                            </div>
                          </div>

                          {/* Expanded Multi-Tenant Workspace Details */}
                          {isExpanded && (
                            <div className="border-t border-white/5 bg-[#090b10] p-6 space-y-6">
                              {/* Sub-tab navigation */}
                              <div className="flex gap-2 border-b border-white/5 pb-3">
                                <button
                                  onClick={() => setCompanySubTab('users')}
                                  className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                                    companySubTab === 'users'
                                      ? 'bg-blue-600 text-white'
                                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                                  }`}
                                >
                                  Users & Employees ({c.users.length})
                                </button>
                                <button
                                  onClick={() => setCompanySubTab('tasks')}
                                  className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                                    companySubTab === 'tasks'
                                      ? 'bg-blue-600 text-white'
                                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                                  }`}
                                >
                                  Defect Alert Tasks ({c.alerts.length})
                                </button>
                                <button
                                  onClick={() => setCompanySubTab('policies')}
                                  className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                                    companySubTab === 'policies'
                                      ? 'bg-blue-600 text-white'
                                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                                  }`}
                                >
                                  Licensing & Whitelist Policies
                                </button>
                              </div>

                              {/* Company Users Sub-tab */}
                              {companySubTab === 'users' && (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left border-collapse">
                                    <thead>
                                      <tr className="border-b border-white/5 text-gray-400 text-[10px] uppercase tracking-wider">
                                        <th className="py-3 px-4">Operator Name</th>
                                        <th className="py-3 px-4">Email</th>
                                        <th className="py-3 px-4">System Role</th>
                                        <th className="py-3 px-4 text-center">Currently Open</th>
                                        <th className="py-3 px-4 text-center">Resolved</th>
                                        <th className="py-3 px-4 text-center">Reopened</th>
                                        <th className="py-3 px-4 text-center">Reassigned</th>
                                        <th className="py-3 px-4 text-right">Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 text-xs text-gray-300">
                                      {c.users.length > 0 ? (
                                        c.users.map(u => (
                                          <tr key={u.id} className="hover:bg-white/5 transition-all">
                                            <td className="py-3.5 px-4 font-semibold text-white">{u.name}</td>
                                            <td className="py-3.5 px-4 text-gray-400">{u.email}</td>
                                            <td className="py-3.5 px-4">
                                              <span className="bg-[#171c2a] border border-white/5 px-2 py-0.5 rounded text-[10px] font-semibold text-[#8b5cf6]">
                                                {u.role}
                                              </span>
                                            </td>
                                            <td className="py-3.5 px-4 text-center text-amber-500 font-semibold">{u.currentlyAssigned}</td>
                                            <td className="py-3.5 px-4 text-center text-emerald-500 font-semibold">{u.resolvedCount}</td>
                                            <td className="py-3.5 px-4 text-center text-rose-500 font-semibold">{u.reopenedCount}</td>
                                            <td className="py-3.5 px-4 text-center text-sky-500 font-semibold">{u.reassignedCount}</td>
                                            <td className="py-3.5 px-4 text-right">
                                              <button
                                                onClick={() => toggleUserStatus(u.id, u.isActive)}
                                                className={`px-2.5 py-1 text-[10px] font-bold rounded transition-all ${
                                                  u.isActive
                                                    ? 'bg-emerald-950/40 text-emerald-500 border border-emerald-900/40 hover:bg-emerald-900/30'
                                                    : 'bg-red-950/40 text-red-500 border border-red-900/40 hover:bg-red-900/30'
                                                }`}
                                              >
                                                {u.isActive ? 'Suspend' : 'Activate'}
                                              </button>
                                            </td>
                                          </tr>
                                        ))
                                      ) : (
                                        <tr>
                                          <td colSpan={8} className="py-8 text-center text-gray-500 text-xs">No registered operators/users under this company</td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {/* Company Tasks Sub-tab */}
                              {companySubTab === 'tasks' && (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left border-collapse">
                                    <thead>
                                      <tr className="border-b border-white/5 text-gray-400 text-[10px] uppercase tracking-wider">
                                        <th className="py-3 px-4">VIN Number</th>
                                        <th className="py-3 px-4">Defect Name</th>
                                        <th className="py-3 px-4 text-center">Severity</th>
                                        <th className="py-3 px-4 text-center">Task Status</th>
                                        <th className="py-3 px-4 font-medium">Assigned operator</th>
                                        <th className="py-3 px-4 text-right">Created Date</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 text-xs text-gray-300">
                                      {c.alerts.length > 0 ? (
                                        c.alerts.map(a => {
                                          let sevClass = 'bg-gray-800 text-gray-400';
                                          if (a.severity === 'HIGH') sevClass = 'bg-orange-950/40 text-orange-400 border border-orange-900/40';
                                          else if (a.severity === 'CRITICAL' || a.severity === 'EMERGENCY') sevClass = 'bg-red-950/40 text-red-400 border border-red-900/40';
                                          else if (a.severity === 'MEDIUM') sevClass = 'bg-yellow-950/40 text-yellow-500 border border-yellow-900/40';

                                          let statClass = 'bg-gray-800 text-gray-300';
                                          if (a.status === 'OPEN') statClass = 'bg-blue-950/40 text-blue-400 border border-blue-900/40';
                                          else if (a.status === 'IN_PROGRESS') statClass = 'bg-amber-950/40 text-amber-500 border border-amber-900/40';
                                          else if (a.status === 'RESOLVED') statClass = 'bg-emerald-950/40 text-emerald-500 border border-emerald-900/40';
                                          else if (a.status === 'REOPENED') statClass = 'bg-rose-950/40 text-rose-500 border border-rose-900/40';

                                          return (
                                            <tr key={a.id} className="hover:bg-white/5 transition-all">
                                              <td className="py-3.5 px-4 font-mono font-bold text-white">{a.vin}</td>
                                              <td className="py-3.5 px-4 font-medium">{a.defectName}</td>
                                              <td className="py-3.5 px-4 text-center">
                                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${sevClass}`}>
                                                  {a.severity}
                                                </span>
                                              </td>
                                              <td className="py-3.5 px-4 text-center">
                                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${statClass}`}>
                                                  {a.status}
                                                </span>
                                              </td>
                                              <td className="py-3.5 px-4 text-gray-300 font-medium">
                                                {a.assignedToUser ? `${a.assignedToUser.name} (${a.assignedToUser.role})` : 'Unassigned / Dynamic'}
                                              </td>
                                              <td className="py-3.5 px-4 text-right text-gray-500 font-medium">{new Date(a.createdAt).toLocaleDateString()}</td>
                                            </tr>
                                          );
                                        })
                                      ) : (
                                        <tr>
                                          <td colSpan={6} className="py-8 text-center text-gray-500 text-xs">No defect/alert tasks recorded under this company</td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {/* Company Policies Sub-tab */}
                              {companySubTab === 'policies' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs bg-[#111522]/30 border border-white/5 p-5 rounded-2xl">
                                  <div className="space-y-4">
                                    <h4 className="font-bold text-white border-b border-white/5 pb-2 uppercase tracking-wide text-[10px] text-gray-400">Licensing Restrictions</h4>
                                    <div>
                                      <p className="text-gray-400">Max Active User License Cap:</p>
                                      <p className="text-sm font-bold text-white mt-1">{c.settings?.maxUsers === 0 ? 'Unlimited Users' : `${c.settings?.maxUsers} Active Users`}</p>
                                    </div>
                                    <div>
                                      <p className="text-gray-400">Emergency Sound Alarm Profile:</p>
                                      <p className="text-sm font-bold text-white mt-1 font-mono">{c.settings?.soundEmergency ?? 'siren.mp3'}</p>
                                    </div>
                                    <div>
                                      <p className="text-gray-400 mt-2">Permitted White-listed Roles:</p>
                                      <div className="flex flex-wrap gap-1.5 mt-2">
                                        {c.settings?.allowedRoles && c.settings.allowedRoles.length > 0 ? (
                                          c.settings.allowedRoles.map(role => (
                                            <span key={role} className="bg-[#121620] border border-white/5 px-2 py-0.5 rounded text-[9px] font-semibold text-gray-300">
                                              {role.replace('_', ' ')}
                                            </span>
                                          ))
                                        ) : (
                                          <span className="text-gray-500 italic">No role whitelist configured (All roles permitted)</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="space-y-4">
                                    <h4 className="font-bold text-white border-b border-white/5 pb-2 uppercase tracking-wide text-[10px] text-gray-400">Automated Messaging Integrations</h4>
                                    <div>
                                      <p className="text-gray-400">WhatsApp Alert Reminders:</p>
                                      <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                                        c.settings?.whatsappEnabled ? 'bg-emerald-950/40 text-emerald-500 border border-emerald-900/40' : 'bg-gray-800 text-gray-500 border border-transparent'
                                      }`}>
                                        {c.settings?.whatsappEnabled ? 'ENABLED' : 'DISABLED'}
                                      </span>
                                    </div>
                                    {c.settings?.whatsappEnabled && (
                                      <>
                                        <div>
                                          <p className="text-gray-400">Sender API Gateway Key:</p>
                                          <p className="text-xs font-mono font-bold text-gray-300 truncate mt-1">••••••••••••••••</p>
                                        </div>
                                        <div>
                                          <p className="text-gray-400">Registered WhatsApp Sender Num:</p>
                                          <p className="text-sm font-mono font-bold text-white mt-1">{c.settings?.whatsappSenderNum ?? 'None'}</p>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Workspace Action Hub */}
                              <div className="flex justify-end gap-2 text-xs pt-4 border-t border-white/5">
                                <button
                                  onClick={() => {
                                    setSelectedCompanyId(c.id);
                                    localStorage.setItem('vams_admin_selected_company_id', c.id);
                                    setActiveTab('dispatch');
                                  }}
                                  className="px-3 py-1.5 bg-[#121620] hover:bg-white/5 border border-white/10 rounded-xl font-semibold text-gray-300 transition-all flex items-center gap-1.5"
                                >
                                  <PlusCircle className="w-3.5 h-3.5" />
                                  Dispatch Defect Alert
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedCompanyId(c.id);
                                    localStorage.setItem('vams_admin_selected_company_id', c.id);
                                    setActiveTab('policy');
                                  }}
                                  className="px-3 py-1.5 bg-[#121620] hover:bg-white/5 border border-white/10 rounded-xl font-semibold text-gray-300 transition-all flex items-center gap-1.5"
                                >
                                  <Settings className="w-3.5 h-3.5" />
                                  Licensing & Policy
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="glass-panel p-8 text-center text-gray-500 rounded-2xl">
                      No company tenants registered. Select a company in the header or matrices.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Scoped Company Layout Overview */}
            {selectedCompanyId !== 'all' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="glass-panel p-6 rounded-2xl border border-white/5">
                  <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                    <Users className="w-5 h-5 text-purple-500" />
                    Active Tenant Users Directory
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/5 text-gray-400 text-[10px] uppercase">
                          <th className="py-2.5 px-3">Name</th>
                          <th className="py-2.5 px-3">Role</th>
                          <th className="py-2.5 px-3 text-center">Open Tasks</th>
                          <th className="py-2.5 px-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-xs text-gray-300">
                        {analytics?.userPerformance && analytics.userPerformance.length > 0 ? (
                          analytics.userPerformance.map(u => (
                            <tr key={u.id} className="hover:bg-white/5 transition-all">
                              <td className="py-3 px-3 font-semibold text-white">{u.name}</td>
                              <td className="py-3 px-3">
                                <span className="bg-[#171c2a] border border-white/5 px-2 py-0.5 rounded text-[10px] font-semibold text-[#8b5cf6]">
                                  {u.role}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-center text-amber-500 font-semibold">{u.currentlyAssigned}</td>
                              <td className="py-3 px-3 text-right">
                                <span className={`inline-block px-2 py-0.5 text-[9px] font-bold rounded ${
                                  u.isActive ? 'bg-emerald-950/40 text-emerald-500 border border-emerald-900/40' : 'bg-red-950/40 text-red-500 border border-red-900/40'
                                }`}>
                                  {u.isActive ? 'Active' : 'Suspended'}
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="py-6 text-center text-gray-500">No active operators in scope</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="glass-panel p-6 rounded-2xl border border-white/5">
                  <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    Open Defect Tickets
                  </h3>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {analytics?.companiesData && analytics.companiesData[0]?.alerts?.filter(a => a.status !== 'RESOLVED').length ? (
                      analytics.companiesData[0].alerts.filter(a => a.status !== 'RESOLVED').map(a => {
                        let sevClass = 'bg-gray-800 text-gray-400';
                        if (a.severity === 'HIGH') sevClass = 'bg-orange-950/40 text-orange-400 border border-orange-900/40';
                        else if (a.severity === 'CRITICAL') sevClass = 'bg-red-950/40 text-red-400 border border-red-900/40';

                        return (
                          <div key={a.id} className="p-3 bg-[#111522]/50 border border-white/5 rounded-xl flex items-center justify-between gap-4 text-xs hover:bg-[#111522]/80 transition-all">
                            <div>
                              <p className="font-bold text-white font-mono">{a.vin}</p>
                              <p className="text-gray-400 font-medium mt-0.5">{a.defectName}</p>
                              <span className="text-[10px] text-gray-500 block mt-1 font-medium">Assigned: {a.assignedToUser ? a.assignedToUser.name : 'Dynamic'}</span>
                            </div>
                            <div className="text-right flex flex-col items-end gap-1.5">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${sevClass}`}>{a.severity}</span>
                              <span className="text-[9px] text-[#3b82f6] bg-[#3b82f6]/10 px-1.5 py-0.5 rounded font-bold">{a.status}</span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center text-gray-500 py-10">No active unresolved defects</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Severity Distribution & Timeline Audit logs */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="glass-panel p-6 rounded-2xl border border-white/5">
                <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-[#3b82f6]" />
                  Defects by Severity (Open Tasks)
                </h3>
                {analytics?.severityDistribution && Object.keys(analytics.severityDistribution).length > 0 ? (
                  <div className="space-y-4">
                    {Object.entries(analytics.severityDistribution).map(([sev, count]) => {
                      const maxVal = Math.max(...Object.values(analytics.severityDistribution), 1);
                      const pct = (count / maxVal) * 100;
                      return (
                        <div key={sev} className="space-y-1.5">
                          <div className="flex justify-between text-xs font-semibold">
                            <span className="text-gray-400">{sev}</span>
                            <span className="text-white">{count} Open</span>
                          </div>
                          <div className="w-full bg-[#111522] h-2.5 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-500" 
                              style={{ width: `${pct}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex h-40 items-center justify-center text-xs text-gray-500">
                    No active telemetry metrics available
                  </div>
                )}
              </div>

              <div className="glass-panel p-6 rounded-2xl border border-white/5">
                <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-[#8b5cf6]" />
                  Live Defect Transaction Audit Timeline
                </h3>
                <div className="overflow-y-auto max-h-[220px] space-y-3 pr-1">
                  {analytics?.auditTimeline && analytics.auditTimeline.length > 0 ? (
                    analytics.auditTimeline.map(evt => (
                      <div key={evt.id} className="text-xs flex justify-between p-2.5 bg-[#111522]/50 border border-white/5 rounded-xl hover:bg-[#111522]/80 transition-all">
                        <div className="space-y-1 pr-4">
                          <span className="font-semibold text-white block">{evt.actionType}</span>
                          <span className="text-gray-400 block">{evt.details}</span>
                        </div>
                        <span className="text-[10px] text-gray-500 shrink-0 font-medium">{new Date(evt.createdAt).toLocaleTimeString()}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-gray-500 text-xs py-10">No events logged</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Manual Dispatch Tab Content */}
        {activeTab === 'dispatch' && (
          <div className="max-w-2xl">
            {selectedCompanyId === 'all' ? (
              <div className="glass-panel p-8 text-center text-gray-400 rounded-2xl border border-white/5">
                <AlertTriangle className="w-8 h-8 text-yellow-500 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-white mb-2">Manual Dispatch Scoping Required</h3>
                <p className="text-xs max-w-md mx-auto">
                  Please select a specific company tenant from the <strong>Tenant Scope</strong> selector in the top-right header to assign and dispatch repair tickets.
                </p>
              </div>
            ) : (
              <div className="glass-panel p-8 relative overflow-hidden rounded-2xl border border-white/5">
                <h2 className="text-xl font-bold text-white mb-2" style={{ fontFamily: 'var(--font-title)' }}>
                  Manual Defect Dispatcher console
                </h2>
                <p className="text-xs text-gray-400 mb-6">
                  Directly route a manual defect ticket to a specific operator on the factory floor
                </p>

                <form onSubmit={handleManualDispatch} className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      Alert Type
                    </label>
                    <select
                      required
                      value={manualAlertDefinitionId}
                      onChange={e => {
                        const val = e.target.value;
                        setManualAlertDefinitionId(val);
                        if (val) {
                          const selectedDef = definitions.find(d => d.id === val);
                          if (selectedDef) {
                            setManualSeverity(selectedDef.severity);
                            if (selectedDef.primaryAssigneeId) {
                              setManualAssigneeId(`user_${selectedDef.primaryAssigneeId}`);
                            } else {
                              setManualAssigneeId('');
                            }
                          }
                        } else {
                          setManualSeverity('MEDIUM');
                          setManualAssigneeId('');
                        }
                      }}
                      className="w-full bg-[#121620] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3b82f6] transition-all cursor-pointer"
                    >
                      <option value="">Select alert type definition...</option>
                      {definitions.map(def => (
                        <option key={def.id} value={def.id}>{def.name} ({def.severity} - {def.type})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      Severity Level
                    </label>
                    <select
                      required
                      value={manualSeverity}
                      onChange={e => setManualSeverity(e.target.value)}
                      className="w-full bg-[#121620] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3b82f6] transition-all cursor-pointer"
                    >
                      <option value="INFO">Info (INFO)</option>
                      <option value="LOW">Low (LOW)</option>
                      <option value="MEDIUM">Medium (MEDIUM)</option>
                      <option value="HIGH">High (HIGH)</option>
                      <option value="CRITICAL">Critical (CRITICAL)</option>
                      <option value="EMERGENCY">Emergency (EMERGENCY)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      Floor Assignee (Role / Employee)
                    </label>
                    <select
                      value={manualAssigneeId}
                      onChange={e => setManualAssigneeId(e.target.value)}
                      className="w-full bg-[#121620] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3b82f6] transition-all cursor-pointer"
                    >
                      <option value="">Use template assignee from Alert Definition...</option>
                      
                      <optgroup label="System Roles" className="text-gray-400 font-semibold bg-[#171c2a]">
                        <option value="role_QUALITY_INSPECTOR" className="text-white">Quality Inspector (QUALITY_INSPECTOR)</option>
                        <option value="role_WORKER" className="text-white">Worker / Operator (WORKER)</option>
                        <option value="role_SUPERVISOR" className="text-white">Supervisor (SUPERVISOR)</option>
                        <option value="role_SERVICE_ENGINEER" className="text-white">Service Engineer (SERVICE_ENGINEER)</option>
                        <option value="role_FACTORY_MANAGER" className="text-white">Factory Manager (FACTORY_MANAGER)</option>
                      </optgroup>

                      <optgroup label="Specific Employees" className="text-gray-400 font-semibold bg-[#171c2a]">
                        {analytics?.userPerformance?.filter(u => !selectedCompanyId || selectedCompanyId === 'all' || u.companyId === selectedCompanyId || userProfile?.role !== 'SUPER_ADMIN').map(u => (
                          <option key={u.id} value={`user_${u.id}`} className="text-white">
                            {u.name} ({u.role}) {selectedCompanyId === 'all' ? ` - ${u.companyName || 'Unknown'}` : ''}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      Dispatcher Notes & Instructions
                    </label>
                    <textarea
                      rows={3}
                      value={manualNotes}
                      onChange={e => setManualNotes(e.target.value)}
                      placeholder="Enter special repair instructions or inspector feedback..."
                      className="w-full bg-[#121620] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3b82f6] transition-all resize-none"
                    ></textarea>
                  </div>

                  {dispatchSuccess && (
                    <div className="flex items-center gap-2 p-3 bg-emerald-950/40 border border-emerald-900/50 rounded-xl text-xs text-emerald-400">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      <span>{dispatchSuccess}</span>
                    </div>
                  )}

                  {dispatchError && (
                    <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-xs text-red-400">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{dispatchError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full btn-premium grad-primary py-3 rounded-xl font-semibold hover:opacity-90 flex items-center justify-center gap-2 text-white shadow-lg"
                  >
                    <PlusCircle className="w-5 h-5" /> Dispatch Alert Ticket
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* Alert Management Tab Content */}
        {activeTab === 'alerts' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Alert Definition Console Form */}
              <div className="lg:col-span-2 glass-panel p-8 rounded-2xl border border-white/5 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[3px] grad-primary"></div>
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-white mb-2" style={{ fontFamily: 'var(--font-title)' }}>
                    {editingDef ? 'Edit Alert Definition' : 'Define Custom Alert Template'}
                  </h3>
                  <p className="text-xs text-gray-400">
                    Predefine company-wide alerts with multi-operator SLA escalation chains
                  </p>
                </div>

                <form onSubmit={handleCreateOrUpdateDefinition} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Alert ID</label>
                      <input
                        type="text"
                        required
                        value={defAlertId}
                        onChange={e => setDefAlertId(e.target.value)}
                        placeholder="e.g. FACTORY_FIRE"
                        className="w-full bg-[#121620] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3b82f6] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Alert Name</label>
                      <input
                        type="text"
                        required
                        value={defName}
                        onChange={e => setDefName(e.target.value)}
                        placeholder="e.g. Factory Fire Alert"
                        className="w-full bg-[#121620] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3b82f6] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Category / Alert Type</label>
                      <select
                        required
                        value={defType}
                        onChange={e => setDefType(e.target.value)}
                        className="w-full bg-[#121620] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3b82f6] transition-all cursor-pointer"
                      >
                        <option value="Safety">Safety</option>
                        <option value="Fire">Fire</option>
                        <option value="Equipment">Equipment</option>
                        <option value="Security">Security</option>
                        <option value="Custom">Custom</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Definition / Description</label>
                    <textarea
                      rows={2}
                      value={defDesc}
                      onChange={e => setDefDesc(e.target.value)}
                      placeholder="Explain what this alert means and standard procedure guidelines..."
                      className="w-full bg-[#121620] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3b82f6] transition-all resize-none"
                    ></textarea>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Severity</label>
                      <select
                        required
                        value={defSeverity}
                        onChange={e => setDefSeverity(e.target.value)}
                        className="w-full bg-[#121620] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3b82f6] transition-all cursor-pointer"
                      >
                        <option value="INFO">Info (INFO)</option>
                        <option value="LOW">Low (LOW)</option>
                        <option value="MEDIUM">Medium (MEDIUM)</option>
                        <option value="HIGH">High (HIGH)</option>
                        <option value="CRITICAL">Critical (CRITICAL)</option>
                        <option value="EMERGENCY">Emergency (EMERGENCY)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Escalation Timeout (mins)</label>
                      <input
                        type="number"
                        required
                        min={1}
                        value={defEscalationTimeout}
                        onChange={e => setDefEscalationTimeout(Number(e.target.value))}
                        className="w-full bg-[#121620] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3b82f6] transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Primary Assignee</label>
                      <select
                        required
                        value={defPrimaryAssignee}
                        onChange={e => setDefPrimaryAssignee(e.target.value)}
                        className="w-full bg-[#121620] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3b82f6] transition-all cursor-pointer"
                      >
                        <option value="">Select Employee...</option>
                        {analytics?.userPerformance?.filter(u => !selectedCompanyId || selectedCompanyId === 'all' || u.companyId === selectedCompanyId || userProfile?.role !== 'SUPER_ADMIN').map(u => (
                          <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      Escalation Chain (Ordered Notification List)
                    </label>
                    <p className="text-[10px] text-gray-400 mb-2">Click employees below to add/remove them from the escalation queue order</p>
                    <div className="flex flex-wrap gap-2 p-3 bg-[#121620] border border-white/10 rounded-xl min-h-[50px]">
                      {defEscalationChain.length === 0 ? (
                        <span className="text-xs text-gray-500 italic">No operators in escalation chain</span>
                      ) : (
                        defEscalationChain.map((uid, index) => {
                          const userObj = analytics?.userPerformance?.find(u => u.id === uid);
                          return (
                            <div key={uid} className="flex items-center gap-1.5 bg-[#3b82f6]/20 border border-[#3b82f6]/30 text-white text-xs px-2.5 py-1 rounded-lg">
                              <span className="font-bold text-[#3b82f6]">{index + 1}.</span>
                              <span>{userObj ? userObj.name : 'Unknown'}</span>
                              <button
                                type="button"
                                onClick={() => setDefEscalationChain(defEscalationChain.filter(id => id !== uid))}
                                className="text-gray-400 hover:text-white font-bold"
                              >
                                &times;
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto p-1">
                      {analytics?.userPerformance?.filter(u => !selectedCompanyId || selectedCompanyId === 'all' || u.companyId === selectedCompanyId || userProfile?.role !== 'SUPER_ADMIN').map(u => {
                        const isInChain = defEscalationChain.includes(u.id);
                        if (isInChain || u.id === defPrimaryAssignee) return null;
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => setDefEscalationChain([...defEscalationChain, u.id])}
                            className="bg-white/5 hover:bg-white/10 text-[10px] px-2 py-1 rounded border border-white/5 transition-all text-gray-300"
                          >
                            + {u.name} ({u.role})
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {alertSuccess && (
                    <div className="flex items-center gap-2 p-3 bg-emerald-950/40 border border-emerald-900/50 rounded-xl text-xs text-emerald-400">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      <span>{alertSuccess}</span>
                    </div>
                  )}

                  {alertError && (
                    <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-xs text-red-400">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{alertError}</span>
                    </div>
                  )}

                  <div className="flex gap-3">
                    {editingDef && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDef(null);
                          setDefName('');
                          setDefDesc('');
                          setDefType('Safety');
                          setDefSeverity('MEDIUM');
                          setDefPrimaryAssignee('');
                          setDefEscalationChain([]);
                          setDefEscalationTimeout(30);
                          setDefCriticalOverride(false);
                        }}
                        className="w-1/3 bg-white/5 hover:bg-white/10 text-white py-3 rounded-xl font-semibold transition-all border border-white/10"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={isSavingAlert}
                      className="flex-1 btn-premium grad-primary py-3 rounded-xl font-semibold hover:opacity-90 flex items-center justify-center gap-2 text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <PlusCircle className="w-5 h-5" /> {isSavingAlert ? 'Saving...' : (editingDef ? 'Update Definition' : 'Save Definition template')}
                    </button>
                  </div>
                </form>
              </div>

              {/* Company Broadcast Notification Form */}
              <div className="glass-panel p-8 rounded-2xl border border-white/5 shadow-xl relative overflow-hidden flex flex-col justify-between">
                <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-red-500 to-amber-500"></div>
                <div>
                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-white mb-2" style={{ fontFamily: 'var(--font-title)' }}>
                      Company Broadcast
                    </h3>
                    <p className="text-xs text-gray-400">
                      Broadcast custom in-app/push alerts instantly to all company operators
                    </p>
                  </div>

                  <form onSubmit={handleSendBroadcast} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Message Title</label>
                      <input
                        type="text"
                        required
                        value={broadcastTitle}
                        onChange={e => setBroadcastTitle(e.target.value)}
                        placeholder="e.g. General Announcement"
                        className="w-full bg-[#121620] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3b82f6] transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Notification Message</label>
                      <textarea
                        rows={5}
                        required
                        value={broadcastMessage}
                        onChange={e => setBroadcastMessage(e.target.value)}
                        placeholder="Type urgent message here..."
                        className="w-full bg-[#121620] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3b82f6] transition-all resize-none"
                      ></textarea>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                        Target Users (Optional - Send to all if none selected)
                      </label>
                      <div className="bg-[#121620] border border-white/10 rounded-xl p-3 max-h-[150px] overflow-y-auto space-y-2">
                        {analytics?.userPerformance?.filter(u => !selectedCompanyId || selectedCompanyId === 'all' || u.companyId === selectedCompanyId || userProfile?.role !== 'SUPER_ADMIN').map(u => (
                          <label key={u.id} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white">
                            <input
                              type="checkbox"
                              checked={broadcastTargetUserIds.includes(u.id)}
                              onChange={() => {
                                if (broadcastTargetUserIds.includes(u.id)) {
                                  setBroadcastTargetUserIds(broadcastTargetUserIds.filter(id => id !== u.id));
                                } else {
                                  setBroadcastTargetUserIds([...broadcastTargetUserIds, u.id]);
                                }
                              }}
                              className="w-4 h-4 rounded border-white/10 text-[#3b82f6] focus:ring-[#3b82f6] cursor-pointer"
                            />
                            <span>{u.name} ({u.role})</span>
                          </label>
                        ))}
                        {(!analytics?.userPerformance || analytics.userPerformance.filter(u => !selectedCompanyId || selectedCompanyId === 'all' || u.companyId === selectedCompanyId || userProfile?.role !== 'SUPER_ADMIN').length === 0) && (
                          <span className="text-xs text-gray-500 italic">No company users found</span>
                        )}
                      </div>
                    </div>

                    {broadcastSuccess && (
                      <div className="flex items-center gap-2 p-3 bg-emerald-950/40 border border-emerald-900/50 rounded-xl text-xs text-emerald-400">
                        <CheckCircle className="w-4 h-4 shrink-0" />
                        <span>{broadcastSuccess}</span>
                      </div>
                    )}

                    {broadcastError && (
                      <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-xs text-red-400">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{broadcastError}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSendingBroadcast}
                      className="w-full bg-gradient-to-r from-red-600 to-amber-600 py-3 rounded-xl font-semibold hover:opacity-90 flex items-center justify-center gap-2 text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Bell className="w-5 h-5" /> {isSendingBroadcast ? 'Sending...' : 'Send Broadcast Alert'}
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* Active alert definitions table */}
            <div className="glass-panel p-6 rounded-2xl border border-white/5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1" style={{ fontFamily: 'var(--font-title)' }}>
                    Active Alert Definitions
                  </h3>
                  <p className="text-xs text-gray-400">
                    Review and edit alert escalation rules for active company workflows
                  </p>
                </div>

                <div className="flex gap-3">
                  <input
                    type="text"
                    value={alertSearch}
                    onChange={e => setAlertSearch(e.target.value)}
                    placeholder="Search by Name/Type..."
                    className="bg-[#121620] border border-white/10 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-[#3b82f6]"
                  />
                  <select
                    value={alertSeverityFilter}
                    onChange={e => setAlertSeverityFilter(e.target.value)}
                    className="bg-[#121620] border border-white/10 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-[#3b82f6] cursor-pointer"
                  >
                    <option value="ALL">All Severities</option>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-gray-400 text-xs uppercase tracking-wider">
                      <th className="py-4 px-4">Alert ID</th>
                      <th className="py-4 px-4">Template Name</th>
                      <th className="py-4 px-4">Alert Type</th>
                      <th className="py-4 px-4">Severity</th>
                      <th className="py-4 px-4">Primary Assignee</th>
                      <th className="py-4 px-4">Escalation Timeout</th>
                      <th className="py-4 px-4">Escalation Chain</th>
                      <th className="py-4 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs text-gray-300">
                    {definitions
                      .filter(def => {
                        const matchesSearch = def.name.toLowerCase().includes(alertSearch.toLowerCase()) || def.type.toLowerCase().includes(alertSearch.toLowerCase());
                        const matchesSeverity = alertSeverityFilter === 'ALL' || def.severity === alertSeverityFilter;
                        return matchesSearch && matchesSeverity;
                      })
                      .map(def => {
                        const assigneeUser = analytics?.userPerformance?.find(u => u.id === def.primaryAssigneeId);
                        return (
                          <tr key={def.id} className="hover:bg-white/5 transition-all">
                            <td className="py-4 px-4 font-semibold text-gray-400">{def.alertId || 'N/A'}</td>
                            <td className="py-4 px-4 font-semibold text-white">{def.name}</td>
                            <td className="py-4 px-4">{def.type}</td>
                            <td className="py-4 px-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                def.severity === 'CRITICAL' || def.severity === 'EMERGENCY'
                                  ? 'bg-red-950/40 text-red-400 border border-red-900/40'
                                  : def.severity === 'HIGH'
                                  ? 'bg-orange-950/40 text-orange-400 border border-orange-900/40'
                                  : 'bg-gray-850 text-gray-400'
                              }`}>{def.severity}</span>
                            </td>
                            <td className="py-4 px-4">{assigneeUser ? assigneeUser.name : 'Unknown'}</td>
                            <td className="py-4 px-4">{def.escalationTimeout} mins</td>
                            <td className="py-4 px-4">
                              {def.escalationChain && def.escalationChain.length > 0 ? (
                                <span className="text-gray-400">{def.escalationChain.length} steps chain</span>
                              ) : (
                                <span className="text-gray-500 italic">None defined</span>
                              )}
                            </td>
                            <td className="py-4 px-4 text-right">
                              <div className="flex justify-end gap-3">
                                <button
                                  onClick={() => {
                                    setEditingDef(def);
                                    setDefAlertId(def.alertId || '');
                                    setDefName(def.name);
                                    setDefDesc(def.definition || '');
                                    setDefType(def.type);
                                    setDefSeverity(def.severity);
                                    setDefPrimaryAssignee(def.primaryAssigneeId);
                                    setDefEscalationChain(def.escalationChain || []);
                                    setDefEscalationTimeout(def.escalationTimeout);
                                    setDefCriticalOverride(def.criticalOverride);
                                  }}
                                  className="text-blue-400 hover:text-blue-300 font-semibold"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteDefinition(def.id)}
                                  className="text-red-400 hover:text-red-300 font-semibold"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    {definitions.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-gray-500 italic">No alert definitions defined. Define one above.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Broadcast history audit log table */}
            <div className="glass-panel p-6 rounded-2xl border border-white/5">
              <h3 className="text-lg font-bold text-white mb-2" style={{ fontFamily: 'var(--font-title)' }}>
                Company Broadcast Audit Logs
              </h3>
              <p className="text-xs text-gray-400 mb-6">
                Audit history of one-off company-wide messages dispatched to operators
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-gray-400 text-xs uppercase tracking-wider">
                      <th className="py-4 px-4">Timestamp</th>
                      <th className="py-4 px-4">Broadcast Title</th>
                      <th className="py-4 px-4">Message Content</th>
                      <th className="py-4 px-4">Dispatched By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs text-gray-300">
                    {broadcasts.map(br => {
                      const sender = analytics?.userPerformance?.find(u => u.id === br.sentById);
                      return (
                        <tr key={br.id} className="hover:bg-white/5 transition-all">
                          <td className="py-4 px-4 font-mono text-gray-400">{new Date(br.createdAt).toLocaleString()}</td>
                          <td className="py-4 px-4 font-bold text-white">{br.title}</td>
                          <td className="py-4 px-4 max-w-sm truncate">{br.message}</td>
                          <td className="py-4 px-4">{sender ? sender.name : 'Administrator'}</td>
                        </tr>
                      );
                    })}
                    {broadcasts.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-gray-500 italic">No broadcasts sent yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Users Tab Content */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-2xl border border-white/5">
              <h3 className="text-lg font-bold text-white mb-2" style={{ fontFamily: 'var(--font-title)' }}>
                User Performance Analytics Grid {selectedCompanyId === 'all' && '(All Companies)'}
              </h3>
              <p className="text-xs text-gray-400 mb-6">
                Active telemetry tracks total open reassignments and resolved defect tickets to analyze personnel performance
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-gray-400 text-xs uppercase tracking-wider">
                      <th className="py-4 px-4">Operator Name</th>
                      <th className="py-4 px-4">Company Name</th>
                      <th className="py-4 px-4">System Role</th>
                      <th className="py-4 px-4 text-center">Currently Open</th>
                      <th className="py-4 px-4 text-center">Closed Defects</th>
                      <th className="py-4 px-4 text-center">Reopened Cases</th>
                      <th className="py-4 px-4 text-center">Reassignments</th>
                      <th className="py-4 px-4 text-right">Account Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs text-gray-300">
                    {analytics?.userPerformance && analytics.userPerformance.length > 0 ? (
                      analytics.userPerformance.map(u => (
                        <tr key={u.id} className="hover:bg-white/5 transition-all">
                          <td className="py-4 px-4 font-semibold text-white">{u.name}</td>
                          <td className="py-4 px-4 text-gray-400 font-medium">{u.companyName ?? 'HQ Global'}</td>
                          <td className="py-4 px-4">
                            <span className="bg-[#171c2a] border border-white/5 px-2.5 py-1 rounded-md text-[10px] font-semibold text-[#8b5cf6]">
                              {u.role}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-center text-amber-500 font-semibold">{u.currentlyAssigned}</td>
                          <td className="py-4 px-4 text-center text-emerald-500 font-semibold">{u.resolvedCount}</td>
                          <td className="py-4 px-4 text-center text-rose-500 font-semibold">{u.reopenedCount}</td>
                          <td className="py-4 px-4 text-center text-sky-500 font-semibold">{u.reassignedCount}</td>
                          <td className="py-4 px-4 text-right">
                            <button
                              onClick={() => toggleUserStatus(u.id, u.isActive)}
                              className={`inline-block px-3 py-1 rounded-lg font-bold text-[10px] transition-all ${
                                u.isActive
                                  ? 'bg-emerald-950/40 text-emerald-500 border border-emerald-900/40 hover:bg-emerald-900/30'
                                  : 'bg-red-950/40 text-red-500 border border-red-900/40 hover:bg-red-900/30'
                              }`}
                            >
                              {u.isActive ? 'Activated' : 'Suspended'}
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-gray-500">No active operators in selected scope</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Policy Tab Content */}
        {activeTab === 'policy' && (
          <div className="max-w-2xl">
            {selectedCompanyId === 'all' ? (
              <div className="glass-panel p-8 text-center text-gray-400 rounded-2xl border border-white/5">
                <Settings className="w-8 h-8 text-[#8b5cf6] mx-auto mb-4" />
                <h3 className="text-lg font-bold text-white mb-2">Licensing Scoping Required</h3>
                <p className="text-xs max-w-md mx-auto">
                  Please select a specific company tenant from the <strong>Tenant Scope</strong> selector in the top-right header to view and edit user licensing limits, roles, and WhatsApp configuration.
                </p>
              </div>
            ) : (
              <div className="glass-panel p-8 rounded-2xl border border-white/5">
                <h2 className="text-xl font-bold text-white mb-2" style={{ fontFamily: 'var(--font-title)' }}>
                  Licensing, Role Lockdown, & Integrations
                </h2>
                <p className="text-xs text-gray-400 mb-6">
                  Configure tenant limitations, whitelist operational user roles, and activate automated warning services
                </p>

                <form onSubmit={handleUpdatePolicy} className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">1. Max Active User License Limit</h3>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="0"
                        value={policyMaxUsers}
                        onChange={e => setPolicyMaxUsers(parseInt(e.target.value, 10))}
                        className="bg-[#121620] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3b82f6] w-32"
                      />
                      <span className="text-xs text-gray-400">
                        Maximum active users allowed. (Set to <code>0</code> for unlimited users).
                      </span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">2. Permitted Whitelist System Roles</h3>
                    <div className="grid grid-cols-2 gap-3 bg-[#111522] p-4 rounded-xl border border-white/5">
                      {['FACTORY_MANAGER', 'SUPERVISOR', 'WORKER', 'QUALITY_INSPECTOR', 'SERVICE_ENGINEER', 'DEALER', 'VEHICLE_OWNER'].map(role => {
                        const isChecked = policyAllowedRoles.includes(role);
                        return (
                          <label key={role} className="flex items-center gap-3 text-xs text-gray-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleAllowedRole(role)}
                              className="w-4 h-4 rounded bg-[#121620] border-white/20 text-[#3b82f6] focus:ring-0"
                            />
                            {role.replace('_', ' ')}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider">3. Automated WhatsApp Warning Alerts</h3>
                        <p className="text-[10px] text-gray-500 mt-1">Send repeating reminders on unresolved defects directly to operator mobile numbers</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={policyWhatsappEnabled}
                          onChange={e => setPolicyWhatsappEnabled(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3b82f6]"></div>
                      </label>
                    </div>

                    {policyWhatsappEnabled && (
                      <div className="space-y-4 bg-[#111522] p-4 rounded-xl border border-white/5">
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-2">WhatsApp Sender API Key (Twilio/Cloud API)</label>
                          <input
                            type="password"
                            value={policyWhatsappApiKey}
                            onChange={e => setPolicyWhatsappApiKey(e.target.value)}
                            placeholder="API Access Key Token"
                            className="w-full bg-[#121620] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-2">Registered Sender Phone Number</label>
                          <input
                            type="text"
                            value={policyWhatsappSenderNum}
                            onChange={e => setPolicyWhatsappSenderNum(e.target.value)}
                            placeholder="e.g. +14155238886"
                            className="w-full bg-[#121620] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">4. Tenant Subscription Tier</h3>
                    <div className="flex items-center gap-3">
                      <select
                        value={policyTier}
                        onChange={e => setPolicyTier(e.target.value)}
                        className="bg-[#121620] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3b82f6] w-48 text-xs font-semibold"
                      >
                        <option value="BASIC">BASIC TIER</option>
                        <option value="PREMIUM">PREMIUM TIER</option>
                      </select>
                      <span className="text-xs text-gray-400">
                        Gates availability of advanced features.
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider">5. Tenant Suspension Status</h3>
                        <p className="text-[10px] text-gray-500 mt-1">Enable or disable this client entire workspace access</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={policyIsActive}
                          onChange={e => setPolicyIsActive(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#e11d48]"></div>
                      </label>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">6. Alert Engine Custom Rulebook (JSON Profile)</h3>
                    <div className="space-y-4 bg-[#111522] p-4 rounded-xl border border-white/5">
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-2">Rulebook Configuration JSON</label>
                        <textarea
                          rows={12}
                          value={typeof policyRulebook === 'object' ? JSON.stringify(policyRulebook, null, 2) : policyRulebook}
                          onChange={e => setPolicyRulebook(e.target.value)}
                          className="w-full bg-[#121620] border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder-gray-600 focus:outline-none"
                        />
                        <span className="text-[10px] text-gray-500 mt-1 block">
                          Configure dynamic properties like <code>workerAlertsEnabled</code>, <code>categoriesEnabled</code>, <code>escalation</code>, etc.
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full btn-premium grad-primary py-3 rounded-xl font-semibold hover:opacity-90 text-white shadow-lg"
                  >
                    Save Policy Configuration
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* Global Company Matrix Tab Content */}
        {activeTab === 'companies' && userProfile?.role === 'SUPER_ADMIN' && (
          <div className="space-y-8 animate-fadeIn">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Companies List Matrix */}
              <div className="glass-panel p-6 lg:col-span-2 rounded-2xl border border-white/5">
                <h3 className="text-lg font-bold text-white mb-2" style={{ fontFamily: 'var(--font-title)' }}>
                  Global Company Matrix
                </h3>
                <p className="text-xs text-gray-400 mb-6">
                  Monitor registered company tenants, user allocations, and active repair tickets across the system
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 text-gray-400 text-xs uppercase tracking-wider">
                        <th className="py-4 px-4">Company Name</th>
                        <th className="py-4 px-4">Total Users</th>
                        <th className="py-4 px-4">Open Alerts</th>
                        <th className="py-4 px-4">Created Date</th>
                        <th className="py-4 px-4">Status</th>
                        <th className="py-4 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs text-gray-300">
                      {companies && companies.length > 0 ? (
                        companies.map(c => (
                          <tr key={c.id} className="hover:bg-white/5 transition-all">
                            <td className="py-4 px-4 font-semibold text-white">
                              <span className="block text-sm">{c.name}</span>
                              <span className="text-[9px] text-gray-500 font-mono block truncate max-w-[120px]">{c.id}</span>
                            </td>
                            <td className="py-4 px-4 text-gray-400">{c.userCount} Users</td>
                            <td className="py-4 px-4 font-semibold text-amber-500">{c.openAlertCount} Active</td>
                            <td className="py-4 px-4 text-gray-500 font-medium">{new Date(c.createdAt).toLocaleDateString()}</td>
                            <td className="py-4 px-4">
                              <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${
                                c.isActive 
                                  ? 'bg-emerald-950/40 text-emerald-500 border border-emerald-900/40' 
                                  : 'bg-red-950/40 text-red-500 border border-red-900/40'
                              }`}>
                                {c.isActive ? 'Active' : 'Suspended'}
                              </span>
                            </td>
                            <td className="py-4 px-4 text-right space-x-2">
                              <button
                                onClick={() => {
                                  setSelectedCompanyId(c.id);
                                  localStorage.setItem('vams_admin_selected_company_id', c.id);
                                  setActiveTab('overview');
                                }}
                                className="px-3 py-1.5 bg-blue-950/40 text-[#3b82f6] border border-blue-900/40 rounded-xl hover:bg-blue-900/30 font-semibold text-[10px] transition-all"
                              >
                                Scope Workspace
                              </button>
                              <button
                                onClick={() => toggleCompanyActive(c.id, c.isActive)}
                                className={`px-3 py-1.5 rounded-xl border text-[10px] font-semibold transition-all ${
                                  c.isActive 
                                    ? 'bg-red-950/40 text-red-500 border-red-900/40 hover:bg-red-900/30'
                                    : 'bg-emerald-950/40 text-emerald-500 border-emerald-900/40 hover:bg-emerald-900/30'
                                }`}
                              >
                                {c.isActive ? 'Suspend' : 'Activate'}
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-gray-500">No company tenants registered</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Create Company Form */}
              <div className="glass-panel p-6 rounded-2xl border border-white/5">
                <h3 className="text-lg font-bold text-white mb-2" style={{ fontFamily: 'var(--font-title)' }}>
                  Register New Company
                </h3>
                <p className="text-xs text-gray-400 mb-6">
                  Provision a new company tenant with default system settings
                </p>

                <form onSubmit={handleCreateCompany} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      Company Name
                    </label>
                    <input
                      type="text"
                      required
                      value={newCompanyName}
                      onChange={e => setNewCompanyName(e.target.value)}
                      placeholder="e.g. Ashok Leyland, Volvo, etc."
                      className="w-full bg-[#121620] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#3b82f6] transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      Max User License Cap
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={newCompanyMaxUsers}
                      onChange={e => setNewCompanyMaxUsers(parseInt(e.target.value, 10))}
                      className="w-full bg-[#121620] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3b82f6] transition-all"
                    />
                    <span className="text-[10px] text-gray-500 mt-1 block">0 indicates unlimited registered users</span>
                  </div>

                  {newCompanySuccess && (
                    <div className="flex items-center gap-2 p-3 bg-emerald-950/40 border border-emerald-900/50 rounded-xl text-xs text-emerald-400">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      <span>{newCompanySuccess}</span>
                    </div>
                  )}

                  {newCompanyError && (
                    <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-xs text-red-400">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{newCompanyError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full btn-premium grad-primary py-3 rounded-xl font-semibold hover:opacity-90 mt-2 text-white shadow-lg"
                  >
                    Register Company
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
