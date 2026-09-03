import { IBaseFetchStrategy } from './IBaseFetchStrategy';
import { FactoryType } from './FactoryType';

export interface IFetchStrategyFactory{
    createStrategy(factoryType: FactoryType): IBaseFetchStrategy
}