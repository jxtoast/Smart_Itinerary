import { FactoryType } from '@/types/FactoryType';
import { IBaseFetchStrategy } from '@/types/IBaseFetchStrategy';
import { IFetchStrategyFactory } from '@/types/IFetchStrategyFactory';

export class BaseFetchStrategy {
  private strategy: IBaseFetchStrategy;
  private factoryStrategy: IFetchStrategyFactory;

  constructor(strategy: IBaseFetchStrategy, factoryStrategy: IFetchStrategyFactory) {
    this.strategy = strategy;
    this.factoryStrategy = factoryStrategy;
  }

  setStrategy(factoryType: FactoryType) {
    const strategyCreated = this.factoryStrategy.createStrategy(factoryType);
    this.strategy = strategyCreated;
  }

  async fetchData<T>(): Promise<T | null> {
    if (!this.strategy) {
      console.warn("No strategy set for fetching data.");
      return null;
    }
    try {
      return this.strategy.fetchData();
    } catch (error) {
      console.error("Error fetching data:", error);
      return null;
    }
  }
}
