'use client';

import dynamic from 'next/dynamic';

/**
 * The whole app depends on browser-only APIs (File, Worker, WASM, OffscreenCanvas, WebGPU),
 * so it is rendered on the client only; the server just ships the static shell.
 */
export const ClientApp = dynamic(() => import('../ui/App').then((m) => m.App), { ssr: false });
