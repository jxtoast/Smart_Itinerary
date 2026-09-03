"use client"; // This makes this file run on the client side

import { FormEvent, useState, useEffect } from "react";
import { Country } from "@/types/Country";
import { TravelType } from "@/types/TravelType";
import CountrySearch from "@/app/(itinerary)/plan-itinerary/CountrySearch";
import { useRouter } from "next/navigation";
import { UserService } from "@/services/UserService";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import { signinWithGoogleWithRedirect } from '@/lib/actions'

interface ItineraryFormProps {
  countries: Country[];
  travelType: TravelType[];
}

export default function ItineraryForm({
  countries,
  travelType,
}: ItineraryFormProps) {
  const router = useRouter();
  const [sourceCountry, setSourceCountry] = useState<string>("");
  const [destinationCountry, setDestinationCountry] = useState<string>("");
  const [sourceCountryAirportCode, setSourceCountryAirportCode] = useState<string>("");
  const [destinationCountryAirportCode, setDestinationCountryAirportCode] = useState<string>("");

  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [minBudget, setMinBudget] = useState<number>(0);
  const [maxBudget, setMaxBudget] = useState<number>(0);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [travelGroup, setTravelGroup] = useState<{
    type_name: string;
    number_of_people: string;
  }>({
    type_name: "",
    number_of_people: "1",
  });

  const userSession = UserService.getUserSession()
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const currentUser = await userSession;
      if (currentUser) {
        setUser(currentUser);
      }
    };
    fetchUser();
  }, [userSession]);

  const [prefChecked, setPrefChecked] = useState(false);

  const MySwal = withReactContent(Swal);

  const triggerLoginSwal = () => {
    const redirectUrl = window.location.href;
    MySwal.fire({
      title: "Not Logged In",
      html: `<p class="mb-4">Please log in to use your preferences.</p>
             <button id="google-login-btn" class="btn btn-outline w-full">
              <img src="https://www.svgrepo.com/show/355037/google.svg" alt="Google" class="w-5 h-5 inline-block mr-2" />
              Continue with Google
             </button>`,
      icon: "warning",
      showConfirmButton: false,
      didOpen: () => {
        const btn = document.getElementById("google-login-btn");
        if (btn) {
          btn.addEventListener("click", async () => {
            await signinWithGoogleWithRedirect(redirectUrl);
            MySwal.close();
          });
        }
      },
    });
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    //Maybe need to add the sourceCountry the airport code
    //And the destinationCountry the airport code
    event.preventDefault();
    const formData = {
      source: sourceCountry,
      destination: destinationCountry,
      sourceAirportCode: sourceCountryAirportCode,
      destinationAirportCode: destinationCountryAirportCode,
      startDate: startDate,
      endDate: endDate,
      minBudget: minBudget,
      maxBudget: maxBudget,
      preferences: preferences,
      travelGroup: travelGroup.type_name,
      numberPeople: travelGroup.number_of_people,
    };
    console.log('formdata',formData);
    const serializedData = encodeURIComponent(JSON.stringify(formData));
    router.push(`/itinerary?data=${serializedData}`);
  }

  const handleCheckBoxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value, checked } = e.target;
    setPreferences((prev) =>
      checked ? [...prev, value] : prev.filter((item) => item !== value)
    );
  };

  const handlePrefCheckboxChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const checked = event.target.checked;
    setPrefChecked(checked);
    if (checked) {
      console.log("userSession", user)
      if (user && user.id) {
        const userDemographics = await UserService.getUserDemographicsById(user.id)
        if (userDemographics) {
          setMinBudget(userDemographics.minBudget ? userDemographics.minBudget : 0 );
          setMaxBudget(userDemographics.maxBudget ? userDemographics.maxBudget : 0 );
          const purpose = userDemographics.purpose.split(","); //Split string into array
          setPreferences(purpose);
          setTravelGroup({
            type_name: userDemographics.travelType,
            number_of_people: userDemographics.numberOfPeople,
          })
        } else {
          setPrefChecked(false);
          Swal.fire({
            text: "No valid preferences found. Please update your information.",
          });
        }
      } 

      else {
        triggerLoginSwal();
        setPrefChecked(false);
      }
    } 
  };

  return (
    <>
      <div className="w-full max-w-2xl items-center p-4 sm:p-6 md:p-8 min-h-screen">
        <div className="divider divider-neutral font-bold text-black">
          Destination & Duration
        </div>
        <form onSubmit={onSubmit}>
          <fieldset className="w-full">
            {countries && countries.length > 0 && (
              <CountrySearch
                countries={countries}
                onSearchTermChange={(term: string,airport_code:string) => {
                  setSourceCountry(term);
                  setSourceCountryAirportCode(airport_code); 
                }}
                type='source'
              />
            )}
            {countries && countries.length > 0 && (
              <CountrySearch
                countries={countries}
                onSearchTermChange={(term: string,airport_code:string) => {
                  setDestinationCountry(term);
                  setDestinationCountryAirportCode(airport_code); 
                }}
                type='destination'
              />
            )}
            <div className="form-control mt-6">
              <label className="label">
                <span className="label-text text-black font-bold">
                  How long is your Trip?
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="black"
                  className="size-6"
                >
                  <path
                    fillRule="evenodd"
                    d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 0 0 0-1.5h-3.75V6Z"
                    clipRule="evenodd"
                  />
                </svg>
              </label>
              <div className="flex w-full">
                <input
                  name="start_date"
                  type="date"
                  placeholder="Start Date"
                  className="input input-bordered flex-grow text-black placeholder-black bg-main-2 [color-scheme:light]"
                  required
                  value={startDate}
                  onChange={(e) => {
                    const newStartDate = e.target.value;
                    setStartDate(newStartDate);
                
                    // If endDate is before or same as startDate, update it to +1 day
                    if (!endDate || new Date(endDate) <= new Date(newStartDate)) {
                      const nextDay = new Date(newStartDate);
                      nextDay.setDate(nextDay.getDate() + 1);
                
                      // Convert to yyyy-mm-dd format
                      const formattedNextDay = nextDay.toISOString().split("T")[0];
                      setEndDate(formattedNextDay);
                    }
                  }}
                />
                <div className="divider divider-horizontal text-black">-----</div>
                <input
                  name="end_date"
                  type="date"
                  placeholder="End Date"
                  className="input input-bordered flex-grow text-black placeholder-black bg-main-2 [color-scheme:light]"
                  required
                  value={endDate}
                  min={startDate ? startDate : undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="divider divider-neutral font-bold text-black">
              Additional Information
            </div>

            <div className="form-control mt-6">
              <label className="label">
                <span className="label-text font-bold text-black">
                  Use your preferences?
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="black"
                  className="size-6"
                >
                  <path
                    fillRule="evenodd"
                    d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z"
                    clipRule="evenodd"
                  />
                </svg>
              </label>
              <label className="label cursor-pointer">
                <span className="label-text text-black">
                  My preference{" "}
                  <span className="text-yellow-700">
                    (Note: Override the fields below based on your preference in
                    profile)
                  </span>{" "}
                </span>
                <input
                  name="my_preference"
                  value="My Preference"
                  type="checkbox"
                  className="checkbox accent-black border border-black"
                  checked={prefChecked}
                  onChange={handlePrefCheckboxChange}
                />
              </label>
            </div>

            <div className="form-control mt-6">
              <label className="label">
                <span className="label-text font-bold text-black">
                  What is your Budget limit?
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="size-6"
                >
                  <path d="M4.5 3.75a3 3 0 0 0-3 3v.75h21v-.75a3 3 0 0 0-3-3h-15Z" />
                  <path
                    fillRule="evenodd"
                    d="M22.5 9.75h-21v7.5a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3v-7.5Zm-18 3.75a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1-.75-.75Zm.75 2.25a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z"
                    clipRule="evenodd"
                  />
                </svg>
              </label>
              <div className="flex w-full">
                <input
                  name="min_budget"
                  type="number"
                  placeholder="Min Budget"
                  className={`input input-bordered flex-grow text-black bg-main-2 [color-scheme:dark] 
                     disabled:bg-gray-200 disabled:text-gray-400 disabled:border-gray-200`}
                  step="0.01"
                  min={0}
                  value={minBudget}
                  disabled={prefChecked}
                  onChange={(e) => {
                    const inputValue = Number(e.target.value);
                    if (!isNaN(inputValue)) {
                      const newMin = parseFloat(inputValue.toFixed(2));
                      setMinBudget(newMin);
                  
                      if (maxBudget !== null && newMin >= maxBudget) {
                        setMaxBudget(newMin);
                      }
                    }
                  }}
                />
                <div className="divider divider-horizontal text-black">-----</div>
                <input
                  name="max_budget"
                  type="number"
                  placeholder="Max Budget"
                  className={`input input-bordered flex-grow text-black bg-main-2 [color-scheme:dark] 
                    disabled:bg-gray-200 disabled:text-gray-400 disabled:border-gray-200`}
                  required
                  step="0.01"
                  min={minBudget ? minBudget : 0}
                  value={maxBudget}
                  disabled={prefChecked}
                  onChange={(e) => {
                    const inputValue = Number(e.target.value);
                    if (!isNaN(inputValue)) {
                      setMaxBudget(parseFloat(inputValue.toFixed(2)));
                    }
                  }}
                  onBlur={() => {
                    // Validate after user finishes editing
                    if (maxBudget < minBudget) {
                      Swal.fire({
                        icon: "warning",
                        text: "Max budget cannot be lower than minimum budget!"
                      });
                      setMaxBudget(minBudget);
                    }
                  }}
                />
              </div>
            </div>

            <div className="form-control mt-6">
              <label className="label">
                <span className="label-text font-bold text-black">
                  What do you like to see more?
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="black"
                  className="size-6"
                >
                  <path d="M5.223 2.25c-.497 0-.974.198-1.325.55l-1.3 1.298A3.75 3.75 0 0 0 7.5 9.75c.627.47 1.406.75 2.25.75.844 0 1.624-.28 2.25-.75.626.47 1.406.75 2.25.75.844 0 1.623-.28 2.25-.75a3.75 3.75 0 0 0 4.902-5.652l-1.3-1.299a1.875 1.875 0 0 0-1.325-.549H5.223Z" />
                  <path
                    fillRule="evenodd"
                    d="M3 20.25v-8.755c1.42.674 3.08.673 4.5 0A5.234 5.234 0 0 0 9.75 12c.804 0 1.568-.182 2.25-.506a5.234 5.234 0 0 0 2.25.506c.804 0 1.567-.182 2.25-.506 1.42.674 3.08.675 4.5.001v8.755h.75a.75.75 0 0 1 0 1.5H2.25a.75.75 0 0 1 0-1.5H3Zm3-6a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-.75.75h-3a.75.75 0 0 1-.75-.75v-3Zm8.25-.75a.75.75 0 0 0-.75.75v5.25c0 .414.336.75.75.75h3a.75.75 0 0 0 .75-.75v-5.25a.75.75 0 0 0-.75-.75h-3Z"
                    clipRule="evenodd"
                  />
                </svg>
              </label>
              <label className="label cursor-pointer">
                <span className="label-text text-black">More attractions</span>
                <input
                  name="more_attractions"
                  value="More Attractions"
                  type="checkbox"
                  className="checkbox accent-black border border-black"
                  disabled={prefChecked}
                  checked={preferences.includes("More Attractions")}
                  onChange={handleCheckBoxChange}
                />
              </label>
              <label className="label cursor-pointer">
                <span className="label-text text-black">More scenery</span>
                <input
                  name="more_scenery"
                  value="More Scenery"
                  type="checkbox"
                  className="checkbox accent-black border border-black"
                  disabled={prefChecked}
                  checked={preferences.includes("More Scenery")}
                  onChange={handleCheckBoxChange}
                />
              </label>
              <label className="label cursor-pointer">
                <span className="label-text text-black">More restaurants</span>
                <input
                  name="more-restaurants"
                  value="More Restaurants"
                  type="checkbox"
                  className="checkbox accent-black border border-black"
                  disabled={prefChecked}
                  checked={preferences.includes("More Restaurants")}
                  onChange={handleCheckBoxChange}
                />
              </label>
            </div>

            <div className="form-control mt-6">
              <label className="label">
                <span className="label-text font-bold text-black">
                  Who are you traveling with?
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="black"
                  className="size-6"
                >
                  <path d="M5.25 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM2.25 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122ZM18.75 7.5a.75.75 0 0 0-1.5 0v2.25H15a.75.75 0 0 0 0 1.5h2.25v2.25a.75.75 0 0 0 1.5 0v-2.25H21a.75.75 0 0 0 0-1.5h-2.25V7.5Z" />
                </svg>
              </label>
              <div className="grid grid-cols-2 gap-4">
                {travelType &&
                  travelType.map((travel) => (
                    <label
                      key={travel.type_code}
                      className="label cursor-pointer"
                    >
                      <span className="label-text pr-4 text-black">
                        {travel.type_name} ({travel.number_of_people}{" "}
                        {travel.number_of_people === "1" ? "person" : "people"})
                      </span>
                      <input
                        type="radio"
                        name="travel-group"
                        value={travel.type_name}
                        disabled={prefChecked}
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
              <button className="btn bg-main-2 border-none border-black bg-main-3 text-black hover:text-black hover:bg-colortext-3" type="submit">
                Generate
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    </>
  );
}