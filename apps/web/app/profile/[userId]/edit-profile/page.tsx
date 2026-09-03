import { TravelType } from "@/types/TravelType";
import { CommonService } from "@/services/CommonService";
import dynamic from 'next/dynamic';
import {FactoryType } from "@/types/FactoryType";

const ItineraryForm = dynamic(() => import('@/app/profile/[userId]/edit-profile/EditProfileForm'));

export default async function EditProfile() {
  const travelData = await CommonService.fetchDataStrategy(FactoryType.TRAVEL) as TravelType[];

  return (
    <div className="hero min-h-screen">
      <div className="hero-overlay bg-main-1">
        <div className="flex flex-col items-center text-neutral-content mb-8 font-bold">
          <h1 className="text-5xl text-black mb-5 mt-8">Edit Profile</h1>
        </div>
      </div>
      <div className="hero-content text-neutral-content text-center pt-16">
        {/* Pass travelData and userId as props to the ItineraryForm */}
        <ItineraryForm travelType={travelData}></ItineraryForm>
      </div>
    </div>
  )
}
