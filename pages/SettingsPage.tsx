
import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, collection, getDocs, writeBatch, Firestore } from "firebase/firestore";
import { User, updateProfile, updatePassword, signOut, getAuth, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserCircleIcon, ShieldCheckIcon, PaintBrushIcon, ComputerDesktopIcon, DevicePhoneMobileIcon, MoonIcon, SunIcon, CameraIcon, ArrowRightOnRectangleIcon, KeyIcon, ClockIcon, CheckCircleIcon, PencilIcon, CalendarDaysIcon, CircleStackIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, ExclamationTriangleIcon, EyeIcon, EyeSlashIcon, ListBulletIcon } from '@heroicons/react/24/outline';
import CustomSelect from '../components/CustomSelect';
import { NAVIGATION } from '../constants';
import { UserRole } from '../types';
import { usePopup } from '../components/PopupContext';

interface SettingsPageProps { db: Firestore; isDarkMode: boolean; onToggleTheme: () => void; user: User; }
const COLLECTIONS_TO_BACKUP = ['batteries_master', 'drivers_master', 'users', 'battery_issues', 'battery_repair_logs', 'driver_comments', 'driver_repairs', 'plant_dispatch_register', 'quality_watchlist'];

// Cycle-detecting Firestore Data Sanitizer
const sanitizeFirestoreData = (data: any, seen = new WeakSet()): any => {
  if (data === null || data === undefined) return data;
  
  if (typeof data !== 'object') return data;

  // Prevent circular recursion
  if (seen.has(data)) return "[Circular Reference]";
  seen.add(data);

  // 1. Handle Firebase Timestamp (has toDate method)
  if (typeof data.toDate === 'function') {
    return data.toDate().toISOString();
  }

  // 2. Handle Firebase DocumentReference 
  if (data.path && typeof data.path === 'string' && data.id && typeof data.id === 'string') {
    return { __ref: data.path };
  }

  // 3. Handle Arrays
  if (Array.isArray(data)) {
    return data.map(item => sanitizeFirestoreData(item, seen));
  }

  // 4. Handle Plain Objects (prevent internal SDK object stringification)
  const sanitized: any = {};
  for (const [key, value] of Object.entries(data)) {
    // Skip internal properties often found in circular Firebase structures
    if (key.startsWith('_') || key === 'firestore' || key === 'auth' || key === 'converter' || key === 'app') continue;
    sanitized[key] = sanitizeFirestoreData(value, seen);
  }
  return sanitized;
};

