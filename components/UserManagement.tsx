
import React, { useState, useEffect } from 'react';
import { 
  UserPlusIcon, 
  EnvelopeIcon, 
  ShieldCheckIcon, 
  TrashIcon, 
  CheckCircleIcon,
  MagnifyingGlassIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
  ClipboardIcon
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
  Firestore
} from "firebase/firestore";

interface ManagedUser {
  id: string;
  email: string;
  role: UserRole;
  status: 'Active' | 'Pending';
  invitedAt: string;
}

interface UserManagementProps {
  isDarkMode: boolean;
  db: Firestore;
}

const UserManagement: React.FC<UserManagementProps> = ({ isDarkMode, db }) => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>(UserRole.OPERATOR);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [lastInvitedEmail, setLastInvitedEmail] = useState('');

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

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || isSubmitting) return;

    const emailKey = inviteEmail.toLowerCase().trim();
    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');
    
    try {
      const newUserData = {
        email: emailKey,
        role: inviteRole,
        status: 'Pending',
        invitedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "users", emailKey), newUserData, { merge: true });

      setLastInvitedEmail(emailKey);
      setInviteEmail('');
      setSuccessMsg(`Access granted for ${emailKey}. Notify the user to log in.`);
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
    if (!window.confirm(`Revoke access for ${email}?`)) return;
    try {
      await deleteDoc(doc(db, "users", email));
      setSuccessMsg("Access record deleted.");
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg("Failed to delete record.");
    }
  };

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
          
          <form onSubmit={handleInvite} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider ml-1">Gmail Address</label>
              <div className="relative group">
                <EnvelopeIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-indigo-600 transition-colors" />
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
              <div className="relative group">
                <ShieldCheckIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-indigo-600 transition-colors" />
                <select 
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as UserRole)}
                  disabled={isSubmitting}
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-dark-bg border border-transparent dark:border-dark-border rounded-2xl text-sm focus:bg-white dark:focus:bg-dark-surface focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/20 outline-none transition-all dark:text-slate-100 appearance-none"
                >
                  <option value={UserRole.OPERATOR}>Station Operator</option>
                  <option value={UserRole.ADMIN}>System Admin</option>
                </select>
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
          </form>
        </div>
      )}

      <div className="bg-white dark:bg-dark-surface rounded-[2rem] border border-gray-100 dark:border-dark-border shadow-sm overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-gray-50 dark:border-dark-border flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search whitelisted emails..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-dark-bg border-none rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 outline-none dark:text-slate-300"
            />
          </div>
          <div className="hidden sm:block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            {users.length} Database Records
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50 dark:bg-dark-bg/50 border-b border-gray-50 dark:border-dark-border">
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500">Identity</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500">Role</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500">Authorized On</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-dark-border">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm font-semibold text-gray-400">
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                      Syncing Access Lists...
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm font-semibold text-gray-400">
                    No authorized records found.
                  </td>
                </tr>
              ) : users.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors group">
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
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}>
                      {member.role}
                    </span>
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
