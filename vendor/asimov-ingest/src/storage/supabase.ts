/**
 * Supabase Storage adapter — WhatHappen's hot tier.
 *
 * Takes an already-constructed Supabase client rather than credentials, so the
 * package never decides which key is used. WhatHappen passes a service-role
 * client; authorization is enforced in the route BEFORE this is reached.
 *
 * BUCKET MUST BE PRIVATE. A public bucket would re-open exactly the anonymous
 * data exposure the authorization work closed, by bypassing the API entirely.
 */
import type { SignedUploadUrl, StorageAdapter, StoredObject } from './adapter'

/** Minimal shape we need — avoids a hard dependency on @supabase/supabase-js. */
export interface SupabaseStorageLike {
  from(bucket: string): {
    upload(
      path: string,
      data: ArrayBuffer | Buffer | Blob,
      opts?: { contentType?: string; upsert?: boolean }
    ): Promise<{ data: unknown; error: { message: string } | null }>
    download(path: string): Promise<{
      data: { arrayBuffer(): Promise<ArrayBuffer> } | null
      error: { message: string } | null
    }>
    remove(paths: string[]): Promise<{ data: unknown; error: { message: string } | null }>
    createSignedUploadUrl(
      path: string
    ): Promise<{
      data: { signedUrl: string; token?: string } | null
      error: { message: string } | null
    }>
  }
}

export interface SupabaseAdapterOptions {
  client: { storage: SupabaseStorageLike }
  bucket: string
  /** Signed-upload-URL lifetime. Supabase's own default is 2h. */
  uploadUrlTtlSeconds?: number
}

export function createSupabaseStorageAdapter(
  opts: SupabaseAdapterOptions
): StorageAdapter {
  const { client, bucket } = opts
  const ttl = opts.uploadUrlTtlSeconds ?? 2 * 60 * 60

  return {
    name: 'supabase',

    async put(path, data, putOpts): Promise<StoredObject> {
      const { error } = await client.storage
        .from(bucket)
        .upload(path, data, { contentType: putOpts?.contentType, upsert: false })
      if (error) throw new Error(`supabase storage upload failed: ${error.message}`)
      return { path, size: data.length, storedAt: new Date().toISOString() }
    },

    async get(path): Promise<Buffer> {
      const { data, error } = await client.storage.from(bucket).download(path)
      if (error || !data) {
        throw new Error(`supabase storage download failed: ${error?.message ?? 'no data'}`)
      }
      return Buffer.from(await data.arrayBuffer())
    },

    async remove(path): Promise<void> {
      const { error } = await client.storage.from(bucket).remove([path])
      if (error) throw new Error(`supabase storage remove failed: ${error.message}`)
    },

    async createSignedUploadUrl(path, urlOpts): Promise<SignedUploadUrl> {
      const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(path)
      if (error || !data) {
        throw new Error(`supabase signed upload url failed: ${error?.message ?? 'no data'}`)
      }
      return {
        url: data.signedUrl,
        path,
        expiresAt: Date.now() + (urlOpts?.expiresInSeconds ?? ttl) * 1000,
      }
    },
  }
}