const SettingsPage: React.FC<SettingsPageProps> = ({ db, isDarkMode, onToggleTheme, user }) => {
  const { showAlert, showConfirm } = usePopup();
  const [activeSection, setActiveSection] = useState<'account' | 'security' | 'preferences' | 'data'>('account');
  const [isLoading, setIsLoading] = useState(false);
  const [fetchingProfile, setFetchingProfile] = useState(true);
  const [successMsg, setSuccessMsg] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [phoneNumber, setPhoneNumber] = useState(''); 
  const [photoURL, setPhotoURL] = useState(user.photoURL || '');
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [originalProfile, setOriginalProfile] = useState({ name: '', phone: '', photo: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY');
  const [timeFormat, setTimeFormat] = useState('12h');
  const [landingPage, setLandingPage] = useState('dashboard');
  const [hiddenTabs, setHiddenTabs] = useState<string[]>([]);
  const [userRole, setUserRole] = useState<UserRole>(UserRole.OPERATOR);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user.displayName) setDisplayName(user.displayName);
    if (user.photoURL) setPhotoURL(user.photoURL);
    const fetchUserData = async () => {
      setFetchingProfile(true);
      try {
        const userDoc = await getDoc(doc(db, "users", user.email!.toLowerCase()));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.role) setUserRole(data.role as UserRole);
          if (data.preferences) { 
            setLandingPage(data.preferences.landingPage || 'dashboard'); 
            setDateFormat(data.preferences.dateFormat || 'DD/MM/YYYY'); 
            setTimeFormat(data.preferences.timeFormat || '12h'); 
            setHiddenTabs(data.preferences.hiddenTabs || []);
          }
          if (data.phoneNumber) setPhoneNumber(data.phoneNumber);
          const profileData = { name: user.displayName || '', phone: data.phoneNumber || '', photo: user.photoURL || '' };
          setOriginalProfile(profileData);
        } else { setOriginalProfile({ name: user.displayName || '', phone: '', photo: user.photoURL || '' }); }
      } catch (err) { console.error("Error fetching user data", err); } finally { setFetchingProfile(false); }
    };
    fetchUserData();
  }, [user, db]);

  const toggleEditMode = () => { if (isEditingProfile) { setDisplayName(originalProfile.name); setPhoneNumber(originalProfile.phone); setPhotoURL(originalProfile.photo); setPendingPhotoFile(null); setIsEditingProfile(false); } else { setIsEditingProfile(true); } };
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files[0]) { const file = e.target.files[0]; const previewUrl = URL.createObjectURL(file); setPhotoURL(previewUrl); setPendingPhotoFile(file); } };
  const handleProfileUpdate = async () => { 
    setIsLoading(true); 
    let finalPhotoURL = photoURL; 
    try { 
      if (pendingPhotoFile) { 
        const storageRef = ref(storage, `users/${user.uid}/profile_${Date.now()}`); 
        try { 
          const snapshot = await uploadBytes(storageRef, pendingPhotoFile); 
          finalPhotoURL = await getDownloadURL(snapshot.ref); 
        } catch (uploadErr) { 
          console.error("Image upload failed:", uploadErr); 
          await showAlert("Failed to upload image.", "error"); 
          finalPhotoURL = originalProfile.photo; 
        } 
      } 
      await updateProfile(user, { displayName: displayName, photoURL: finalPhotoURL }); 
      
      const userPath = `users/${user.email!.toLowerCase()}`;
      try {
        await setDoc(doc(db, "users", user.email!.toLowerCase()), { phoneNumber: phoneNumber }, { merge: true }); 
      } catch (firestoreErr) {
        handleFirestoreError(firestoreErr, OperationType.WRITE, userPath);
      }
      
      setOriginalProfile({ name: displayName, phone: phoneNumber, photo: finalPhotoURL }); 
      setPhotoURL(finalPhotoURL); 
      setPendingPhotoFile(null); 
      setSuccessMsg('Profile updated successfully!'); 
      setIsEditingProfile(false); 
      setTimeout(() => setSuccessMsg(''), 3000); 
    } catch (err: any) { 
      console.error(err); 
      await showAlert("Failed to update profile: " + err.message, "error"); 
    } finally { 
      setIsLoading(false); 
    } 
  };

  const handleChangePassword = async () => { 
    if (!currentPassword) { 
      await showAlert("Please enter your current password.", "error"); 
      return; 
    } 
    if (newPassword !== confirmPassword) { 
      await showAlert("New passwords do not match.", "error"); 
      return; 
    } 
    if (newPassword.length < 6) { 
      await showAlert("Password should be at least 6 characters.", "error"); 
      return; 
    } 
    setIsLoading(true); 
    try { 
      const credential = EmailAuthProvider.credential(user.email!, currentPassword); 
      await reauthenticateWithCredential(user, credential); 
      await updatePassword(user, newPassword); 
      setSuccessMsg('Password changed successfully!'); 
      setCurrentPassword(''); 
      setNewPassword(''); 
      setConfirmPassword(''); 
      setTimeout(() => setSuccessMsg(''), 3000); 
    } catch (err: any) { 
      console.error(err); 
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') { 
        await showAlert("Incorrect current password.", "error"); 
      } else { 
        await showAlert("Error changing password: " + err.message, "error"); 
      } 
    } finally { 
      setIsLoading(false); 
    } 
  };

  const handleSavePreferences = async () => { 
    setIsLoading(true); 
    try { 
      await setDoc(doc(db, "users", user.email!.toLowerCase()), { preferences: { dateFormat, timeFormat, landingPage, hiddenTabs } }, { merge: true }); 
      setSuccessMsg('Preferences saved!'); 
      setTimeout(() => setSuccessMsg(''), 3000); 
    } catch (err) { 
      console.error(err); 
      await showAlert("Failed to save preferences.", "error"); 
    } finally { 
      setIsLoading(false); 
    } 
  };

  const toggleTabVisibility = (tabId: string) => {
    setHiddenTabs(prev => 
      prev.includes(tabId) 
        ? prev.filter(id => id !== tabId) 
        : [...prev, tabId]
    );
  };

  const handleLogoutAll = async () => { 
    const confirmed = await showConfirm("Are you sure you want to log out?");
    if (confirmed) { 
      await signOut(getAuth()); 
    } 
  };
  
  const exportData = async () => { 
    setIsExporting(true); 
    try { 
      const backupData: Record<string, any> = { 
        metadata: { timestamp: new Date().toISOString(), exportedBy: user.email, version: "1.2" }, 
        collections: {} 
      }; 
      
      for (const colName of COLLECTIONS_TO_BACKUP) { 
        const snapshot = await getDocs(collection(db, colName)); 
        backupData.collections[colName] = snapshot.docs.map(d => ({ 
          _id: d.id, 
          ...sanitizeFirestoreData(d.data()) 
        })); 
      } 
      
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' }); 
      const url = URL.createObjectURL(blob); 
      const link = document.createElement('a'); 
      link.href = url; 
      link.download = `bd_ops_backup_${new Date().toISOString().split('T')[0]}.json`; 
      document.body.appendChild(link); 
      link.click(); 
      document.body.removeChild(link); 
      setSuccessMsg("Export completed successfully!"); 
      setTimeout(() => setSuccessMsg(''), 3000); 
    } catch (err) { 
      console.error("Export failed", err); 
      await showAlert("Export failed: " + (err as any).message, "error"); 
    } finally { 
      setIsExporting(false); 
    } 
  };

  const importData = async (e: React.ChangeEvent<HTMLInputElement>) => { 
    if (!e.target.files || !e.target.files[0]) return; 
    const file = e.target.files[0]; 
    const confirmed = await showConfirm("WARNING: Importing data will overwrite existing records. Are you sure?");
    if (!confirmed) { 
      e.target.value = ''; 
      return; 
    } 
    setIsImporting(true); 
    const reader = new FileReader(); 
    reader.onload = async (event) => { 
      try { 
        const json = JSON.parse(event.target?.result as string); 
        if (!json.collections) throw new Error("Invalid backup file format"); 
        const batchSize = 400; 
        let batch = writeBatch(db); 
        let opCount = 0; 
        for (const colName of Object.keys(json.collections)) { 
          const docs = json.collections[colName]; 
          for (const docData of docs) { 
            const { _id, ...data } = docData; 
            if (!_id) continue; 
            const ref = doc(db, colName, _id); 
            batch.set(ref, data, { merge: true }); 
            opCount++; 
            if (opCount >= batchSize) { 
              await batch.commit(); 
              batch = writeBatch(db); 
              opCount = 0; 
            } 
          } 
        } 
        if (opCount > 0) { 
          await batch.commit(); 
        } 
        setSuccessMsg("Import completed successfully!"); 
        setTimeout(() => setSuccessMsg(''), 3000); 
      } catch (err) { 
        console.error("Import failed", err); 
        await showAlert("Import failed: " + (err as any).message, "error"); 
      } finally { 
        setIsImporting(false); 
        if (importInputRef.current) importInputRef.current.value = ''; 
      } 
    }; 
    reader.readAsText(file); 
  };
  const menuItems = [ { id: 'account', label: 'Profile Information', icon: UserCircleIcon }, { id: 'security', label: 'Security & Login', icon: ShieldCheckIcon }, { id: 'preferences', label: 'App Preferences', icon: PaintBrushIcon }, { id: 'data', label: 'Data Management', icon: CircleStackIcon } ];

  return (
    <div className="space-y-6 lg:space-y-8 animate-in fade-in duration-500 pb-20">
      <div><h2 className="text-3xl font-bold font-heading text-zinc-900 dark:text-white mb-2">Settings</h2><p className="font-semibold text-zinc-500 dark:text-zinc-400">Manage your account and application preferences.</p></div>
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="w-full lg:w-72 flex-shrink-0 space-y-2">{menuItems.map((item) => (<button key={item.id} onClick={() => setActiveSection(item.id as any)} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all ${activeSection === item.id ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200/50 dark:shadow-none' : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}><item.icon className="w-5 h-5" />{item.label}</button>))}</div>
        <div className="flex-1">
          {successMsg && (<div className="mb-6 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-sm font-bold flex items-center gap-2 animate-in slide-in-from-top-2"><CheckCircleIcon className="w-5 h-5" />{successMsg}</div>)}
          
          {activeSection === 'account' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 border border-zinc-100 dark:border-zinc-800 shadow-sm">
                <div className="flex justify-between items-start mb-6"><h3 className="text-xl font-bold text-zinc-900 dark:text-white">Public Profile</h3>{!isEditingProfile ? (<button onClick={toggleEditMode} className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-xl text-xs font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"><PencilIcon className="w-4 h-4" /> Edit Profile</button>) : (<div className="flex gap-2"><button onClick={toggleEditMode} className="px-4 py-2 text-zinc-500 dark:text-zinc-400 text-xs font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all">Cancel</button><button onClick={handleProfileUpdate} disabled={isLoading} className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-md disabled:opacity-50">{isLoading ? 'Saving...' : 'Save Changes'}</button></div>)}</div>
                
                {fetchingProfile ? (
                  <div className="flex flex-col md:flex-row items-center md:items-start gap-8 mb-8 animate-pulse">
                    <div className="w-32 h-32 rounded-full bg-zinc-200 dark:bg-zinc-800"></div>
                    <div className="flex-1 w-full space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="h-10 bg-zinc-200 dark:bg-zinc-800 rounded-xl"></div>
                        <div className="h-10 bg-zinc-200 dark:bg-zinc-800 rounded-xl"></div>
                      </div>
                      <div className="h-10 bg-zinc-200 dark:bg-zinc-800 rounded-xl"></div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col md:flex-row items-center md:items-start gap-8 mb-8">
                    <div className="relative group"><div className={`w-32 h-32 rounded-full overflow-hidden border-4 ${isEditingProfile ? 'border-indigo-100 dark:border-indigo-900/30' : 'border-zinc-50 dark:border-zinc-800'} shadow-lg transition-all`}>{photoURL ? (<img src={photoURL} alt="Profile" className="w-full h-full object-cover" />) : (<div className="w-full h-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-4xl font-bold text-indigo-600 dark:text-indigo-400">{displayName ? displayName.charAt(0).toUpperCase() : 'U'}</div>)}</div>{isEditingProfile && (<><button onClick={() => fileInputRef.current?.click()} className="absolute bottom-0 right-0 p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg hover:bg-indigo-700 transition-all z-10" title="Upload new photo"><CameraIcon className="w-5 h-5" /></button><input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handlePhotoSelect} /></>)}</div>
                    <div className="flex-1 w-full space-y-4"><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div className="space-y-2"><label className="text-xs font-bold uppercase text-zinc-500">Full Name</label><input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={!isEditingProfile} className={`w-full px-4 py-3 rounded-xl border-none font-bold text-zinc-900 dark:text-white outline-none transition-all ${isEditingProfile ? 'bg-zinc-50 dark:bg-zinc-950 focus:ring-2 focus:ring-indigo-500/20' : 'bg-transparent pl-0'}`} /></div><div className="space-y-2"><label className="text-xs font-bold uppercase text-zinc-500">Phone Number</label><input type="text" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} disabled={!isEditingProfile} placeholder="+91 00000 00000" className={`w-full px-4 py-3 rounded-xl border-none font-bold text-zinc-900 dark:text-white outline-none transition-all ${isEditingProfile ? 'bg-zinc-50 dark:bg-zinc-950 focus:ring-2 focus:ring-indigo-500/20' : 'bg-transparent pl-0'}`} /></div></div><div className="space-y-2"><label className="text-xs font-bold uppercase text-zinc-500">Email Address</label><div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-zinc-500 dark:text-zinc-400 font-bold cursor-not-allowed ${isEditingProfile ? 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800' : 'bg-zinc-50/50 dark:bg-zinc-900/50 border-transparent px-0'}`}><span className="flex-1">{user.email}</span><span className="text-[10px] uppercase bg-zinc-200 dark:bg-zinc-800 px-2 py-1 rounded">Verified</span></div>{isEditingProfile && (<p className="text-[10px] text-zinc-400 font-medium px-1">Email cannot be changed directly.</p>)}</div></div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSection === 'security' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 border border-zinc-100 dark:border-zinc-800 shadow-sm"><h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-6 flex items-center gap-2"><KeyIcon className="w-6 h-6 text-zinc-400" /> Change Password</h3><div className="space-y-6 mb-6"><div className="space-y-2"><label className="text-xs font-bold uppercase text-zinc-500">Current Password</label><input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-none font-bold text-zinc-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 outline-none" placeholder="Enter current password" /></div><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div className="space-y-2"><label className="text-xs font-bold uppercase text-zinc-500">New Password</label><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-none font-bold text-zinc-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 outline-none" placeholder="Min. 6 chars" /></div><div className="space-y-2"><label className="text-xs font-bold uppercase text-zinc-500">Confirm Password</label><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-none font-bold text-zinc-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 outline-none" placeholder="Re-enter password" /></div></div></div><div className="flex justify-end"><button onClick={handleChangePassword} disabled={!currentPassword || !newPassword || isLoading} className="px-6 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl font-bold hover:shadow-lg transition-all disabled:opacity-50">Update Password</button></div></div>
              <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 border border-zinc-100 dark:border-zinc-800 shadow-sm"><h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-6 flex items-center gap-2"><ComputerDesktopIcon className="w-6 h-6 text-zinc-400" /> Active Sessions</h3><div className="space-y-4 mb-8"><div className="flex items-center gap-4 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30"><div className="p-3 bg-white dark:bg-zinc-800 rounded-xl shadow-sm text-emerald-600 dark:text-emerald-400"><ComputerDesktopIcon className="w-6 h-6" /></div><div className="flex-1"><div className="flex justify-between items-center mb-1"><span className="text-sm font-bold text-zinc-900 dark:text-white">This Device</span><span className="text-[10px] font-bold uppercase bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 rounded-md">Active</span></div><p className="text-xs text-zinc-500 font-medium flex items-center gap-2"><ClockIcon className="w-3 h-3" /> Last login: {new Date(user.metadata.lastSignInTime || Date.now()).toLocaleString()}</p></div></div></div><div className="pt-6 border-t border-zinc-100 dark:border-zinc-800"><button onClick={handleLogoutAll} className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 rounded-xl font-bold hover:bg-red-100 transition-all border border-red-100"><ArrowRightOnRectangleIcon className="w-5 h-5" /> Log Out Current Session</button></div></div>
            </div>
          )}

          {activeSection === 'preferences' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 border border-zinc-100 dark:border-zinc-800 shadow-sm">
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-6">Appearance</h3>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 mb-6">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-zinc-700 text-white' : 'bg-white shadow-sm text-amber-500'}`}>
                      {isDarkMode ? <MoonIcon className="w-6 h-6" /> : <SunIcon className="w-6 h-6" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-900 dark:text-white">Theme</p>
                      <p className="text-xs text-zinc-500">Currently: {isDarkMode ? 'Dark' : 'Light'}</p>
                    </div>
                  </div>
                  <button onClick={onToggleTheme} className="relative inline-flex h-8 w-14 items-center rounded-full bg-zinc-200 dark:bg-zinc-700 transition-colors focus:outline-none">
                    <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform ${isDarkMode ? 'translate-x-7' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div className="space-y-8">
                  <div>
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                      <CalendarDaysIcon className="w-4 h-4 text-zinc-400" /> 
                      Formatting
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <CustomSelect 
                        label="Date Format" 
                        options={[{ value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' }, { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' }]} 
                        value={dateFormat} 
                        onChange={setDateFormat} 
                        className="!bg-zinc-50 dark:!bg-zinc-800 !py-3.5" 
                      />
                      <CustomSelect 
                        label="Time Format" 
                        options={[{ value: '12h', label: '12 Hour' }, { value: '24h', label: '24 Hour' }]} 
                        value={timeFormat} 
                        onChange={setTimeFormat} 
                        className="!bg-zinc-50 dark:!bg-zinc-800 !py-3.5" 
                      />
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                      <ListBulletIcon className="w-4 h-4 text-zinc-400" /> 
                      Sidebar Menu Customization
                    </h4>
                    <p className="text-xs text-zinc-500 mb-4">Toggle visibility of specific menu tabs in the sidebar.</p>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {NAVIGATION.filter(item => item.roles.includes(userRole) && item.id !== 'settings').map(item => {
                        const isHidden = hiddenTabs.includes(item.id);
                        return (
                          <div 
                            key={item.id}
                            onClick={() => toggleTabVisibility(item.id)}
                            className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                              isHidden 
                                ? 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 opacity-60' 
                                : 'bg-white dark:bg-zinc-800 border-zinc-100 dark:border-zinc-700 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-900'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div className={`p-1.5 rounded-lg ${isHidden ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400' : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'}`}>
                                {item.icon}
                              </div>
                              <span className={`text-xs font-bold ${isHidden ? 'text-zinc-500' : 'text-zinc-900 dark:text-white'}`}>
                                {item.label}
                              </span>
                            </div>
                            {isHidden ? (
                              <EyeSlashIcon className="w-4 h-4 text-zinc-400" />
                            ) : (
                              <EyeIcon className="w-4 h-4 text-indigo-500" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-6 mt-6 border-t border-zinc-100 dark:border-zinc-800">
                  <button onClick={handleSavePreferences} disabled={isLoading} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg disabled:opacity-50">
                    {isLoading ? 'Saving...' : 'Save preferences'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'data' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 border border-zinc-100 dark:border-zinc-800 shadow-sm"><h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Data Management</h3><p className="text-sm text-zinc-500 mb-8">Backup or restore app data.</p><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div className="p-6 rounded-2xl bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 flex flex-col items-center text-center"><div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 mb-4"><ArrowDownTrayIcon className="w-6 h-6" /></div><h4 className="font-bold text-zinc-900 dark:text-white mb-2">Export Data</h4><p className="text-xs text-zinc-500 mb-6 px-4">Download a full JSON backup of all collections.</p><button onClick={exportData} disabled={isExporting} className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 disabled:opacity-50">{isExporting ? 'Exporting...' : 'Download Backup'}</button></div><div className="p-6 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 flex flex-col items-center text-center"><div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mb-4"><ArrowUpTrayIcon className="w-6 h-6" /></div><h4 className="font-bold text-zinc-900 dark:text-white mb-2">Import Data</h4><p className="text-xs text-zinc-500 mb-6 px-4"><ExclamationTriangleIcon className="w-3 h-3 text-amber-500 inline mr-1" /> Overwrites existing records.</p><button onClick={() => importInputRef.current?.click()} disabled={isImporting} className="w-full py-3 rounded-xl bg-amber-600 text-white font-bold text-sm hover:bg-amber-700 disabled:opacity-50">{isImporting ? 'Restoring...' : 'Restore from Backup'}</button><input type="file" ref={importInputRef} className="hidden" accept=".json" onChange={importData} /></div></div></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
