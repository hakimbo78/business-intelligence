/**
 * Telling someone when a report stops.
 *
 * A report job failed permanently and nothing said so. The job row was marked
 * FAILED, the project stayed at ANALYSIS, and from the dashboard the order was
 * indistinguishable from one still running — for as long as anyone cared to
 * watch. The owner only found out by asking why it was taking so long.
 *
 * Two things follow from that. A project must carry the failure, in words its
 * reader can act on. And some failures must not be retried at all: the run that
 * exposed this was an out-of-credit error retried three times, where the
 * provider's own message said the retries were making it worse by holding
 * credit in flight.
 */

/** Whether trying again could plausibly succeed without someone intervening. */
export type FailureKind = 'RETRYABLE' | 'PERMANENT';

export interface JobFailure {
  kind: FailureKind;
  /** What the owner sees, and can act on. */
  message: string;
  /** Short code for logs and dashboards. */
  code: string;
}

/** Matched against the error text, most specific first. */
const SIGNATURES: Array<{ code: string; kind: FailureKind; test: RegExp; message: string }> = [
  {
    code: 'AI_CREDIT_EXHAUSTED',
    kind: 'PERMANENT',
    test: /402|exceed your available credits|requires more credits|insufficient_quota/i,
    message:
      'Kredit layanan AI habis, sehingga laporan tidak dapat diselesaikan. Isi ulang kredit ' +
      'OpenRouter, lalu jalankan ulang analisis untuk pesanan ini. Tidak ada biaya yang ' +
      'terbuang — pekerjaan berhenti sebelum laporan dibuat.',
  },
  {
    code: 'AI_KEY_INVALID',
    kind: 'PERMANENT',
    test: /401|invalid api key|unauthorized/i,
    message:
      'Kunci layanan AI ditolak. Periksa OPENROUTER_API_KEY di konfigurasi, lalu jalankan ' +
      'ulang analisis.',
  },
  {
    code: 'AI_MODEL_INVALID',
    kind: 'PERMANENT',
    test: /cannot be used with the chat\/completions endpoint|is not a valid model|No endpoints found|404/i,
    message:
      'Model AI yang dikonfigurasi tidak dapat dipakai. Periksa OPENROUTER_MODEL — pastikan ' +
      'nama modelnya benar dan tanpa akhiran seperti ":batch", yang memakai endpoint berbeda. ' +
      'Setelah diperbaiki, jalankan ulang analisis.',
  },
  {
    code: 'AI_TOKEN_BUDGET',
    kind: 'PERMANENT',
    test: /spent its whole budget of \d+ tokens reasoning|returned no content/i,
    message:
      'Model AI menghabiskan seluruh jatah token untuk berpikir tanpa menghasilkan jawaban. ' +
      'Naikkan OPENROUTER_MAX_TOKENS, atau pakai model yang tidak melakukan reasoning panjang, ' +
      'lalu jalankan ulang analisis.',
  },
  {
    code: 'BUDGET_CEILING',
    kind: 'PERMANENT',
    test: /BudgetExceededError|Batas biaya/i,
    message:
      'Batas biaya API tercapai, sehingga analisis dihentikan untuk menjaga tagihan. Naikkan ' +
      'batas di konfigurasi atau tunggu periode berikutnya, lalu jalankan ulang.',
  },
  {
    code: 'MISSING_INPUT',
    kind: 'PERMANENT',
    test: /missing required|findMissingFinancialInputs|belum diisi|is required/i,
    message:
      'Ada data pesanan yang belum lengkap, sehingga analisis tidak dapat dimulai. Lengkapi ' +
      'isian yang disebutkan di detail kesalahan, lalu jalankan ulang.',
  },
  {
    code: 'MAP_KEY_REJECTED',
    kind: 'PERMANENT',
    test: /API_KEY_IP_ADDRESS_BLOCKED|API key not valid|PERMISSION_DENIED|not activated/i,
    message:
      'Kunci Google Maps ditolak — kemungkinan pembatasan IP atau API yang belum diaktifkan. ' +
      'Periksa pengaturan kunci di Google Cloud Console, lalu jalankan ulang.',
  },
  {
    code: 'RATE_LIMITED',
    kind: 'RETRYABLE',
    test: /429|rate limit|RESOURCE_EXHAUSTED|quota exceeded/i,
    message:
      'Layanan luar sedang membatasi permintaan. Sistem akan mencoba lagi secara otomatis.',
  },
  {
    code: 'UPSTREAM_TIMEOUT',
    kind: 'RETRYABLE',
    test: /timeout|ETIMEDOUT|ECONNRESET|socket hang up|50[234]/i,
    message: 'Layanan luar tidak merespons tepat waktu. Sistem akan mencoba lagi secara otomatis.',
  },
];

/**
 * Classify a failure and put it into words.
 *
 * Unknown failures stay retryable: a transient fault wrongly treated as
 * permanent loses an order, while a permanent one wrongly retried costs a few
 * seconds.
 */
export function classifyFailure(error: unknown): JobFailure {
  // The name and message only. Scanning the stack as well matched line and
  // column numbers against the status-code patterns — a trace ending ":504:13"
  // classified an unknown failure as an upstream timeout.
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);

  for (const signature of SIGNATURES) {
    if (signature.test.test(text)) {
      return { kind: signature.kind, code: signature.code, message: signature.message };
    }
  }

  return {
    kind: 'RETRYABLE',
    code: 'UNKNOWN',
    message:
      'Analisis berhenti karena kesalahan yang tidak dikenali. Detail teknisnya tercatat di ' +
      'sistem. Coba jalankan ulang; jika berulang, hubungi pengelola.',
  };
}
