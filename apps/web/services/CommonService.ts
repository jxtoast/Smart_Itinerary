import { BaseFetchStrategy } from "@/services/BaseFetchStrategy";
import { TravelTypeFetchStrategy } from "@/services/TravelTypeFetchStrategy";
import { FetchStrategyFactory } from "@/services/FetchStrategyFactory";
import { FactoryType } from "@/types/FactoryType";

export class CommonService {

    static async fetchDataStrategy(factoryType: FactoryType) {
        const dataFetcher = new BaseFetchStrategy(
            new TravelTypeFetchStrategy(),
            new FetchStrategyFactory()
        );
        dataFetcher.setStrategy(factoryType)
        return await dataFetcher.fetchData()
    };


}