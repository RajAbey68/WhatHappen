/**
 * Storage abstraction.
 *
 * Callers never touch a vendor SDK. That matters for two reasons: WhatHappen is
 * moving its hot tier from GCS to Supabase Storage and should not have to
 * rewrite call sites to do it, and booklets must be able to run with NO
 * adapter at all so that persisting is physically impossible rather than
 * merely disabled.
 */
export interface StoredObject {
  /** Adapter-relative object path. */
  path: string
  /** Size in bytes as written. */
  size: number
  /** ISO-8601 write time. */
  storedAt: string
}

export interface SignedUploadUrl {
  url: string
  path: string
  /** Epoch ms at which the URL stops working. */
  expiresAt: number
  /** Signed-upload token. Required by Supabase Storage; absent for GCS. */
  token?: string
}

export interface StorageAdapter {
  /** Short identifier, e.g. 'supabase' | 'gcs'. Used in logs and audit rows. */
  readonly name: string

  put(path: string, data: Buffer, opts?: { contentType?: string }): Promise<StoredObject>

  get(path: string): Promise<Buffer>

  remove(path: string): Promise<void>

  /**
   * Mint a URL the browser can upload to directly, so large files never transit
   * the application server.
   *
   * NOTE for the WhatHappen migration: GCS and Supabase Storage differ here.
   * GCS returns a v4-signed URL accepting an arbitrary PUT. Supabase returns a
   * token bound to a specific endpoint. Client upload code is therefore NOT
   * interchangeable between adapters and must be written against whichever is
   * configured — this interface hides the minting, not the upload semantics.
   */
  createSignedUploadUrl(
    path: string,
    opts?: { expiresInSeconds?: number; contentType?: string }
  ): Promise<SignedUploadUrl>
}
