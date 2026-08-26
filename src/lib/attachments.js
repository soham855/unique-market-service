import { supabase } from './supabase'

const BUCKET = 'complaint-attachments'

export async function uploadComplaintAttachment(complaintId, file) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in')
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${user.id}/${complaintId}/${crypto.randomUUID()}-${safeName}`
  const { data, error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (error) throw error
  const { error: metadataError } = await supabase.from('complaint_attachments').insert({ complaint_id: complaintId, uploaded_by: user.id, file_path: data.path, file_name: file.name, mime_type: file.type || 'application/octet-stream', file_size: file.size })
  if (metadataError) {
    await supabase.storage.from(BUCKET).remove([data.path])
    throw metadataError
  }
  return data.path
}

export async function getComplaintAttachments(complaintId) {
  if (!supabase) return []
  const { data, error } = await supabase.from('complaint_attachments').select('id,file_path,file_name,mime_type,file_size,created_at').eq('complaint_id', complaintId).order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createAttachmentUrl(path, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn)
  if (error) throw error
  return data.signedUrl
}
