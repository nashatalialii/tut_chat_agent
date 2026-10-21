import { TRPCError } from '@trpc/server';
import type { Context } from '../context.js';

export function requireUser(ctx: Context) {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'تحتاج لتسجيل الدخول.' });
  return ctx.user;
}

export function requireAdmin(ctx: Context) {
  const user = requireUser(ctx);
  if (user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'هذه العملية متاحة لمسؤول قاعدة المعرفة فقط.' });
  return user;
}
