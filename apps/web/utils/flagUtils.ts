export function getFlagEmoji(countryName: string = ""): string {
    try {
      const countryCode = getCountryCodeFromName(countryName);
      return countryCode
        .toUpperCase()
        .replace(/./g, (char) =>
          String.fromCodePoint(127397 + char.charCodeAt(0))
        );
    } catch {
      return "🌍"; // Fallback emoji
    }
  }
  
  // You can map a few common names to codes:
  function getCountryCodeFromName(name: string): string {
    const map: Record<string, string> = {
        "Afghanistan": "AF",
        "United States": "US",
        "United Kingdom": "GB",
        "Japan": "JP",
        "Australia": "AU",
        "Canada": "CA",
        "South Korea": "KR",
        "Germany": "DE",
        "France": "FR",
        "Italy": "IT",
        "Spain": "ES",
        "Malaysia": "MY",
        "Singapore": "SG",
      // add more as needed
    };
    return map[name] || "🌍";
  }