import { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserRole } from '../types';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(UserRole.OPERATOR);
  const [allowedPages, setAllowedPages] = useState<string[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<any>(null);

  useEffect(() => {
    // Clean up any stale demo keys from storage
    try {
      localStorage.removeItem('isDemoMode');
      localStorage.removeItem('demoRole');
    } catch (e) {
      // Ignore storage errors in sandboxed environments
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const adminEmail = "ahmed.evolt@gmail.com";
        const emailKey = currentUser.email ? currentUser.email.toLowerCase() : '';
        const isMasterAdmin = emailKey === adminEmail.toLowerCase();
        
        try {
          const userDocRef = doc(db, "users", emailKey);
          const userDoc = await getDoc(userDocRef);
          
          let assignedRole: UserRole | null = null;
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            assignedRole = userData.role as UserRole;
            setPreferences(userData.preferences || { hiddenTabs: [] });
            if (Array.isArray(userData.allowedPages)) {
              setAllowedPages(userData.allowedPages);
            } else {
              setAllowedPages(undefined);
            }
            if (userData.status !== 'Active') {
              await updateDoc(userDocRef, { status: 'Active' });
            }
          } else if (isMasterAdmin) {
            assignedRole = UserRole.ADMIN;
            setPreferences({ hiddenTabs: [] });
            setAllowedPages(undefined);
            await setDoc(userDocRef, { 
              email: emailKey, 
              role: UserRole.ADMIN, 
              status: 'Active', 
              invitedAt: new Date().toISOString(),
              preferences: { hiddenTabs: [] }
            });
          } else {
            await auth.signOut();
            setLoading(false);
            return;
          }
          
          if (assignedRole) {
            setRole(assignedRole);
            setUser(currentUser);
          }
        } catch (error) {
          console.error("Auth error:", error);
          if (isMasterAdmin) {
            setUser(currentUser);
            setRole(UserRole.ADMIN);
            setPreferences({ hiddenTabs: [] });
          }
        }
      } else {
        setUser(null);
        setPreferences(null);
        setAllowedPages(undefined);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    try {
      localStorage.removeItem('isDemoMode');
      localStorage.removeItem('demoRole');
    } catch (e) {}
    await auth.signOut();
  };

  return { user, role, setRole, allowedPages, loading, logout, preferences };
};
