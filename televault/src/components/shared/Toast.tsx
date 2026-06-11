import { Toaster } from 'react-hot-toast'
import hotToast from 'react-hot-toast'

export const toast = {
  success: (msg: string) =>
    hotToast.success(msg, {
      style: {
        background: '#1f2937',
        color: '#f3f4f6',
        border: '1px solid #374151',
        borderRadius: '8px',
        fontSize: '14px',
      },
      iconTheme: { primary: '#14b8a6', secondary: '#1f2937' },
    }),
  error: (msg: string) =>
    hotToast.error(msg, {
      style: {
        background: '#1f2937',
        color: '#f3f4f6',
        border: '1px solid #374151',
        borderRadius: '8px',
        fontSize: '14px',
      },
      iconTheme: { primary: '#ef4444', secondary: '#1f2937' },
    }),
  loading: (msg: string) =>
    hotToast.loading(msg, {
      style: {
        background: '#1f2937',
        color: '#f3f4f6',
        border: '1px solid #374151',
        borderRadius: '8px',
        fontSize: '14px',
      },
    }),
  dismiss: hotToast.dismiss,
}

export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: '#1f2937',
          color: '#f3f4f6',
          border: '1px solid #374151',
          borderRadius: '8px',
          fontSize: '14px',
        },
        success: { iconTheme: { primary: '#14b8a6', secondary: '#1f2937' } },
        error: { iconTheme: { primary: '#ef4444', secondary: '#1f2937' } },
        duration: 4000,
      }}
    />
  )
}
