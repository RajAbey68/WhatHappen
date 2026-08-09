"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSupabaseStorageAdapter = createSupabaseStorageAdapter;
function createSupabaseStorageAdapter(opts) {
    const { client, bucket } = opts;
    const ttl = opts.uploadUrlTtlSeconds ?? 2 * 60 * 60;
    return {
        name: 'supabase',
        async put(path, data, putOpts) {
            const { error } = await client.storage
                .from(bucket)
                .upload(path, data, { contentType: putOpts?.contentType, upsert: false });
            if (error)
                throw new Error(`supabase storage upload failed: ${error.message}`);
            return { path, size: data.length, storedAt: new Date().toISOString() };
        },
        async get(path) {
            const { data, error } = await client.storage.from(bucket).download(path);
            if (error || !data) {
                throw new Error(`supabase storage download failed: ${error?.message ?? 'no data'}`);
            }
            return Buffer.from(await data.arrayBuffer());
        },
        async remove(path) {
            const { error } = await client.storage.from(bucket).remove([path]);
            if (error)
                throw new Error(`supabase storage remove failed: ${error.message}`);
        },
        async createSignedUploadUrl(path, urlOpts) {
            const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(path);
            if (error || !data) {
                throw new Error(`supabase signed upload url failed: ${error?.message ?? 'no data'}`);
            }
            return {
                url: data.signedUrl,
                path,
                expiresAt: Date.now() + (urlOpts?.expiresInSeconds ?? ttl) * 1000,
            };
        },
    };
}
