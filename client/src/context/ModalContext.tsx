
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

type ModalType = 'alert' | 'confirm';

interface ModalOptions {
    title?: string;
    message: string;
    type: ModalType;
    confirmText?: string;
    cancelText?: string;
    resolve: (value: boolean) => void;
}

interface ModalContextType {
    alert: (message: string, title?: string) => Promise<boolean>;
    confirm: (message: string, title?: string, confirmText?: string, cancelText?: string, isDanger?: boolean) => Promise<boolean>;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [modal, setModal] = useState<ModalOptions | null>(null);

    const alert = useCallback((message: string, title: string = 'Notice') => {
        return new Promise<boolean>((resolve) => {
            setModal({
                title,
                message,
                type: 'alert',
                confirmText: 'OK',
                resolve
            });
        });
    }, []);

    const confirm = useCallback((message: string, title: string = 'Confirm', confirmText: string = 'Yes, Delete', cancelText: string = 'Cancel', isDanger: boolean = true) => {
        return new Promise<boolean>((resolve) => {
            setModal({
                title,
                message,
                type: isDanger ? 'confirm' : ('alert' as any), // use the 'modal.type' for the danger coloring (hacky but it works since we check type === 'confirm' for btn-danger below)
                confirmText,
                cancelText,
                resolve
            });
        });
    }, []);

    const handleConfirm = () => {
        if (modal) {
            modal.resolve(true);
            setModal(null);
        }
    };

    const handleCancel = () => {
        if (modal) {
            modal.resolve(false);
            setModal(null);
        }
    };

    return (
        <ModalContext.Provider value={{ alert, confirm }}>
            {children}
            {modal && (
                <div className="modal-overlay active" onClick={handleCancel}>
                    <div className="modal-content card" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', padding: '24px' }}>
                        {modal.title && <h3 style={{ marginTop: 0, marginBottom: '12px' }}>{modal.title}</h3>}
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.5' }}>{modal.message}</p>

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            {modal.cancelText && (
                                <button className="btn btn-ghost" onClick={handleCancel}>
                                    {modal.cancelText}
                                </button>
                            )}
                            <button
                                className={`btn ${modal.type === 'confirm' ? 'btn-danger' : 'btn-primary'}`}
                                onClick={handleConfirm}
                                autoFocus
                            >
                                {modal.confirmText || 'OK'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ModalContext.Provider>
    );
};

export const useModal = () => {
    const context = useContext(ModalContext);
    if (!context) throw new Error('useModal must be used within ModalProvider');
    return context;
};
