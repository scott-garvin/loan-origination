import { reactive } from 'vue';

export type ToastKind = 'success' | 'error' | 'info';
export interface Toast {
  id: number;
  msg: string;
  kind: ToastKind;
}

export const toasts = reactive<Toast[]>([]);
let seq = 0;

export function toast(msg: string, kind: ToastKind = 'success'): void {
  const id = ++seq;
  toasts.push({ id, msg, kind });
  setTimeout(() => remove(id), 3400);
}

export function remove(id: number): void {
  const i = toasts.findIndex((t) => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}
