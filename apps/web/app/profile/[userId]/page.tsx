"use client";
import { UserService } from "@/services/UserService";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation"; // Use useParams to get dynamic route parameters
import { ItineraryService } from "@/services/ItineraryService";
import {
  FaUserAlt,
  FaEnvelope,
  FaSuitcase,
  FaMoneyBillAlt,
  FaBullseye,
} from "react-icons/fa";
import Swal from "sweetalert2";
import { User } from "@/types/User";

export default function Profile() {
  const { userId } = useParams(); // Extract userId from URL params
  const [user, setUser] = useState<User>();
  const [itineraries, setItineraries] = useState<any[]>([]); // State for itineraries
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [loading, setLoading] = useState<boolean>(true); // Loading state for fetching data
  const router = useRouter(); // Initialize router for navigation

  // Helper function to format date as dd-mm-yyyy
  const formatDate = (date: string) => {
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, "0");
    const month = (d.getMonth() + 1).toString().padStart(2, "0"); // months are zero-indexed
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  };

  // Function to handle redirection on button click
  const handleViewDetails = (userId: string, itineraryId: string) => {
    window.location.href = `/itinerary/${userId}/${itineraryId}`; // Redirect to itinerary page
  };

  useEffect(() => {
    const setProfile = async () => {
      if (!userId) return;

      if (typeof userId === 'string') {
        const userData = await UserService.getUserById(userId)
        if (userData) {
          setUser(userData);
        }
        const userItineraries = await ItineraryService.getUserItineraries(userId)
        setItineraries(userItineraries || []);
      }

      setLoading(false); // Set loading state to false after fetching data
    };
    setProfile();
  }, [userId]); // Fetch data again when userId changes

  //#region Function to handle itinerary deletion
  const redirectBacktoProfile = () => {
    router.push(`/profile/${userId}`);
  };

  const handleDelete = async (itineraryId: string) => {
    Swal.fire({
      background: "#23282e",
      color: "#FFFFFF",
      title: "Confirmation",
      icon: "question",
      width: "600px",
      text: `Are you sure you want to delete this itinerary?`,
      cancelButtonText: "No",
      showCancelButton: true,
      cancelButtonColor: "gray",
      confirmButtonColor: "red",
      confirmButtonText: "Yes!",
      showLoaderOnConfirm: true, 
      preConfirm: async () => {
        try {
          await ItineraryService.deleteItinerary(itineraryId); // Call the delete function from ItineraryService
          setItineraries((prevItineraries) =>
            prevItineraries.filter((itinerary) => itinerary.id !== itineraryId)
          );
          setIsConfirmed(true); // Set confirmation state to true
        } catch (error) {
          Swal.showValidationMessage(`Error deleting itinerary: ${error}`);
          console.error("Error deleting itinerary:", error);
        }
      },
    }).then((result) => {
      if (result.isConfirmed) {
        redirectBacktoProfile();
      }
    });
  };

  //#endregion

  const carouselImgSrc = [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/The_Great_Wall_of_China_at_Jinshanling-edit.jpg/250px-The_Great_Wall_of_China_at_Jinshanling-edit.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Sydney_Australia._%2821339175489%29.jpg/250px-Sydney_Australia._%2821339175489%29.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Mount_Everest_as_seen_from_Drukair2_PLW_edit_Cropped.jpg/288px-Mount_Everest_as_seen_from_Drukair2_PLW_edit_Cropped.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Stonehenge2007_07_30.jpg/220px-Stonehenge2007_07_30.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/India_Gate_on_the_evening_of_77th_Independence_day.jpg/200px-India_Gate_on_the_evening_of_77th_Independence_day.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Taj_Mahal_%28Edited%29.jpeg/250px-Taj_Mahal_%28Edited%29.jpeg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Machu_Picchu%2C_2023_%28012%29.jpg/270px-Machu_Picchu%2C_2023_%28012%29.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Colosseo_2020.jpg/270px-Colosseo_2020.jpg",
  ];

  if (loading) {
    return (
      <div className="absolute inset-0 w-full h-full bg-gray-900 bg-opacity-50 flex items-center justify-center z-10">
        <span className="loading loading-spinner text-white text-2xl"></span>
      </div>
    );
  }

  if (!user) {
    return <p>User not found</p>;
  }

  console.log("user",user)

  return (
    <div className="font-[family-name:var(--font-geist-sans)] flex flex-col items-center justify-center min-h-screen gap-6 p-4 bg-main-1">
      {/* Avatar and Edit Button Section */}
      {isConfirmed && (
        <div role="alert">
          <div className="bg-green-500 text-white font-bold rounded-t px-4 py-2">
            Success!
          </div>
          <div className="border border-t-0 border-green-400 rounded-b bg-green-100 px-4 py-3 text-green-700">
            <p>You have successfully deleted your itinerary.</p>
          </div>
        </div>
      )}
      {user && (
        <>
          <div className="flex flex-col items-center gap-4">
            {user.avatar_url && (
              <Image
                src={user.avatar_url}
                alt={user.name}
                width={200}
                height={200}
                className="rounded-full border-4 border-main-2 shadow-lg"
                quality={100}
              />
            )}
            <Link href={`/profile/${userId}/edit-profile`}>
              <button id='edit-profile-btn' className="btn btn-accent text-black py-2 px-6 rounded-lg transition-all hover:bg-accent-focus">
                Edit Profile
              </button>
            </Link>
          </div>
          <h1 className="text-4xl font-semibold text-black">{user.name}</h1>
        </>
      )}


      <div className="card bg-white shadow-md w-full max-w-md mt-6 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          User Information
        </h2>
        <div className="space-y-4 text-gray-700 text-lg">
          <div className="flex items-center">
            <FaUserAlt className="text-gray-500 mr-3" />
            <p>
              <span className="font-semibold text-gray-900">User Name:</span>{" "}
              {user.name}
            </p>
          </div>
          <div className="flex items-center">
            <FaEnvelope className="text-gray-500 mr-3" />
            <p>
              <span className="font-semibold text-gray-900">Email:</span>{" "}
              {user.email}
            </p>
          </div>
          {user.userDemographics && (
            <>
              <div className="flex items-center">
                <FaSuitcase className="text-gray-500 mr-3" />
                <p>
                  <span className="font-semibold text-gray-900">Travel Type:</span>{" "}
                  {user.userDemographics?.travelType}
                </p>
              </div>
              <div className="flex items-center">
                <FaMoneyBillAlt className="text-gray-500 mr-3" />
                <p>
                  <span className="font-semibold text-gray-900">Budget:</span> $
                  {user.userDemographics?.minBudget} - ${user.userDemographics?.maxBudget}
                </p>
              </div>
              <div className="flex items-center">
                <FaBullseye className="text-gray-500 mr-3" />
                <p>
                  <span className="font-semibold text-gray-900">Preference:</span>{" "}
                  {user.userDemographics?.purpose}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
      {/* Itinerary Section */}
      {
        itineraries.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            {itineraries.map((itinerary: any, index: number) => (
              <div
                key={itinerary.id}
                className="card bg-main-2 shadow-lg hover:shadow-xl transition-all"
              >
                <figure>
                  <img
                    src={carouselImgSrc[index % carouselImgSrc.length]}
                    alt="Itinerary"
                    className="object-cover w-full h-56 rounded-t-lg"
                  />
                </figure>
                <div className="card-body p-4">
                  <h2 className="card-title text-xl font-bold text-black">
                    {itinerary.destination}
                  </h2>
                  <p className="text-black">
                    Duration: {formatDate(itinerary.start_date)} -{" "}
                    {formatDate(itinerary.end_date)} <br />
                    Estimated Cost: ${itinerary.estimated_total_cost}
                  </p>
                  <div className="card-actions justify-end mt-4">
                    <button
                      className="btn btn-primary border-none px-6 py-2 rounded-lg transition-all hover:bg-primary-focus"
                      onClick={() => handleViewDetails(user.id, itinerary.id)}
                    >
                      View Details
                    </button>
                    <button
                      className="btn bg-red-500 border-none text-black px-6 py-2 rounded-lg transition-all hover:bg-red-600"
                      onClick={() => handleDelete(itinerary.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-lg text-center text-gray-600 mt-6">
            No itineraries available.
          </p>
        )
      }
    </div >
  );
}
