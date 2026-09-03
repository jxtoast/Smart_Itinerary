"use client";
import { useAuth } from "@/context/AuthContext";
import { ItineraryService } from "@/services/ItineraryService";
import useHotelStore from "@/store/hotelStore";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Suspense } from "react";
import Swal from "sweetalert2";

const HotelDetailPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const itineraryId = searchParams.get("itinerary") ?? "";
  const hotelDetails = useHotelStore((state) => state.hotelDetails);
  const { user } = useAuth();
  const clearHotelDetailsData = useHotelStore(
    (state) => state.clearHotelDetailsData
  );
  const redirectBacktoItinerary = () => {
    router.push(`/itinerary/${user.id}/${itineraryId}`);
  };
  const deleteHotelFromItinerary = () => {
    Swal.fire({
      background: "#23282e",
      color: "#FFFFFF",
      title: "Confirmation",
      icon: "question",
      width: "600px",
      text: `Are you sure you want to delete this hotel from your itinerary?`,
      cancelButtonText: "No",
      showCancelButton: true,
      cancelButtonColor: "gray",
      confirmButtonColor: "red",
      confirmButtonText: "Yes!",
      showLoaderOnConfirm: true,
      preConfirm: async () => {
        try {
          await ItineraryService.deleteAccomodation(hotelDetails?.id);
          //   redirectBacktoItinerary();
        } catch (error) {
          Swal.showValidationMessage(
            `Error deleting hotel from itinerary: ${error}`
          );
          console.error("Error deleting hotel from itinerary:", error);
        }
      },
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.fire({
          timer: 3000,
          background: "#23282e",
          color: "#FFFFFF",
          title: `Success`,
          showConfirmButton: false,
          text: "You have successfully deleted this hotel from your Itinerary! Redirecting you back to itinerary details page...",
          icon: "success",
          didOpen: () => {
            Swal.showLoading();
          },
        }).then((result) => {
          redirectBacktoItinerary();
        });
      }
    });
  };

  // to clear the store state after redirecting
  useEffect(() => {
    console.log(pathname);
    if (!pathname.includes("/detail")) {
      clearHotelDetailsData();
    }
  }, [pathname]);

  return (
    <div className="flex flex-col gap-16 w-full py-8">
      <div className="text-2xl font-semibold text-center w-full py-4">
        Hotel Details
      </div>
      <div className="flex justify-center items-center">
        <div className="flex w-1/2 gap-10">
          <Image
            width={360}
            height={360}
            src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Sydney_%28AU%29%2C_Bondi_Beach_--_2019_--_2354.jpg/640px-Sydney_%28AU%29%2C_Bondi_Beach_--_2019_--_2354.jpg"
            alt={"hotel image"}
            style={{ width: "auto", height: "auto" }}
          />
          <div className="flex-1 flex flex-col gap-8">
            <div className="flex justify-center w-full rounded-md bg-main-3 border-2 border-gray-600">
              <span
                id="hotelName"
                className="text-xl border-b-2 w-3/4 font-black text-center"
              >
                {hotelDetails?.name}
              </span>
            </div>

            <div className="flex text-md mt-4 justify-center rounded-md p-2 bg-main-3 border-2 border-gray-600">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="size-6"
              >
                <path d="M10.464 8.746c.227-.18.497-.311.786-.394v2.795a2.252 2.252 0 0 1-.786-.393c-.394-.313-.546-.681-.546-1.004 0-.323.152-.691.546-1.004ZM12.75 15.662v-2.824c.347.085.664.228.921.421.427.32.579.686.579.991 0 .305-.152.671-.579.991a2.534 2.534 0 0 1-.921.42Z" />
                <path
                  fillRule="evenodd"
                  d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v.816a3.836 3.836 0 0 0-1.72.756c-.712.566-1.112 1.35-1.112 2.178 0 .829.4 1.612 1.113 2.178.502.4 1.102.647 1.719.756v2.978a2.536 2.536 0 0 1-.921-.421l-.879-.66a.75.75 0 0 0-.9 1.2l.879.66c.533.4 1.169.645 1.821.75V18a.75.75 0 0 0 1.5 0v-.81a4.124 4.124 0 0 0 1.821-.749c.745-.559 1.179-1.344 1.179-2.191 0-.847-.434-1.632-1.179-2.191a4.122 4.122 0 0 0-1.821-.75V8.354c.29.082.559.213.786.393l.415.33a.75.75 0 0 0 .933-1.175l-.415-.33a3.836 3.836 0 0 0-1.719-.755V6Z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="font-bold mr-2">Estimated Price: </span> ${" "}
              <span id="hotelEstimatedCost">{hotelDetails?.estimatedCost}</span>
            </div>
            <div className="text-center rounded-md border p-2 bg-main-3 border-2 border-gray-600">
              {hotelDetails?.hotelDescription}
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-center gap-2">
        <button
          className="btn btn-outline bg-main-2 text-black"
          onClick={() => redirectBacktoItinerary()}
        >
          Back
        </button>
        <button
          className="btn btn-error"
          onClick={() => deleteHotelFromItinerary()}
        >
          Delete
        </button>
      </div>
    </div>
  );
};

export default function HotelDetailPageWithSuspense() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HotelDetailPage />
    </Suspense>
  );
}
