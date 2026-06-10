'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

interface Profile {
  id: string
  username: string
  avatar_url: string | null
  is_admin: boolean
}

export default function ProfilePage() {
  const supabase = createClient()
  const router   = useRouter()

  const [profile,   setProfile]   = useState<Profile | null>(null)
  const [username,  setUsername]  = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [message,   setMessage]   = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, is_admin')
        .eq('id', user.id)
        .single()

      if (data) {
        const p = data as Profile
        setProfile(p)
        setUsername(p.username ?? '')
        setAvatarUrl(p.avatar_url ?? null)
      }
    }
    load()
  }, [])

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return

    setUploading(true)
    setMessage(null)

    const ext  = file.name.split('.').pop()
    const path = `${profile.id}/avatar.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadErr) {
      setMessage({ type: 'err', text: uploadErr.message })
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(path)

    // Bust cache with timestamp
    const busted = `${publicUrl}?t=${Date.now()}`

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ avatar_url: busted })
      .eq('id', profile.id)

    if (updateErr) {
      setMessage({ type: 'err', text: updateErr.message })
    } else {
      setAvatarUrl(busted)
      setMessage({ type: 'ok', text: 'Avatar updated!' })
    }
    setUploading(false)
  }

  async function handleSaveUsername() {
    if (!profile) return
    const trimmed = username.trim()
    if (!trimmed) return

    setSaving(true)
    setMessage(null)

    const { error } = await supabase
      .from('profiles')
      .update({ username: trimmed })
      .eq('id', profile.id)

    setSaving(false)
    if (error) {
      setMessage({ type: 'err', text: error.message })
    } else {
      setMessage({ type: 'ok', text: 'Username saved!' })
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!profile) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-extrabold text-gray-900 mb-8">My Profile</h1>

        {/* Avatar */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-4">Photo</h2>

          <div className="flex items-center gap-5">
            {/* Avatar preview */}
            <button
              onClick={() => fileRef.current?.click()}
              className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-gray-200 hover:border-black transition-colors group shrink-0"
              title="Click to change photo"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-100 text-3xl select-none">
                  {profile.username?.[0]?.toUpperCase() ?? '?'}
                </div>
              )}
              {/* Overlay */}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-white text-xs font-semibold">Change</span>
              </div>
            </button>

            <div className="flex-1">
              <p className="text-sm text-gray-600 mb-3">
                Upload a square photo (JPG, PNG, GIF, WebP · max 5 MB).
              </p>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:border-black hover:text-black transition-colors disabled:opacity-50"
              >
                {uploading ? 'Uploading…' : 'Choose photo'}
              </button>
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>

        {/* Username */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-4">Display name</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Username"
              maxLength={40}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white placeholder-gray-400
                         focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
            />
            <button
              onClick={handleSaveUsername}
              disabled={saving || !username.trim()}
              className="px-4 py-2 rounded-lg bg-black text-white text-sm font-semibold
                         hover:bg-gray-800 disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {/* Feedback */}
        {message && (
          <div className={`rounded-lg px-4 py-3 text-sm mb-4 ${
            message.type === 'ok'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* Info */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-3">Account</h2>
          {profile.is_admin && (
            <span className="inline-block mb-3 px-2 py-0.5 rounded-full bg-black text-white text-xs font-semibold">
              Admin
            </span>
          )}
          <p className="text-xs text-gray-400">Logged in as {profile.username}</p>
        </div>

        <button
          onClick={handleLogout}
          className="w-full rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-700
                     hover:border-red-400 hover:text-red-600 transition-colors"
        >
          Log out
        </button>
      </div>
    </main>
  )
}
