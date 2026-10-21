'use client';

import { createTRPCReact } from '@trpc/react-query';
import { httpLink } from '@trpc/client';
import type { AppRouter } from '@egypt-traffic/backend/router';
import { getAdminToken, getOrCreateSessionId } from '@/lib/utils';

export const trpc = createTRPCReact<AppRouter>();

export function makeTRPCClient() {
  const httpUrl = process.env.NEXT_PUBLIC_TRPC_HTTP_URL ?? 'http://localhost:4000/trpc';

  return trpc.createClient({
    links: [
      httpLink({
        url: httpUrl,
        headers() {
          const adminToken = getAdminToken();
          return {
            'x-session-id': getOrCreateSessionId(),
            ...(adminToken ? { authorization: `Bearer ${adminToken}` } : {})
          };
        }
      })
    ]
  });
}
