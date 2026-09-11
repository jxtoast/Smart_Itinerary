
import { WeatherForecast } from "@/types/WeatherForecast";

// Define the type for condition to icon map
const conditionToIconMap: Record<"clear sky" | "few clouds" | "scattered clouds" | "broken clouds" | "shower rain" | "rain" | "thunderstorm" | "snow" | "mist", string> = {
  "clear sky": "01d",
  "few clouds": "02d",
  "scattered clouds": "03d",
  "broken clouds": "04d",
  "shower rain": "09d",
  "rain": "10d",
  "thunderstorm": "11d",
  "snow": "13d",
  "mist": "50d",
};


const DailyWeatherItem = ({ item }: { item: WeatherForecast}) => {

    // Get the corresponding icon code for the weather condition
    const iconCode = conditionToIconMap[item.condition as keyof typeof conditionToIconMap] || "01d";

  return (
    <div
      className="w-54 h-64 pt-6 hover:shadow-md shadow-sm transition duration-150 ease-out border border-base-300 flex-none rounded-xl mb-8"
    >
      <div className="card h-full">
        <div className="w-16 h-16 mx-auto">
          {/* Weather condition icon - You can adjust this URL based on your icon needs */}
          <img
            className="w-full h-full object-cover rounded-full"
            src={`https://openweathermap.org/img/wn/${iconCode}@2x.png`}
            alt={item.condition}
          />
        </div>
        <div className="card-body p-4">
          <h2 className="card-title mx-auto text-center font-bold text-xl text-black">
            {new Date(item.date).toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </h2>
          <p className="mx-auto text-center text-black">{item.condition}</p>
          <p className="font-semibold text-2xl mx-auto text-center text-black">
            {item.temperature_celsius}°C
          </p>
        </div>
      </div>
    </div>
  );
};

export default DailyWeatherItem;
