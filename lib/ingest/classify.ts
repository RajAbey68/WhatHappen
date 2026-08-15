/**
 * Upload classification — the single source of truth for how a file is handled.
 *
 * The badge the user sees and the path the worker takes are both derived from
 * this one function. That is deliberate: a display that computes its own answer
 * will eventually disagree with the pipeline, and the user will be told their
 * 400 MB archive is a "direct text upload" while it OOMs a container.
 *
 * Thresholds are exported so tests can sit on both sides of each boundary
 * rather than hard-coding numbers that drift.
 */

/** Above this, a file is never buffered into memory on the gateway. */
export const INLINE_MAX_BYTES = 10 * 1024 * 1024 // 10 MB

/** Above this, an archive is split rather than processed in one pass. */
export const BATCH_THRESHOLD_BYTES = 100 * 1024 * 1024 // 100 MB

export type IngestRoute =
  | 'TEXT_DIRECT'
  | 'DOC_PARSE'
  | 'ZIP_OCR'
  | 'ZIP_BATCHED'
  | 'UNSUPPORTED'

export interface Classification {
  route: IngestRoute
  /** Human label for the upload badge. */
  label: string
  /** Where the work happens. The gateway must never hold a large file. */
  runsOn: 'gateway' | 'worker' | 'none'
  /** 1 for single-pass, N for batched, 0 when nothing will be processed. */
  batches: number
  /** Populated when the route is UNSUPPORTED, so the UI can say why. */
  reason?: string
  extension: string
  sizeBytes: number
}

const TEXT_EXTENSIONS = ['.txt', '.csv', '.json']
const DOC_EXTENSIONS = ['.pdf', '.docx', '.xlsx']
const ARCHIVE_EXTENSIONS = ['.zip']

/**
 * Accepted by /api/upload-url's allowlist but nothing in the codebase can read
 * it. Named explicitly so the user is told at classification time instead of
 * discovering it after a long upload.
 */
const NO_PARSER_EXTENSIONS = ['.pst']

function extensionOf(fileName: string): string {
  const name = String(fileName ?? '').toLowerCase()
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.slice(dot)
}

function unsupported(extension: string, sizeBytes: number, reason: string): Classification {
  return {
    route: 'UNSUPPORTED',
    label: 'Unsupported file',
    runsOn: 'none',
    batches: 0,
    reason,
    extension,
    sizeBytes,
  }
}

export function classifyUpload(input: {
  fileName: string
  sizeBytes: number
}): Classification {
  const extension = extensionOf(input.fileName)
  const sizeBytes = Number(input.sizeBytes)

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return unsupported(extension, sizeBytes || 0, 'File is empty or its size is unknown.')
  }

  if (NO_PARSER_EXTENSIONS.includes(extension)) {
    return unsupported(
      extension,
      sizeBytes,
      `Files of type ${extension} have no parser in this system yet.`
    )
  }

  if (ARCHIVE_EXTENSIONS.includes(extension)) {
    if (sizeBytes >= BATCH_THRESHOLD_BYTES) {
      const batches = Math.ceil(sizeBytes / BATCH_THRESHOLD_BYTES)
      return {
        route: 'ZIP_BATCHED',
        label: `Large archive — split into ${batches} batches`,
        runsOn: 'worker',
        batches,
        extension,
        sizeBytes,
      }
    }
    return {
      route: 'ZIP_OCR',
      label: 'Archive — unzip and OCR',
      runsOn: 'worker',
      batches: 1,
      extension,
      sizeBytes,
    }
  }

  if (DOC_EXTENSIONS.includes(extension)) {
    return {
      route: 'DOC_PARSE',
      label: 'Document — text extraction',
      runsOn: 'worker',
      batches: 1,
      extension,
      sizeBytes,
    }
  }

  if (TEXT_EXTENSIONS.includes(extension)) {
    // Big text is still text, but it stops being safe to hold in memory on the
    // gateway, so it goes to the worker via the same extraction path.
    if (sizeBytes >= INLINE_MAX_BYTES) {
      return {
        route: 'DOC_PARSE',
        label: 'Large text file — text extraction',
        runsOn: 'worker',
        batches: 1,
        extension,
        sizeBytes,
      }
    }
    return {
      route: 'TEXT_DIRECT',
      label: 'Direct text upload',
      runsOn: 'gateway',
      batches: 1,
      extension,
      sizeBytes,
    }
  }

  return unsupported(
    extension,
    sizeBytes,
    extension
      ? `Files of type ${extension} are not supported.`
      : 'File has no recognisable extension.'
  )
}
