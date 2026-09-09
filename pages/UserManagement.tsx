import React, { useState, useEffect, useMemo } from 'react';
import { 
  UserPlusIcon, 
  EnvelopeIcon, 
  ShieldCheckIcon, 
  TrashIcon, 
  CheckCircleIcon, 
  MagnifyingGlassIcon, 
  ExclamationTriangleIcon, 
  PaperAirplaneIcon, 
  ClipboardIcon, 
  ChevronRightIcon, 
  ChevronLeftIcon,
  PencilSquareIcon,
  XMarkIcon,
  CheckIcon,
  AdjustmentsHorizontalIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import { UserRole } from '../types';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  Firestore,
  updateDoc
} from "firebase/firestore";
import CustomSelect from '../components/CustomSelect';
import SortableHeader from '../components/SortableHeader';
import { usePopup } from '../components/PopupContext';

export interface OperationsPageConfig {
  id: string;
  label: string;
  tag: string;
  desc: string;
}

export const OPERATIONS_PAGES_CONFIG: OperationsPageConfig[] = [
  { id: 'swapping-transactions', label: 'Swap Sessions', tag: 'Core Operations', desc: 'Real-time and historic battery swap transaction records' },
  { id: 'alert-drivers', label: 'Alert Drivers', tag: 'Daily Operations', desc: 'Driver notification ingestion, proactive swap triggers & fleet alerts' },
  { id: 'daily-inventory', label: 'Daily Inventory', tag: 'Daily Operations', desc: 'Daily station stock counts, audits & opening balance logs' },
  { id: 'battery-issues', label: 'Battery Issues', tag: 'Monitoring', desc: 'Issue ticketing, technician logs & pack defect tracking' },
  { id: 'alerts', label: 'Swap Alerts', tag: 'Monitoring', desc: 'Operational anomaly detection & low SoC swap breach monitors' },
  { id: 'battery-lookup', label: 'Battery Lookup', tag: 'Monitoring', desc: 'Individual battery asset diagnostic, telemetry & history lookup' },
  { id: 'ghosts', label: 'Ghost Batteries', tag: 'Monitoring', desc: 'Inactive and missing pack detection & recovery monitoring' }
];

export const DEFAULT_OPERATIONS_PAGE_IDS = OPERATIONS_PAGES_CONFIG.map(p => p.id);

interface ManagedUser {
  id: string;
  email: string;
  role: UserRole;
  allowedPages?: string[];
  status: 'Active' | 'Pending';
  invitedAt: string;
}

const SkeletonRow = () => (
  <tr className="animate-pulse">
    <td className="px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-zinc-200 dark:bg-zinc-800"></div>
        <div className="flex-1">
          <div className="h-3 w-20 bg-zinc-200 dark:bg-zinc-800 rounded mb-1"></div>
          <div className="h-2 w-32 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
        </div>
      </div>
    </td>
    <td className="px-6 py-4"><div className="h-5 w-16 bg-zinc-200 dark:bg-zinc-800 rounded"></div></td>
    <td className="px-6 py-4"><div className="h-4 w-12 bg-zinc-200 dark:bg-zinc-800 rounded"></div></td>
    <td className="px-6 py-4"><div className="h-3 w-24 bg-zinc-200 dark:bg-zinc-800 rounded"></div></td>
    <td className="px-6 py-4 text-right"><div className="h-4 w-4 bg-zinc-200 dark:bg-zinc-800 rounded ml-auto"></div></td>
  </tr>
);

const FillerRows = ({ count, colSpan }: { count: number, colSpan: number }) => {
  if (count <= 0) return null;
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={`empty-${i}`} className="h-16">
          <td colSpan={colSpan} className="px-6 py-4">&nbsp;</td>
        </tr>
      ))}
    </>
  );
};

interface UserManagementProps {
  isDarkMode: boolean;
  db: Firestore;
}

