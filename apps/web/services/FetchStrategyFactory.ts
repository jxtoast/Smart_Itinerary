
import { IBaseFetchStrategy } from '@/types/IBaseFetchStrategy';
import { TravelTypeFetchStrategy } from '@/services/TravelTypeFetchStrategy';
import { CountryFetchStrategy } from '@/services/CountryFetchStrategy';
import { IFetchStrategyFactory } from '@/types/IFetchStrategyFactory';
import { FactoryType } from "@/types/FactoryType";

export class FetchStrategyFactory implements IFetchStrategyFactory {
  createStrategy(factoryType: FactoryType): IBaseFetchStrategy {
    switch (factoryType) {
      case FactoryType.TRAVEL:
        return new TravelTypeFetchStrategy();
      case FactoryType.COUNTRY:
        return new CountryFetchStrategy();
      default:
        throw new Error(`Unknown factory type: ${factoryType}`);
    }
  }
}