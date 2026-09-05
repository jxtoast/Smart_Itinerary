import type { Pool } from "pg";
import {
  Country,
  FactoryType,
  IBaseFetchStrategy,
  IFetchStrategyFactory,
  TravelType,
  createLogger,
  query,
} from "@smart/shared";

const logger = createLogger("gemini-service");

/**
 * Reference-data fetch strategies (moved from the monolith's
 * apps/web/services/{CountryFetchStrategy,TravelTypeFetchStrategy,
 * BaseFetchStrategy,FetchStrategyFactory}.ts, which read the central Supabase
 * instance — now the tables live in this service's own gemini-db, matching
 * the database-per-service rule; DDL + seed: db/init/gemini-service.sql).
 *
 * The web plan-itinerary page needs both lists to render its form:
 *   - countries (+ their hub airport code, used to build flight searches)
 *   - travel types (solo / couple / family ... options)
 */

// ---------------------------------------------------------------------------
// Row types — snake_case as Postgres returns them (camelCase ↔ snake_case
// mapping happens in each strategy's mapper, as in the monolith).
// ---------------------------------------------------------------------------

type CountryWithAirportRow = {
  id: string | number;
  country_code: string | null;
  country_name: string | null;
  airport_code: string | null;
};

type TravelTypeRow = {
  id: string | number;
  type_name: string | null;
  type_code: string | null;
  number_of_people: string | null;
};

/**
 * Countries with one hub airport each (the flight search takes one airport
 * code per country — the seed keeps exactly one per country, so a plain
 * inner join reproduces the monolith's `airport!inner` nested shape).
 */
export class CountryFetchStrategy implements IBaseFetchStrategy {
  constructor(private readonly pool: Pool) {}

  async fetchData(): Promise<Country[]> {
    const rows = await query<CountryWithAirportRow>(
      this.pool,
      `SELECT c.id, c.country_code, c.country_name, a.airport_code
       FROM country c
       JOIN airport a ON a.country_id = c.id
       ORDER BY c.country_name`
    );
    return rows.map((row) => ({
      id: String(row.id),
      country_code: row.country_code ?? "",
      country_name: row.country_name ?? "",
      airport: { airport_code: row.airport_code ?? "" },
    }));
  }
}

/** Travel-type options for the "who is travelling" select. */
export class TravelTypeFetchStrategy implements IBaseFetchStrategy {
  constructor(private readonly pool: Pool) {}

  async fetchData(): Promise<TravelType[]> {
    const rows = await query<TravelTypeRow>(
      this.pool,
      `SELECT id, type_name, type_code, number_of_people
       FROM travel_type
       ORDER BY id`
    );
    return rows.map((row) => ({
      id: String(row.id),
      type_name: row.type_name ?? "",
      type_code: row.type_code ?? "",
      number_of_people: row.number_of_people ?? "",
    }));
  }
}

/**
 * Context object of the strategy pattern (port of the monolith's
 * BaseFetchStrategy): callers set which reference type they want, then ask
 * for the data without knowing which table was read. A fetch failure is
 * logged and reported as null — the route layer turns that into a 502.
 */
export class BaseFetchStrategy {
  private strategy: IBaseFetchStrategy;
  private factoryStrategy: IFetchStrategyFactory;

  constructor(strategy: IBaseFetchStrategy, factoryStrategy: IFetchStrategyFactory) {
    this.strategy = strategy;
    this.factoryStrategy = factoryStrategy;
  }

  setStrategy(factoryType: FactoryType): void {
    this.strategy = this.factoryStrategy.createStrategy(factoryType);
  }

  async fetchData<T>(): Promise<T | null> {
    if (!this.strategy) {
      logger.warn("No strategy set for fetching reference data.");
      return null;
    }
    try {
      // await inside the try so a rejected fetch is caught, not just sync throws
      return (await this.strategy.fetchData()) as T;
    } catch (error) {
      logger.error({ err: error }, "Error fetching reference data");
      return null;
    }
  }
}

/** Creates the concrete strategy for a requested reference type. */
export class FetchStrategyFactory implements IFetchStrategyFactory {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  createStrategy(factoryType: FactoryType): IBaseFetchStrategy {
    switch (factoryType) {
      case FactoryType.TRAVEL:
        return new TravelTypeFetchStrategy(this.pool);
      case FactoryType.COUNTRY:
        return new CountryFetchStrategy(this.pool);
      default:
        throw new Error(`Unknown factory type: ${factoryType}`);
    }
  }
}
