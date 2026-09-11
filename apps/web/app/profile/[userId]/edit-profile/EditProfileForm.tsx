'use client';

/**
 * Edit-profile form (diagram: "Clients — Web" → "Authentication Service").
 *
 * Loads the caller's saved travel preferences with GET /api/auth/demographics
 * and the "who are you travelling with" options with
 * GET /api/gemini/reference/travel-types; Save issues
 * PUT /api/auth/demographics (a full replace). Both hop through the gateway
 * via the typed client (lib/api.ts) — the legacy version read and wrote the
 * Supabase tables directly (T2.4 swap).
 *
 * Identity comes from AuthContext like on every other page; the demographics
 * endpoints need no id because they are caller-scoped (verified session JWT).
 */
import { useEffect, FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { logFormData } from '@/utils/logger';
import { getApiClient } from '@/lib/api';
import { describeApiClientError } from "@/lib/apiError";
import type { UpdateDemographics } from '@smart/shared';

/** The travel-type reference fields this form renders (gemini-service rows). */
interface TravelTypeOption {
  type_name: string;
  type_code: string;
  number_of_people: string;
}

/**
 * The reference contract types its items as unknown[] (raw gemini-db rows), so
 * narrow instead of trusting the shape — a malformed row is dropped rather
 * than crashing the form.
 */
function toTravelTypeOptions(items: readonly unknown[]): TravelTypeOption[] {
  return items.filter((item): item is TravelTypeOption => {
    if (typeof item !== "object" || item === null) return false;
    const row = item as Record<string, unknown>;
    return (
      typeof row.type_name === "string" &&
      typeof row.type_code === "string" &&
      typeof row.number_of_people === "string"
    );
  });
}

/** Parse a budget input value; anything non-numeric stays "not set" (null). */
function toBudget(raw: FormDataEntryValue | null): number | null {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * The auth DB stores the party size as one INTEGER, but the reference rows
 * use ranges ("3-5"). Store the range's first number; when nothing is
 * selected the field is omitted, which the service stores as NULL ("not set").
 */
function toPartySize(raw: string): number | undefined {
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export default function EditProfileForm() {
  const { user } = useAuth(); // Session identity (AuthContext), as on every page
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [travelOptions, setTravelOptions] = useState<TravelTypeOption[]>([]);
  const [minBudget, setMinBudget] = useState<number | null>(null);
  const [maxBudget, setMaxBudget] = useState<number | null>(null);
  const [travelGroup, setTravelGroup] = useState<{ type_name: string; number_of_people: string }>({
    type_name: "",
    number_of_people: "1",
  });
  const [purpose, setPurpose] = useState<string[]>([]); // Corrected to store an array of strings
  const router = useRouter(); // Initialize the useRouter hook

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const api = getApiClient();
        const [demographics, travelTypes] = await Promise.all([
          api.auth.getDemographics(),
          api.gemini.listTravelTypes(),
        ]);
        const options = toTravelTypeOptions(travelTypes.items);
        setTravelOptions(options);

        // Prefill from the saved row; a fresh user's payload is all defaults
        // ("", null), which lands on exactly the empty initial states below.
        setMinBudget(demographics.minBudget ?? null);
        setMaxBudget(demographics.maxBudget ?? null);
        setPurpose(demographics.purpose ? demographics.purpose.split(",") : []);
        // Party size: prefer the selected travel type's own value so the
        // payload matches what the user sees; unmatched stored types keep
        // the "not set" default instead of a stale number.
        const savedType = options.find(
          (option) => option.type_name === demographics.travelType
        );
        setTravelGroup({
          type_name: demographics.travelType,
          number_of_people: savedType?.number_of_people ?? "1",
        });
      } catch (loadError) {
        console.error("Failed to load profile preferences:", loadError);
        setError(describeApiClientError(loadError));
      }
    };
    loadProfile();
  }, []);


  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Get all checkboxes in the form and filter only the checked ones
    const checkedValues = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
      .map((checkbox) => (checkbox as HTMLInputElement).value);

    // Set the purpose state to the list of checked checkboxes
    setPurpose(checkedValues);
  };


  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    logFormData(event);

    const formData = new FormData(event.target as HTMLFormElement);

    try {
      setIsLoading(true);

      // The save itself is caller-scoped; the session user's id is only
      // needed for the redirect back to the profile page.
      if (!user?.id) {
        setError("You must be logged in to save data.");
        return;
      }

      const newUserDemographics: UpdateDemographics = {
        minBudget: toBudget(formData.get('min_budget')),
        maxBudget: toBudget(formData.get('max_budget')),
        travelType: travelGroup.type_name,
        purpose: purpose ? purpose.join(",") : " ",
        numberOfPeople: toPartySize(travelGroup.number_of_people)
      }

      await getApiClient().auth.updateDemographics(newUserDemographics)


      // Redirect to the profile page
      router.push(`/profile/${user.id}`);
    } catch (submitError: unknown) {
      setError(describeApiClientError(submitError));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="card bg-main-3 w-full max-w-2xl shrink-0 shadow-2xl items-center">
      <form className="card-body" onSubmit={onSubmit}>
        <div className="form-control mt-6">
          <label className="label">
            <span className="label-text font-bold text-black">What is your Budget limit?</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="black" className="size-6">
              <path d="M4.5 3.75a3 3 0 0 0-3 3v.75h21v-.75a3 3 0 0 0-3-3h-15Z" />
              <path fillRule="evenodd" d="M22.5 9.75h-21v7.5a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3v-7.5Zm-18 3.75a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1-.75-.75Zm.75 2.25a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" clipRule="evenodd" />
            </svg>
          </label>
          <div className="flex w-full">
            <div className="flex-grow place-items-center">
              <input name="min_budget" type="number" placeholder="Min Budget" className="input input-bordered text-black bg-main-4" required min={0} value={minBudget || ''} onChange={(e) => setMinBudget(Number(e.target.value))} />
            </div>
            <div className="divider divider-horizontal">-----</div>
            <div className="flex-grow place-items-center">
              <input name="max_budget" type="number" placeholder="Max Budget" className="input input-bordered text-black bg-main-4" required min={0} value={maxBudget || ''} onChange={(e) => setMaxBudget(Number(e.target.value))} />
            </div>
          </div>
        </div>

        <div className="form-control mt-6">
          <label className="label">
            <span className="label-text font-bold text-black">What do you like to see more?</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="black" className="size-6">
              <path d="M5.223 2.25c-.497 0-.974.198-1.325.55l-1.3 1.298A3.75 3.75 0 0 0 7.5 9.75c.627.47 1.406.75 2.25.75.844 0 1.624-.28 2.25-.75.626.47 1.406.75 2.25.75.844 0 1.623-.28 2.25-.75a3.75 3.75 0 0 0 4.902-5.652l-1.3-1.299a1.875 1.875 0 0 0-1.325-.549H5.223Z" />
              <path fillRule="evenodd" d="M3 20.25v-8.755c1.42.674 3.08.673 4.5 0A5.234 5.234 0 0 0 9.75 12c.804 0 1.568-.182 2.25-.506a5.234 5.234 0 0 0 2.25.506c.804 0 1.567-.182 2.25-.506 1.42.674 3.08.675 4.5.001v8.755h.75a.75.75 0 0 1 0 1.5H2.25a.75.75 0 0 1 0-1.5H3Zm3-6a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-.75.75h-3a.75.75 0 0 1-.75-.75v-3Zm8.25-.75a.75.75 0 0 0-.75.75v5.25c0 .414.336.75.75.75h3a.75.75 0 0 0 .75-.75v-5.25a.75.75 0 0 0-.75-.75h-3Z" clipRule="evenodd" />
            </svg>
          </label>
          <label className="label cursor-pointer">
            <span className="label-text text-black">More attractions</span>
            <input
              name="more_attractions"
              value="More Attractions"
              type="checkbox"
              className="checkbox accent-black border-black"
              checked={purpose.includes('More Attractions')}
              onChange={handleCheckboxChange}
            />
          </label>
          <label className="label cursor-pointer">
            <span className="label-text text-black">More scenery</span>
            <input
              name="more_scenery"
              value="More Scenery"
              type="checkbox"
              className="checkbox accent-black border-black"
              checked={purpose.includes('More Scenery')}
              onChange={handleCheckboxChange}
            />
          </label>
          <label className="label cursor-pointer">
            <span className="label-text text-black">More restaurants</span>
            <input
              name="more_restaurants"
              value="More Restaurants"
              type="checkbox"
              className="checkbox accent-black border-black"
              checked={purpose.includes('More Restaurants')}
              onChange={handleCheckboxChange}
            />
          </label>
        </div>

        <div className="form-control mt-6">
          <label className="label">
            <span className="label-text font-bold text-black">Who are you traveling with?</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="black" className="size-6">
              <path d="M5.25 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM2.25 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122ZM18.75 7.5a.75.75 0 0 0-1.5 0v2.25H15a.75.75 0 0 0 0 1.5h2.25v2.25a.75.75 0 0 0 1.5 0v-2.25H21a.75.75 0 0 0 0-1.5h-2.25V7.5Z" />
            </svg>
          </label>
          <div className="grid grid-cols-2 gap-4">
            {travelOptions &&
              travelOptions.map((travel) => (
                <label
                  key={travel.type_code}
                  className="label cursor-pointer"
                >
                  <span className="label-text pr-4 text-black">
                    {travel.type_name} ({travel.number_of_people} {travel.number_of_people === "1" ? 'person' : 'people'})
                  </span>
                  <input
                    type="radio"
                    name="travel_group"
                    value={travel.type_name}
                    className="radio accent-black border border-black"
                    checked={travelGroup.type_name === travel.type_name}
                    onChange={() => {
                      setTravelGroup({
                        type_name: travel.type_name,
                        number_of_people: travel.number_of_people,
                      });
                    }}
                  />
                </label>
              ))}
          </div>
        </div>

        <div className="form-control mt-6">
          <button className="btn border-none hover:text-black hover:bg-main-5 hover:bg-opacity-60 bg-main-4 text-black" type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save'}
          </button>
        </div>

        {error && <div className="text-red-500 mt-4">{error}</div>} {/* Show error if any */}
      </form>
    </div>
  );
}
