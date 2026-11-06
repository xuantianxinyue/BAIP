/// <reference lib="webworker" />
import { DecoderRouter } from '../decoding';
import { toImageData } from '../pipeline';
import { PhotoPipeline } from './photoPipeline';
import type { WorkerRequest, WorkerResponse } from './workerProtocol';

/**
 * Runs decoding and the processing pipeline off the main thread. There is no cancel message: the
 * client terminates the worker, which is immediate and returns all of its memory (WASM heaps too).
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;
const router = new DecoderRouter();
const pipeline = new PhotoPipeline(router);
const never = new AbortController().signal;

const reply = (message: WorkerResponse, transfer: Transferable[] = []) => scope.postMessage(message, transfer);

scope.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    if (data.type === 'decode') {
      const bitmap = await createImageBitmap(toImageData(await router.decode(data.file, { outputBits: 8 })));
      reply({ type: 'decoded', id: data.id, bitmap }, [bitmap]);
    } else {
      reply({ type: 'processed', id: data.id, photo: await pipeline.process(data.file, data.options, never) });
    }
  } catch (e) {
    reply({ type: 'error', id: data.id, message: e instanceof Error ? e.message : String(e) });
  }
};
