import { useEffect, useState } from 'react';
import { runAiSelfTest, type SelfTestReport } from '../../ai';

export function SelfTestDialog({ onClose }: { onClose: () => void }) {
  const [report, setReport] = useState<SelfTestReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    runAiSelfTest().then(setReport, (e) => setError(String(e)));
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/30">
      <div className="w-[560px] rounded-lg bg-white p-4 shadow-xl" data-testid="selftest-dialog">
        <h2 className="mb-2 text-sm font-semibold">AI 环境自检（ONNX Runtime Web）</h2>
        {!report && !error && <p className="text-xs text-neutral-500">运行中…</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
        {report && (
          <pre className="whitespace-pre-wrap font-mono text-xs" data-testid="selftest-result" data-passed={report.passed}>
            {[
              `crossOriginIsolated: ${report.crossOriginIsolated}  threads: ${report.threads}  WebGPU: ${report.webGpu}`,
              ...report.items.map((i) => `[${i.passed ? 'PASS' : 'FAIL'}] ${i.name} — ${i.ms.toFixed(1)} ms — ${i.detail}`),
              report.passed ? '结果：全部通过' : '结果：存在失败项',
            ].join('\n')}
          </pre>
        )}
        <div className="mt-3 text-right">
          <button type="button" className="rounded bg-blue-600 px-3 py-1 text-xs text-white" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
