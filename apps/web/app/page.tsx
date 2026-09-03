"use client";

import { UserService } from "@/services/UserService";
import { useEffect, useState } from "react";
import { User } from "@/types/User";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import ImageCarousel from "@/components/ImageCarousel/ImageCarousel";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import { FaCoffee } from "react-icons/fa";
import { GrPlan } from "react-icons/gr";



export default function Home() {
  const { user, loading, updateUser } = useAuth();

  const MySwal = withReactContent(Swal);

  const handleBuyCoffeeClick = () => {
    MySwal.fire({
      title: "Thanks for the coffee! ☕",
      html: `
        <img src="/images/paynow.jpg" alt="PayNow QR Code" class="w-96 h-auto mx-auto rounded mb-4" />
        <p class="text-sm text-gray-600 mt-2">Scan the QR to buy us a coffee 💖</p>
      `,
      showCloseButton: true,
      showConfirmButton: false,
      width: "auto",
      customClass: {
        popup: "p-4 rounded-lg",
      },
    });
  };

  useEffect(() => {
    const fetchUser = async () => {
      // Get the user session
      const currentUser = await UserService.getUserSession();

      if (currentUser && currentUser.id) {
        const userExistsInDb = await UserService.checkUserExists(currentUser.id);
        //If user does not exist in the users table, insert user data
        if (!userExistsInDb) {
          const user: User = {
            id: currentUser.id,
            email: currentUser.email,
            name: currentUser.name,
            avatar_url: currentUser.avatar_url
          }
          await UserService.createUser(user)
        }
      }
      if (currentUser) updateUser(currentUser); // Set the user data to display their profile
    };

    fetchUser();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      {/* Plan Your Trip Section (Always visible) */}
      <main className="flex flex-col justify-center items-center min-h-screen">
        <h1 className="text-6xl font-bold text-center mb-4 p-4 text-black">
          Plan Your Dream Trip
        </h1>
        <p className="text-center text-2xl mb-6 text-black">
          Get started by exploring destinations and planning your next
          adventure.
        </p>

        <div className="flex gap-4 mb-4">
          <Link href="/plan-itinerary">
            <button id='plan-itinerary' className="btn btn-primary border-none bg-btn-primary-base hover:bg-btn-primary-hover py-2 px-6 text-white">
            <GrPlan></GrPlan>
              Plan a Trip
            </button>
          </Link>
          <button
            className="btn btn-primary border-none bg-amber-500 text-white hover:bg-amber-600 shadow-md"
            onClick={handleBuyCoffeeClick}
          >
            <FaCoffee></FaCoffee>
            Buy us Coffee
          </button>
        </div>
        {/* <HomeCarousel></HomeCarousel> */}
        <div className="w-full flex items-center justify-center mt-4">
          <ImageCarousel />
        </div>
      </main>
    </div>
  );
}
