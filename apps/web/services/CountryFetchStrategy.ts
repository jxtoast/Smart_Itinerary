
import { IBaseFetchStrategy } from '@/types/IBaseFetchStrategy';
import { createClientForServer } from '@/lib/supabase/server';
import { Country } from '@/types/Country';

export class CountryFetchStrategy implements IBaseFetchStrategy {
  async fetchData(): Promise<Country[]> {
    const supabaseServer = await createClientForServer();
    const response = await supabaseServer
    .from('country')
    .select(`
      id,
      country_code,
      country_name,
      airport!inner(
        airport_code
      )
    `)
    if (response.data!==null) {return this.processCountryData(response.data) as Country[];}
    return [] as Country[];
  }


  private processCountryData(rawData: any[]): Country[] {
    if (!rawData || !Array.isArray(rawData)) {
      console.warn('Invalid raw data received:', rawData);
      return [];
    }
    
    return rawData.map(item => {
      let airportCode = '';
      
      if (item.airport) {
        airportCode = item.airport.airport_code;
      }
      
      return {
        id: String(item.id),
        country_code: item.country_code || '',
        country_name: item.country_name || '',
        airport: {
          airport_code: airportCode
        }
      };
    });
  }

}
