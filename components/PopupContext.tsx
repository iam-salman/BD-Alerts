import React, { createContext, useContext, useState, ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircleIcon, CheckCircle2Icon, HelpCircleIcon, XIcon } from 'lucide-react';

interface PopupContextType {
  showAlert: (message: string, type?: 'info' | 'success' | 'error') => Promise<void>;
  showConfirm: (message: string) => Promise<boolean>;
}

const PopupContext = createContext<PopupContextType | undefined>(undefined);

export const usePopup = () => {
  const context = useContext(PopupContext);
  if (!context) {
    throw new Error('usePopup must be used within a PopupProvider');
  }
  return context;
};

interface PopupState {
  isOpen: boolean;
  message: string;
  type: 'alert' | 'confirm';
  alertSeverity?: 'info' | 'success' | 'error';
  resolve?: (value: any) => void;
}

export const PopupProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<PopupState>({
    isOpen: false,
    message: '',
    type: 'alert',
  });

  const showAlert = (message: string, type: 'info' | 'success' | 'error' = 'info'): Promise<void> => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        message,
        type: 'alert',
        alertSeverity: type,
        resolve,
      });
    });
  };

  const showConfirm = (message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        message,
        type: 'confirm',
        resolve,
      });
    });
  };

  const handleClose = (value: boolean) => {
    if (state.resolve) {
      state.resolve(value);
    }
    setState((prev) => ({ ...prev, isOpen: false }));
  };

  return (
    <PopupContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      <AnimatePresence>
        {state.isOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => handleClose(false)}
              className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', duration: 0.3, bounce: 0.1 }}
              className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shadow-2xl shadow-zinc-200/50 dark:shadow-none"
            >
              {/* Close Button */}
              <button
                onClick={() => handleClose(false)}
                className="absolute right-5 top-5 p-2 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              >
                <XIcon className="w-5 h-5" />
              </button>

              <div className="flex flex-col items-center text-center mt-4">
                {/* Icon Selection */}
                <div className="mb-5">
                  {state.type === 'confirm' ? (
                    <div className="p-4 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-3xl">
                      <HelpCircleIcon className="w-10 h-10" />
                    </div>
                  ) : state.alertSeverity === 'success' ? (
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-3xl">
                      <CheckCircle2Icon className="w-10 h-10" />
                    </div>
                  ) : state.alertSeverity === 'error' ? (
                    <div className="p-4 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-3xl">
                      <AlertCircleIcon className="w-10 h-10" />
                    </div>
                  ) : (
                    <div className="p-4 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-3xl">
                      <AlertCircleIcon className="w-10 h-10" />
                    </div>
                  )}
                </div>

                <h3 className="text-xl font-bold font-heading text-zinc-900 dark:text-white leading-snug px-2">
                  {state.type === 'confirm' ? 'Confirmation Required' : 'System Alert'}
                </h3>

                <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed max-h-[200px] overflow-y-auto w-full px-2">
                  {state.message}
                </p>

                {/* Actions */}
                <div className="mt-8 flex gap-3 w-full">
                  {state.type === 'confirm' ? (
                    <>
                      <button
                        onClick={() => handleClose(false)}
                        className="flex-1 py-3 px-5 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 rounded-2xl font-bold text-sm transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleClose(true)}
                        className="flex-1 py-3 px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-indigo-200/50 dark:shadow-none transition-all"
                      >
                        Confirm
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleClose(true)}
                      className="w-full py-3 px-5 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl font-bold text-sm transition-all"
                    >
                      Okay
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </PopupContext.Provider>
  );
};
