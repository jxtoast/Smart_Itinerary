/************ SAMPLE ROUTE API IN CASE U WANT TO DO BACKEND IN NEXTJS **********/


// import { Hotel } from "@/interfaces/Hotel";
// import { NextResponse } from "next/server";

// export async function GET() {
//   return NextResponse.json({ message: "Hello from the App Router API!" });
// }

// async function getHotelDetails(iataCode: string) {}

// export async function POST(request: Request) {
//   const requestData = await request.json();

//   try {
//     const options = {
//       method: "GET",
//       headers: {
//         Authorization: `Bearer ${process.env.NEXT_PUBLIC_AMADEUS_TOKEN}`,
//       },
//     };

//     const hotelResponse = await fetch(
//       `${process.env.NEXT_PUBLIC_AMADEUS_GLOBAL_URL}/v1/reference-data/locations/hotel?keyword=${requestData.keyword}&subType=HOTEL_LEISURE`,
//       options
//     ).then(async (value: Response) => {
//       return await value.json();
//     });
//     const hotelData: Hotel[] = hotelResponse.data;
//     const hotelDataDetails = await Promise.all(
//       hotelData.map(async (item) => {
//         try {
//         } catch (error) {
//           console.error(`Failed to fetch details for ${item.iataCode}`, error);
//           return { ...item, details: null };
//         }
//       })
//     );
//     return NextResponse.json(hotelResponse);
//   } catch (error) {
//     console.error("Error fetching data: ", error);
//     return NextResponse.json({ error: "Error fetching data" }, { status: 500 });
//   }
// }

export {}; 