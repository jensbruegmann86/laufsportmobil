"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastTone = "success" | "error" | "info";

type ToastItem = {
  id: number;
  title?: string;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  pushToast: (input: { title?: string; message: string; tone?: ToastTone }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toneClasses: Record<ToastTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-rose-200 bg-rose-50 text-rose-900",
  info: "border-zinc-200 bg-white text-zinc-900",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const pushToast = useCallback((input: { title?: string; message: string; tone?: ToastTone }) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const nextItem: ToastItem = {
      id,
      title: input.title,
      message: input.message,
      tone: input.tone ?? "info",
    };

    setItems((current) => [...current, nextItem]);

    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 3600);
  }, []);

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex justify-center px-4">
        <div className="flex w-full max-w-md flex-col gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-lg backdrop-blur ${toneClasses[item.tone]}`}
            >
              {item.title ? <p className="text-sm font-semibold">{item.title}</p> : null}
              <p className="text-sm">{item.message}</p>
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return context;
}
