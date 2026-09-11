export interface GeminiConfig {
    temperature?: number, //More creative & less deterministic
    topP?: number, // Reduce nonsencial tokens being generate
    topK?: number, // Reduce randomness
    maxOutputTokens?: number, 
    responseMimeType?: string,
    response_schema?: Record<string, any>
}