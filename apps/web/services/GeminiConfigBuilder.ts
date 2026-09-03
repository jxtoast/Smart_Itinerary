import { GeminiConfig } from "@/types/GeminiConfig";

export class GeminiConfigBuilder {
  private config: GeminiConfig = {};

  public withTemperature(temperature: number): this {
    this.config.temperature = temperature;
    return this;
  }

  public withTopP(topP: number): this {
    this.config.topP = topP;
    return this;
  }

  public withTopK(topK: number): this {
    this.config.topK = topK;
    return this;
  }

  public withMaxOutputTokens(maxOutputTokens: number): this {
    this.config.maxOutputTokens = maxOutputTokens;
    return this;
  }

  public withResponseMimeType(responseMimeType: string): this {
    this.config.responseMimeType = responseMimeType;
    return this;
  }

  public withResponseSchema(response_schema: Record<string, any>): this {
    this.config.response_schema = response_schema;
    return this;
  }

  public build(): GeminiConfig {
    return this.config;
  }
}