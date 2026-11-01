"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";

type Tone = "ok" | "err" | "info";
type ToastOpts = { tone?: Tone; action?: { label: string; run: () => void }; ms?: number };
type Toast = { id: number; msg: string; tone: Tone; action?: ToastOpts["action"] };
type ConfirmOpts = { title: string; body?: string; confirmLabel?: string; danger?: boolean };
type AskOpts = { title: string; label?: string; initial?: string; confirmLabel?: string; placeholder?: string; type?: string };
type Dialog =
  | ({ kind: "confirm"; resolve: (v: boolean) => void } & ConfirmOpts)
  | ({ kind: "ask"; resolve: (v: string | null) => void } & AskOpts);

type Api = {
  toast: (msg: string, o?: ToastOpts) => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  ask: (o: AskOpts) => Promise<string | null>;
};
const Ctx = createContext<Api | null>(null);

export function useFeedback(): Api {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFeedback doit être utilisé dans <FeedbackProvider>");
  return c;
}

const ICON = { ok: CheckCircle2, err: CircleAlert, info: Info } as const;

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [value, setValue] = useState("");
  const seq = useRef(0);
  const ref = useRef<HTMLDialogElement>(null);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback<Api["toast"]>((msg, o = {}) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, msg, tone: o.tone ?? "ok", action: o.action }]);
    setTimeout(() => dismiss(id), o.ms ?? (o.action ? 8000 : o.tone === "err" ? 7000 : 4000));
  }, [dismiss]);

  const confirm = useCallback<Api["confirm"]>((o) => new Promise((resolve) => setDialog({ kind: "confirm", resolve, ...o })), []);
  const ask = useCallback<Api["ask"]>((o) => new Promise((resolve) => { setValue(o.initial ?? ""); setDialog({ kind: "ask", resolve, ...o }); }), []);

  useEffect(() => {
    const el = ref.current;
    if (dialog && el && !el.open) el.showModal();
  }, [dialog]);

  function close(result: boolean | string | null) {
    if (!dialog) return;
    ref.current?.close();
    if (dialog.kind === "confirm") dialog.resolve(result === true);
    else dialog.resolve(typeof result === "string" ? result : null);
    setDialog(null);
  }

  const api = useMemo(() => ({ toast, confirm, ask }), [toast, confirm, ask]);

  return (
    <Ctx.Provider value={api}>
      {children}

      <div data-toaster className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <div key={t.id} className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-chrome px-4 py-3 text-sm text-white shadow-lift" style={{ animation: "toast-in .22s ease-out both" }}>
              <Icon size={18} className={t.tone === "err" ? "shrink-0 text-[#ff8aa8]" : t.tone === "ok" ? "shrink-0 text-[#4fd6a6]" : "shrink-0 text-marigold"} />
              <span className="min-w-0 flex-1">{t.msg}</span>
              {t.action && (
                <button className="shrink-0 rounded-full bg-white/12 px-3 py-1 font-semibold hover:bg-white/20" onClick={() => { t.action!.run(); dismiss(t.id); }}>
                  {t.action.label}
                </button>
              )}
              <button aria-label="Fermer" className="shrink-0 text-white/60 hover:text-white" onClick={() => dismiss(t.id)}><X size={16} /></button>
            </div>
          );
        })}
      </div>

      <dialog ref={ref} onCancel={(e) => { e.preventDefault(); close(dialog?.kind === "confirm" ? false : null); }}
        onClick={(e) => { if (e.target === ref.current) close(dialog?.kind === "confirm" ? false : null); }}
        className="m-auto w-[min(92vw,26rem)] rounded-2xl border border-line bg-surface p-0 shadow-lift">
        {dialog && (
          <form method="dialog" className="p-5" onSubmit={(e) => { e.preventDefault(); close(dialog.kind === "confirm" ? true : value.trim() || null); }}>
            <h2 className="heading text-lg">{dialog.title}</h2>
            {dialog.kind === "confirm" && dialog.body && <p className="mt-2 text-sm text-muted">{dialog.body}</p>}
            {dialog.kind === "ask" && (
              <label className="mt-3 block">
                {dialog.label && <span className="label">{dialog.label}</span>}
                <input autoFocus className="field mt-1" type={dialog.type ?? "text"} value={value} placeholder={dialog.placeholder} onChange={(e) => setValue(e.target.value)} />
              </label>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => close(dialog.kind === "confirm" ? false : null)}>Annuler</button>
              <button className={`btn ${dialog.kind === "confirm" && dialog.danger ? "border-bad bg-bad text-white" : "btn-primary"}`} autoFocus={dialog.kind === "confirm"}>
                {dialog.confirmLabel ?? (dialog.kind === "confirm" ? "Confirmer" : "Valider")}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </Ctx.Provider>
  );
}