const UserManagement: React.FC<UserManagementProps> = ({ isDarkMode, db }) => {
  const { showAlert, showConfirm } = usePopup();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>(UserRole.OPERATIONS);
  const [invitePages, setInvitePages] = useState<string[]>(DEFAULT_OPERATIONS_PAGE_IDS);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [lastInvitedEmail, setLastInvitedEmail] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | 'none' }>({ key: 'invitedAt', direction: 'desc' });

  // Modal state for editing existing user's role and page access
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editRole, setEditRole] = useState<UserRole>(UserRole.OPERATIONS);
  const [editAllowedPages, setEditAllowedPages] = useState<string[]>(DEFAULT_OPERATIONS_PAGE_IDS);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Options for the Access Tier CustomSelect
  const roleOptions = [
    { value: UserRole.OPERATIONS, label: 'Operations Role (Dedicated Access)' },
    { value: UserRole.OPERATOR, label: 'Station Operator' },
    { value: UserRole.ADMIN, label: 'System Admin (Full Access)' }
  ];

  useEffect(() => {
    const usersQuery = query(collection(db, "users"), orderBy("invitedAt", "desc"));
    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      const usersList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ManagedUser[];
      setUsers(usersList);
      setLoading(false);
    }, (error) => {
      console.error("Firestore error:", error);
      setErrorMsg("Permission sync error. Access might be restricted.");
      setLoading(false);
    });
    return () => unsubscribe();
  }, [db]);

  const handleRoleChange = (newRole: UserRole) => {
    setInviteRole(newRole);
    if (newRole === UserRole.OPERATIONS) {
      setInvitePages(DEFAULT_OPERATIONS_PAGE_IDS);
    }
  };

  const toggleInvitePage = (pageId: string) => {
    setInvitePages(prev => 
      prev.includes(pageId) ? prev.filter(p => p !== pageId) : [...prev, pageId]
    );
  };

  const handleOpenEditModal = (userItem: ManagedUser) => {
    setEditingUser(userItem);
    setEditRole(userItem.role);
    setEditAllowedPages(userItem.allowedPages && userItem.allowedPages.length > 0 ? userItem.allowedPages : DEFAULT_OPERATIONS_PAGE_IDS);
  };

  const toggleEditPage = (pageId: string) => {
    setEditAllowedPages(prev => 
      prev.includes(pageId) ? prev.filter(p => p !== pageId) : [...prev, pageId]
    );
  };

  const handleSaveUserPermissions = async () => {
    if (!editingUser) return;
    setIsSavingEdit(true);
    setErrorMsg('');
    try {
      const userRef = doc(db, "users", editingUser.email);
      const updates: any = {
        role: editRole,
      };
      if (editRole === UserRole.OPERATIONS) {
        updates.allowedPages = editAllowedPages;
      } else if (editRole === UserRole.ADMIN) {
        updates.allowedPages = null;
      }
      await updateDoc(userRef, updates);
      setSuccessMsg(`Permissions updated for ${editingUser.email}`);
      setEditingUser(null);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      console.error("Failed to update user:", err);
      setErrorMsg(err.message || "Failed to update permissions.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || isSubmitting) return;

    const emailKey = inviteEmail.toLowerCase().trim();
    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');
    
    try {
      const newUserData: any = {
        email: emailKey,
        role: inviteRole,
        status: 'Pending',
        invitedAt: new Date().toISOString()
      };

      if (inviteRole === UserRole.OPERATIONS) {
        newUserData.allowedPages = invitePages;
      }

      await setDoc(doc(db, "users", emailKey), newUserData, { merge: true });

      setLastInvitedEmail(emailKey);
      setInviteEmail('');
      setSuccessMsg(`Access granted for ${emailKey} with ${inviteRole} permissions.`);
      setShowInviteForm(false);
    } catch (err: any) {
      console.error("Failed to add user:", err);
      setErrorMsg(err.message || "Failed to add authorization record.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getInviteLink = () => {
    const url = new URL(window.location.href);
    return url.origin + url.pathname;
  };

  const copyInviteLink = () => {
    const link = getInviteLink();
    navigator.clipboard.writeText(link);
    setSuccessMsg("Invite link copied to clipboard!");
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const sendInviteEmail = (email: string) => {
    const link = getInviteLink();
    const subject = encodeURIComponent("Access Authorized: BD Ops Dashboard");
    const body = encodeURIComponent(
      `Hello,\n\nYou have been authorized as a ${inviteRole} on the BD Ops Dashboard.\n\nYou can now log in and setup your account using your Google/Gmail account at this link:\n${link}\n\nBest regards,\nOperations Team`
    );
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  };

  const removeUser = async (email: string) => {
    if (email === "ahmed.evolt@gmail.com") {
      setErrorMsg("Master Admin cannot be removed.");
      return;
    }
    const confirmed = await showConfirm(`Revoke access for ${email}?`);
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, "users", email));
      setSuccessMsg("Access record deleted.");
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg("Failed to delete record.");
    }
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        if (prev.direction === 'desc') return { key, direction: 'none' };
        return { key, direction: 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let base = users.filter(user => 
      user.email.toLowerCase().includes(q) ||
      user.role.toLowerCase().includes(q)
    );

    if (sortConfig.direction !== 'none') {
      base.sort((a, b) => {
        let aVal: any = a[sortConfig.key as keyof ManagedUser];
        let bVal: any = b[sortConfig.key as keyof ManagedUser];

        if (aVal === undefined || aVal === null) aVal = "";
        if (bVal === undefined || bVal === null) bVal = "";

        if (typeof aVal === "string") aVal = aVal.toLowerCase();
        if (typeof bVal === "string") bVal = bVal.toLowerCase();

        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return base;
  }, [users, searchQuery, sortConfig]);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedData = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-6 lg:space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold font-heading text-slate-900 dark:text-white">Authorized Access</h2>
          <p className="font-semibold text-gray-400 dark:text-slate-400">Manage Gmail whitelists and operator permissions</p>
        </div>
        <button 
          onClick={() => {
            setShowInviteForm(!showInviteForm);
            setLastInvitedEmail('');
            setSuccessMsg('');
            setErrorMsg('');
          }}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-bold font-button shadow-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all"
        >
          <UserPlusIcon className="w-5 h-5" />
          {showInviteForm ? 'Cancel' : 'Add Account'}
        </button>
      </div>

      {(successMsg || lastInvitedEmail) && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-2xl border border-green-100 dark:border-green-900/30">
          <div className="flex items-center gap-3 font-bold text-sm">
            <CheckCircleIcon className="w-5 h-5" />
            {successMsg || "Account whitelisted successfully."}
          </div>
          <div className="flex gap-2">
            <button 
              onClick={copyInviteLink}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-dark-bg text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30 rounded-xl text-xs font-bold hover:shadow-md transition-all"
            >
              <ClipboardIcon className="w-4 h-4" />
              Copy Link
            </button>
            {lastInvitedEmail && (
              <button 
                onClick={() => sendInviteEmail(lastInvitedEmail)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-md"
              >
                <PaperAirplaneIcon className="w-4 h-4" />
                Email User
              </button>
            )}
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-2xl border border-red-100 dark:border-red-900/30 font-bold text-sm">
          <ExclamationTriangleIcon className="w-5 h-5" />
          {errorMsg}
        </div>
      )}

      {showInviteForm && (
        <div className="bg-white dark:bg-dark-surface p-6 sm:p-8 rounded-[2.5rem] border border-indigo-100 dark:border-indigo-900/30 shadow-xl shadow-indigo-100/10 dark:shadow-none animate-in slide-in-from-top duration-300">
          <h3 className="text-xl font-bold font-heading mb-2 text-slate-900 dark:text-white">New Permission</h3>
          <p className="text-sm text-gray-400 dark:text-slate-500 mb-8 font-semibold italic">Unauthorized users will be blocked from access.</p>
          
          <form onSubmit={handleInvite} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider ml-1">Gmail Address</label>
                <div className="relative group">
                  <EnvelopeIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-indigo-600 transition-colors z-10" />
                  <input 
                    type="email" 
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="name@gmail.com"
                    disabled={isSubmitting}
                    className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-dark-bg border border-transparent dark:border-dark-border rounded-2xl text-sm focus:bg-white dark:focus:bg-dark-surface focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/20 outline-none transition-all dark:text-slate-100"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider ml-1">Access Tier</label>
                <div className="relative">
                  <CustomSelect
                    options={roleOptions}
                    value={inviteRole}
                    onChange={(val) => handleRoleChange(val as UserRole)}
                    className="!bg-gray-50 dark:!bg-dark-bg !border-transparent dark:!border-dark-border !py-4 !rounded-2xl shadow-none"
                  />
                </div>
              </div>
              <div className="flex items-end">
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold font-button hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 dark:shadow-none flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>Whitelist Gmail</>
                  )}
                </button>
              </div>
            </div>

            {/* Granular Page Access Checklist for Operations Role */}
            {inviteRole === UserRole.OPERATIONS && (
              <div className="p-5 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                      <AdjustmentsHorizontalIcon className="w-4 h-4" />
                      Operations Page Access ({invitePages.length}/{OPERATIONS_PAGES_CONFIG.length} Allowed)
                    </span>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Specify which operations pages this user can view and manage:
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setInvitePages(DEFAULT_OPERATIONS_PAGE_IDS)}
                      className="px-3 py-1 bg-white dark:bg-zinc-800 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs font-bold border border-emerald-200 dark:border-emerald-800/40 hover:bg-emerald-50 transition-all"
                    >
                      Select All 7
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvitePages([])}
                      className="px-3 py-1 bg-white dark:bg-zinc-800 text-slate-600 dark:text-slate-400 rounded-lg text-xs font-bold border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 transition-all"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 pt-2">
                  {OPERATIONS_PAGES_CONFIG.map(page => {
                    const isChecked = invitePages.includes(page.id);
                    return (
                      <button
                        type="button"
                        key={page.id}
                        onClick={() => toggleInvitePage(page.id)}
                        className={`text-left p-3 rounded-xl border transition-all flex items-start gap-2.5 ${
                          isChecked 
                            ? 'bg-white dark:bg-zinc-900 border-emerald-500/60 shadow-sm text-slate-900 dark:text-white' 
                            : 'bg-white/50 dark:bg-zinc-900/50 border-slate-200 dark:border-zinc-800 opacity-60 text-slate-500'
                        }`}
                      >
                        <div className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                          isChecked ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 dark:border-zinc-700'
                        }`}>
                          {isChecked && <CheckIcon className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold leading-tight flex items-center gap-1.5">
                            {page.label}
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-zinc-800 text-slate-400 font-semibold">{page.tag}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{page.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </form>
        </div>
      )}

      <div className="bg-white dark:bg-dark-surface rounded-[2rem] border border-gray-100 dark:border-dark-border shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 sm:p-6 border-b border-gray-50 dark:border-dark-border flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search whitelisted emails..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-dark-bg border-none rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 outline-none dark:text-slate-300"
            />
          </div>
          <div className="hidden sm:block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            {filteredUsers.length} Database Records
          </div>
        </div>

        <div className="overflow-auto scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
          <table className="w-full text-left">
            <thead className="bg-gray-50/95 dark:bg-dark-bg/95 border-b border-gray-50 dark:border-dark-border sticky top-0 z-10 shadow-sm">
              <tr>
                <SortableHeader label="Identity" sortKey="email" currentSort={sortConfig} onSort={handleSort} />
                <SortableHeader label="Role" sortKey="role" currentSort={sortConfig} onSort={handleSort} />
                <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500">Page Access</th>
                <SortableHeader label="Status" sortKey="status" currentSort={sortConfig} onSort={handleSort} />
                <SortableHeader label="Authorized On" sortKey="invitedAt" currentSort={sortConfig} onSort={handleSort} />
                <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-dark-border">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm font-semibold text-gray-400">
                    No authorized records found.
                  </td>
                </tr>
              ) : (
                <>{paginatedData.map((member) => (
                <tr key={member.id} className="h-16 hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                        {member.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 dark:text-white text-sm leading-tight">{member.email.split('@')[0]}</span>
                        <span className="text-[10px] text-gray-400 dark:text-slate-500 font-bold">{member.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase ${
                      member.role === UserRole.ADMIN 
                        ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' 
                        : member.role === UserRole.OPERATIONS
                        ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}>
                      {member.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {member.role === UserRole.ADMIN ? (
                      <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-1 rounded-md">
                        Full System (All Pages)
                      </span>
                    ) : member.role === UserRole.OPERATIONS ? (
                      <div className="flex items-center gap-1.5 flex-wrap max-w-xs">
                        <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md">
                          {(member.allowedPages && member.allowedPages.length > 0 ? member.allowedPages.length : DEFAULT_OPERATIONS_PAGE_IDS.length)} Pages
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                          {(member.allowedPages && member.allowedPages.length > 0 ? member.allowedPages : DEFAULT_OPERATIONS_PAGE_IDS)
                            .slice(0, 2)
                            .map(p => OPERATIONS_PAGES_CONFIG.find(c => c.id === p)?.label || p)
                            .join(', ')}
                          {(member.allowedPages || DEFAULT_OPERATIONS_PAGE_IDS).length > 2 && '...'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        Station Standard
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${member.status === 'Active' ? 'bg-green-500' : 'bg-orange-400'}`}></div>
                      <span className={`text-[10px] font-bold uppercase ${member.status === 'Active' ? 'text-green-600 dark:text-green-400' : 'text-orange-500 dark:text-orange-400'}`}>
                        {member.status || 'Pending'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs font-semibold text-gray-400 dark:text-slate-500">
                    {new Date(member.invitedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleOpenEditModal(member)}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-dark-surface rounded-lg transition-all"
                        title="Edit Role & Permissions"
                      >
                        <PencilSquareIcon className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => sendInviteEmail(member.email)}
                        className="p-1.5 text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-white dark:hover:bg-dark-surface rounded-lg transition-all"
                        title="Resend Invite"
                      >
                        <PaperAirplaneIcon className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => removeUser(member.email)}
                        className={`p-1.5 text-gray-400 hover:text-red-500 hover:bg-white dark:hover:bg-dark-surface rounded-lg transition-all ${member.email === 'ahmed.evolt@gmail.com' ? 'hidden' : ''}`}
                        title="Revoke Access"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 text-gray-400 hover:bg-white dark:hover:bg-dark-surface rounded-lg">
                        <ChevronRightIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              <FillerRows count={itemsPerPage - paginatedData.length} colSpan={6} />
              </>
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 0 && (
          <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-950/30 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between sticky bottom-0 z-10">
            <div className="flex items-center gap-4">
               <div className="text-xs font-bold text-zinc-500">Page {currentPage} of {totalPages}</div>
               <div className="w-32">
                 <CustomSelect 
                   options={[
                     { value: '10', label: '10 rows' },
                     { value: '20', label: '20 rows' },
                     { value: '50', label: '50 rows' }
                   ]}
                   value={String(itemsPerPage)}
                   onChange={(val) => { setItemsPerPage(Number(val)); setCurrentPage(1); }}
                   position="top"
                 />
               </div>
            </div>
            <div className="flex gap-2">
              <button 
                disabled={currentPage === 1} 
                onClick={() => setCurrentPage(p => p - 1)} 
                className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              <button 
                disabled={currentPage === totalPages} 
                onClick={() => setCurrentPage(p => p + 1)} 
                className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit User Role & Page Permissions Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4">
              <div>
                <h3 className="text-xl font-bold font-heading text-slate-900 dark:text-white">Edit Role & Page Access</h3>
                <p className="text-xs text-slate-400 mt-1 font-mono">{editingUser.email}</p>
              </div>
              <button 
                onClick={() => setEditingUser(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider ml-1">Assigned Role</label>
                <CustomSelect
                  options={roleOptions}
                  value={editRole}
                  onChange={(val) => {
                    const newR = val as UserRole;
                    setEditRole(newR);
                    if (newR === UserRole.OPERATIONS && editAllowedPages.length === 0) {
                      setEditAllowedPages(DEFAULT_OPERATIONS_PAGE_IDS);
                    }
                  }}
                  className="!bg-gray-50 dark:!bg-zinc-800 !py-3.5 !rounded-2xl shadow-none"
                />
              </div>

              {(editRole === UserRole.OPERATIONS || editRole === UserRole.OPERATOR) && (
                <div className="p-4 bg-slate-50 dark:bg-zinc-950/60 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <AdjustmentsHorizontalIcon className="w-4 h-4 text-emerald-600" />
                        Page Access Checklist ({editAllowedPages.length}/{OPERATIONS_PAGES_CONFIG.length} Allowed)
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">Toggle which pages this account has access to:</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditAllowedPages(DEFAULT_OPERATIONS_PAGE_IDS)}
                        className="px-2.5 py-1 bg-white dark:bg-zinc-800 text-emerald-700 dark:text-emerald-300 rounded-lg text-[11px] font-bold border border-slate-200 dark:border-zinc-700 hover:bg-emerald-50 transition-all"
                      >
                        All 7 Pages
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditAllowedPages([])}
                        className="px-2.5 py-1 bg-white dark:bg-zinc-800 text-slate-500 dark:text-slate-400 rounded-lg text-[11px] font-bold border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 transition-all"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {OPERATIONS_PAGES_CONFIG.map(page => {
                      const isChecked = editAllowedPages.includes(page.id);
                      return (
                        <button
                          type="button"
                          key={page.id}
                          onClick={() => toggleEditPage(page.id)}
                          className={`text-left p-3 rounded-xl border transition-all flex items-start gap-2.5 ${
                            isChecked 
                              ? 'bg-white dark:bg-zinc-900 border-emerald-500 text-slate-900 dark:text-white shadow-sm' 
                              : 'bg-white/50 dark:bg-zinc-900/40 border-slate-200 dark:border-zinc-800 opacity-60 text-slate-500'
                          }`}
                        >
                          <div className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                            isChecked ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 dark:border-zinc-700'
                          }`}>
                            {isChecked && <CheckIcon className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold leading-tight flex items-center gap-1.5">
                              {page.label}
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-400 font-semibold">{page.tag}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{page.desc}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {editRole === UserRole.ADMIN && (
                <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 text-xs text-indigo-700 dark:text-indigo-300 font-medium">
                  System Admins have unrestricted access to all pages, analytics, system management, and settings.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingEdit}
                onClick={handleSaveUserPermissions}
                className="px-6 py-2.5 rounded-xl font-bold text-xs bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg shadow-indigo-100 dark:shadow-none"
              >
                {isSavingEdit ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>Save Permissions</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;