import EditProfileForm from "./EditProfileForm";

/**
 * Edit-profile page shell (diagram: "Clients — Web" → "Authentication
 * Service"). It renders no data itself: since T2.4 the travel-type options
 * and saved preferences are fetched by the form below through the API client
 * (lib/api.ts → gateway → auth-/gemini-service), replacing the legacy
 * server-side Supabase lookup, so this is a plain server component again.
 */
export default function EditProfile() {
  return (
    <div className="hero min-h-screen">
      <div className="hero-overlay bg-main-1">
        <div className="flex flex-col items-center text-neutral-content mb-8 font-bold">
          <h1 className="text-5xl text-black mb-5 mt-8">Edit Profile</h1>
        </div>
      </div>
      <div className="hero-content text-neutral-content text-center pt-16">
        <EditProfileForm />
      </div>
    </div>
  )
}
