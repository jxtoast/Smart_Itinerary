"use client"; // This makes this file run on the client side

import { useState, useEffect } from "react";
import { Country } from "@/types/Country";

interface CountrySearchProps {
  countries: Country[];
  onSearchTermChange: (term: string, airport_code:string) => void;
  type: string;
}

export default function CountrySearch({
  countries,
  onSearchTermChange,
  type,
}: CountrySearchProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredCountries, setFilteredCountries] =
    useState<Country[]>(countries);
  const [dropdownOpen, setDropdownOpen] = useState(false); //Control dropdown state & override daisy UI

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    onSearchTermChange(e.target.value,"");
  };

  const handleCountrySelect = (country: Country) => {
    setSearchTerm(country.country_name);
    setDropdownOpen(false); // Close the dropdown when a country is selected
    onSearchTermChange(country.country_name, country.airport.airport_code);
  };

  const filterCountries = () => {
    if (countries) {
      const filtered = countries.filter((country) =>
        country.country_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredCountries(filtered);
    }
  };
  useEffect(() => {
    filterCountries();
  }, [searchTerm, countries]);

  return (
    <div className="form-control mt-6 text-black">
      <label className="label">
        <span className="label-text font-bold text-black">
          {type === 'destination' ? 'Where do you want to Explore?' : 'Where are you travelling from?'}
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-6">
          <path d="M15.75 8.25a.75.75 0 0 1 .75.75c0 1.12-.492 2.126-1.27 2.812a.75.75 0 1 1-.992-1.124A2.243 2.243 0 0 0 15 9a.75.75 0 0 1 .75-.75Z" />
          <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM4.575 15.6a8.25 8.25 0 0 0 9.348 4.425 1.966 1.966 0 0 0-1.84-1.275.983.983 0 0 1-.97-.822l-.073-.437c-.094-.565.25-1.11.8-1.267l.99-.282c.427-.123.783-.418.982-.816l.036-.073a1.453 1.453 0 0 1 2.328-.377L16.5 15h.628a2.25 2.25 0 0 1 1.983 1.186 8.25 8.25 0 0 0-6.345-12.4c.044.262.18.503.389.676l1.068.89c.442.369.535 1.01.216 1.49l-.51.766a2.25 2.25 0 0 1-1.161.886l-.143.048a1.107 1.107 0 0 0-.57 1.664c.369.555.169 1.307-.427 1.605L9 13.125l.423 1.059a.956.956 0 0 1-1.652.928l-.679-.906a1.125 1.125 0 0 0-1.906.172L4.575 15.6Z" clipRule="evenodd" />
        </svg>
      </label>
      <input
        type="text"
        placeholder={type === 'destination' ? 'Select a destination' : 'Select your starting point'}
        name={type === 'destination' ? 'destination' : 'source'}
        className="input input-bordered w-full text-black placeholder-black bg-main-2"
        value={searchTerm}
        onChange={handleSearch}
        onFocus={() => setDropdownOpen(true)} // Open dropdown when input is focused
        required
        autoComplete="off"
      />
      {/* Dropdown list */}
      {dropdownOpen && (
        <ul className="dropdown-content dropdown-open menu shadow bg-main-3 max-w-lg max-h-64 overflow-y-auto z-10 absolute mt-20">
          {filteredCountries && filteredCountries.length > 0 ? (
            filteredCountries.map((country) => (
              <li
                key={country.country_code}
                onClick={() => handleCountrySelect(country)}
              >
                <span className="text-black">{country.country_name}</span>
              </li>
            ))
          ) : (
            <li>
              <span>No countries found</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
