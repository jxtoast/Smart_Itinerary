import { IBaseFetchStrategy } from '@/types/IBaseFetchStrategy';
import { FactoryType } from '@/types/FactoryType';

export interface IFetchStrategyFactory{
    createStrategy(factoryType: FactoryType): IBaseFetchStrategy
}